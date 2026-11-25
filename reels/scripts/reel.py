#!/usr/bin/env python3
"""Innometrics reel renderer.

Subcommands (run in order; every step reads/writes WORKDIR):
  cut      raw.mp4 + cuts.json  -> cut.mp4 (1080x1920, 30 fps) + voice.wav
  plan     words.json + cuts.json + brief.json -> timeline.json (editable)
  preview  timeline.json -> preview_*.png at the intro / chart / counter / outro moments
  render   timeline.json -> final.mp4 (H.264 + AAC, voice + ducked beat + SFX)

Layer order per frame (bottom -> top):
  original background -> BEHIND layer (gradient panel + IM logo + line chart)
  -> segmented person -> FRONT layer (counters, chips, measurement, captions)
"""
import argparse, json, math, os, re, subprocess, sys, shutil

import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, "..", "assets"))
W, H, FPS = 1080, 1920, 30

NAVY = (11, 20, 64)
PURPLE = (107, 63, 214)
PURPLE_HI = (150, 112, 255)   # lighter tint of brand purple, legible on video
WHITE = (255, 255, 255)

FONT_WIDE = os.path.join(ASSETS, "Michroma.ttf")
FONT_BOLD = os.path.join(ASSETS, "Syncopate-Bold.ttf")


# ----------------------------------------------------------------- helpers
def sh(cmd, **kw):
    print("+", " ".join(str(c) for c in cmd)[:300], file=sys.stderr)
    return subprocess.run(cmd, check=True, **kw)


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease_out_cubic(p):
    p = clamp(p); return 1 - (1 - p) ** 3


def ease_in_out(p):
    p = clamp(p); return 0.5 - 0.5 * math.cos(math.pi * p)


def ease_out_back(p, s=1.9):
    p = clamp(p); p -= 1
    return 1 + (s + 1) * p ** 3 + s * p ** 2


def window_alpha(t, t0, t1, fin=0.25, fout=0.3):
    if t < t0 or t > t1: return 0.0
    return min(clamp((t - t0) / fin), clamp((t1 - t) / fout))


def norm(w):
    return re.sub(r"[^\w']+", "", w.lower())


_fonts = {}


def font(path, size):
    k = (path, size)
    if k not in _fonts: _fonts[k] = ImageFont.truetype(path, size)
    return _fonts[k]


def text_w(text, f, spacing):
    if not text: return 0
    return sum(f.getlength(c) for c in text) + spacing * (len(text) - 1)


def draw_spaced(d, x, y, text, f, fill, spacing, **kw):
    for c in text:
        d.text((x, y), c, font=f, fill=fill, **kw)
        x += f.getlength(c) + spacing
    return x


def blend(dst, rgba, x, y, opacity=1.0):
    """Alpha-blend an RGBA uint8 array (or PIL image) onto float32 RGB dst at (x, y)."""
    if opacity <= 0.001: return
    if isinstance(rgba, Image.Image): rgba = np.asarray(rgba)
    h, w = rgba.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(dst.shape[1], x + w), min(dst.shape[0], y + h)
    if x1 <= x0 or y1 <= y0: return
    src = rgba[y0 - y:y1 - y, x0 - x:x1 - x].astype(np.float32)
    a = src[..., 3:4] * (opacity / 255.0)
    reg = dst[y0:y1, x0:x1]
    reg *= (1 - a); reg += src[..., :3] * a


def vgrad(w, h, c0, c1, a0=255, a1=255):
    t = np.linspace(0, 1, h)[:, None, None]
    rgb = np.array(c0)[None, None] * (1 - t) + np.array(c1)[None, None] * t
    a = (a0 * (1 - t) + a1 * t)
    arr = np.concatenate([np.repeat(rgb, w, 1), np.repeat(a, w, 1)], 2)
    return arr.astype(np.uint8)


def rounded_mask(w, h, r, ss=2):
    m = Image.new("L", (w * ss, h * ss), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w * ss - 1, h * ss - 1], r * ss, fill=255)
    return m.resize((w, h), Image.LANCZOS)


# --------------------------------------------------------------- STEP: cut
def detect_face_centers(path, times, landmarker_path):
    import mediapipe as mp
    from mediapipe.tasks.python import vision, BaseOptions
    lm = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=landmarker_path), num_faces=1))
    xs, ys = [], []
    tmp = os.path.join(os.path.dirname(path) or ".", ".probe_frame.png")
    for t in times:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", path, "-frames:v", "1", tmp], check=True)
        img = cv2.cvtColor(cv2.imread(tmp), cv2.COLOR_BGR2RGB)
        r = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img)))
        if r.face_landmarks:
            p = np.array([[q.x, q.y] for q in r.face_landmarks[0]])
            xs.append(p[:, 0].mean()); ys.append(p[:, 1].mean())
    if os.path.exists(tmp): os.remove(tmp)
    lm.close()
    return (float(np.median(xs)) if xs else 0.5, float(np.median(ys)) if ys else 0.4)


def cmd_cut(a):
    cuts = json.load(open(os.path.join(a.workdir, "cuts.json")))
    raw = a.video or cuts["source"]
    info = probe(raw)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    has_audio = any(s["codec_type"] == "audio" for s in info["streams"])
    keep = cuts["keep"]
    mid = [(k["start"] + k["end"]) / 2 for k in keep]
    sample = [mid[int(i)] for i in np.linspace(0, len(mid) - 1, min(6, len(mid)))]
    fx, fy = detect_face_centers(raw, sample, os.path.join(ASSETS, "face_landmarker.task"))
    print(f"face center (normalized): x={fx:.2f} y={fy:.2f}", file=sys.stderr)

    parts, labels = [], []
    for i, k in enumerate(keep):
        s, e = k["start"], k["end"]
        parts.append(f"[0:v]trim={s:.3f}:{e:.3f},setpts=PTS-STARTPTS[v{i}]")
        if has_audio:
            d = e - s
            parts.append(f"[0:a]atrim={s:.3f}:{e:.3f},asetpts=PTS-STARTPTS,"
                         f"afade=t=in:d=0.012,afade=t=out:st={max(0, d - 0.015):.3f}:d=0.015[a{i}]")
            labels.append(f"[v{i}][a{i}]")
        else:
            labels.append(f"[v{i}]")
    n = len(keep)
    parts.append("".join(labels) + f"concat=n={n}:v=1:a={1 if has_audio else 0}" + ("[vc][ac]" if has_audio else "[vc]"))
    # cover-scale to 1080x1920, crop centered on the face
    parts.append(
        f"[vc]fps={FPS},scale=w='if(gt(iw/ih,{W}/{H}),-2,{W})':h='if(gt(iw/ih,{W}/{H}),{H},-2)':flags=lanczos,"
        f"crop={W}:{H}:x='clip(iw*{fx:.4f}-{W}/2,0,iw-{W})':y='clip(ih*{fy:.4f}-{H}*0.38,0,ih-{H})',"
        f"setsar=1,format=yuv420p[vout]")
    fc = ";".join(parts)
    out = os.path.join(a.workdir, "cut.mp4")
    cmd = ["ffmpeg", "-v", "error", "-stats", "-y", "-i", raw, "-filter_complex", fc, "-map", "[vout]"]
    if has_audio: cmd += ["-map", "[ac]", "-c:a", "pcm_s16le", "-ar", "48000"]
    cmd += ["-c:v", "libx264", "-preset", "fast", "-crf", "12", out.replace(".mp4", ".mkv")]
    sh(cmd)
    os.replace(out.replace(".mp4", ".mkv"), out.replace(".mp4", ".mkv"))
    mkv = out.replace(".mp4", ".mkv")
    if has_audio:
        sh(["ffmpeg", "-v", "error", "-y", "-i", mkv, "-vn", "-c:a", "pcm_s16le", os.path.join(a.workdir, "voice.wav")])
    sh(["ffmpeg", "-v", "error", "-y", "-i", mkv, "-an", "-c:v", "copy", out])
    os.remove(mkv)
    dur = float(probe(out)["format"]["duration"])
    print(f"cut.mp4: {dur:.2f}s", file=sys.stderr)


# -------------------------------------------------------------- STEP: plan
def remap_words(words, cuts):
    removed_fill = {(r["start"], r["end"]) for r in cuts["removed"] if r["reason"] == "filler"}
    out, off = [], 0.0
    for k in cuts["keep"]:
        for w in words:
            m = (w["start"] + w["end"]) / 2
            if k["start"] <= m <= k["end"] and (w["start"], w["end"]) not in removed_fill:
                out.append({"w": w["w"], "start": round(max(0, w["start"] - k["start"]) + off, 3),
                            "end": round(min(k["end"], w["end"]) - k["start"] + off, 3)})
        off += k["end"] - k["start"]
    return out, off


def caption_chunks(words, max_words=3, max_chars=18):
    chunks, cur = [], []
    for w in words:
        txt = re.sub(r"[^\w'€%.,\-]", "", w["w"]).upper().strip(",")
        if not txt: continue
        w2 = dict(w, w=txt.rstrip(".")) if not re.match(r"^\d", txt) else dict(w, w=txt)
        brk = cur and (len(cur) >= max_words or w["start"] - cur[-1]["end"] > 0.35
                       or len(" ".join(x["w"] for x in cur + [w2])) > max_chars
                       or re.search(r"[.!?]$", cur[-1]["raw"]))
        if brk: chunks.append(cur); cur = []
        w2["raw"] = w["w"]; cur.append(w2)
    if cur: chunks.append(cur)
    res = []
    for i, c in enumerate(chunks):
        nxt = chunks[i + 1][0]["start"] if i + 1 < len(chunks) else c[-1]["end"] + 0.6
        res.append({"start": c[0]["start"], "end": round(min(nxt, c[-1]["end"] + 0.6), 3),
                    "words": [{"w": x["w"], "start": x["start"], "end": x["end"]} for x in c]})
    return res


def find_kw(words, keywords, after, taken, span):
    kws = [norm(k) for k in keywords]
    for w in words:
        if w["start"] < after: continue
        n = norm(w["w"])
        if any(n == k or (len(k) >= 4 and n.startswith(k)) for k in kws):
            if all(abs(w["start"] - t) >= span for t in taken):
                return w["start"]
    return None


def free_slots(n, t0, t1, taken, span):
    """Evenly spread n start times in [t0, t1] that avoid `taken` by `span`."""
    res = []
    if n <= 0 or t1 <= t0: return [t0] * n
    cands = list(np.linspace(t0, t1, max(n * 6, 12)))
    for k in range(n):
        target = t0 + (t1 - t0) * (k + 0.5) / n
        best = min(cands, key=lambda c: (any(abs(c - t) < span for t in taken + res), abs(c - target)))
        res.append(float(best))
    return sorted(res)


def cmd_plan(a):
    wd = a.workdir
    brief = json.load(open(a.brief))
    cuts = json.load(open(os.path.join(wd, "cuts.json")))
    words = json.load(open(os.path.join(wd, "words.json")))["words"]
    main_dur = float(probe(os.path.join(wd, "cut.mp4"))["format"]["duration"])
    intro, outro = brief.get("intro_seconds", 1.0), brief.get("outro_seconds", 1.5)
    tw, _ = remap_words(words, cuts)
    ov = brief.get("overrides", {})
    after = intro + 0.4
    usable_end = max(after + 1, main_dur - 1.2)

    # counters
    counters, taken = [], []
    for s in brief["specs"]:
        t = ov.get(s["id"]) or find_kw(tw, s.get("keywords", []), after, taken, 2.8)
        counters.append(dict(s, start=t, auto=t is None)); taken += [t] if t is not None else []
    missing = [c for c in counters if c["start"] is None]
    for c, t in zip(missing, free_slots(len(missing), after, usable_end - 2.4, taken, 2.8)):
        c["start"] = round(t, 3); taken.append(t)
    for c in counters: c["end"] = round(min(c["start"] + 2.6, main_dur), 3)

    chips, ctaken = [], []
    for c in brief["chips"]:
        t = ov.get(c["text"]) or find_kw(tw, c.get("keywords", []), after, ctaken, 0.6)
        chips.append({"text": c["text"], "start": t, "auto": t is None})
        if t is not None: ctaken.append(t)
    missing = [c for c in chips if c["start"] is None]
    for c, t in zip(missing, free_slots(len(missing), after, usable_end - 2.0, ctaken, 1.0)):
        c["start"] = round(t, 3); ctaken.append(t)
    chips.sort(key=lambda c: c["start"])
    for c in chips: c["end"] = round(min(c["start"] + 2.8, main_dur), 3)

    ch = brief.get("chart", {})
    t = ov.get("chart") or find_kw(tw, ch.get("keywords", []), after, [], 0) or after
    chart = {"label": ch.get("label", ""), "start": round(t, 3),
             "end": round(min(t + ch.get("duration", 3.2), main_dur), 3)}

    me = brief.get("measure", {})
    t = ov.get("measure") or find_kw(tw, me.get("keywords", []), after, taken, 2.6)
    if t is None: t = free_slots(1, after, usable_end - 2.6, taken, 2.6)[0]
    measure = {"label": me.get("label", ""), "start": round(t, 3),
               "end": round(min(t + me.get("duration", 2.6), main_dur), 3)}

    sfx = [{"file": "tick.wav", "t": x, "gain": 0.8} for x in (0.08, 0.30, 0.52)]
    sfx += [{"file": "whoosh.wav", "t": 0.62, "gain": 0.7}, {"file": "whoosh.wav", "t": max(0, chart["start"] - 0.1), "gain": 0.35}]
    sfx += [{"file": "pop.wav", "t": c["start"], "gain": 0.55} for c in chips]
    for c in counters:
        sfx += [{"file": "whoosh.wav", "t": max(0, c["start"] - 0.08), "gain": 0.5},
                {"file": "pop.wav", "t": c["start"] + 0.9, "gain": 0.45}]
    sfx += [{"file": "whoosh.wav", "t": measure["start"], "gain": 0.4},
            {"file": "riser.wav", "t": max(0, main_dur - 0.85), "gain": 0.6},
            {"file": "pop.wav", "t": main_dur + 0.35, "gain": 0.5}]

    tl = {"main_duration": round(main_dur, 3), "intro": intro, "outro": outro,
          "total": round(main_dur + outro, 3), "handle": brief.get("handle", "@innometrics.wear"),
          "captions": caption_chunks(tw), "counters": counters, "chips": chips,
          "chart": chart, "measure": measure, "sfx": sorted(sfx, key=lambda s: s["t"])}
    json.dump(tl, open(os.path.join(wd, "timeline.json"), "w"), ensure_ascii=False, indent=1)
    print(f"timeline.json: main {main_dur:.2f}s + outro {outro}s = {tl['total']:.2f}s")
    for c in counters: print(f"  counter {c['label']:<8} @ {c['start']:.2f}s {'(auto-placed)' if c['auto'] else '(keyword)'}")
    for c in chips: print(f"  chip    {c['text']:<16} @ {c['start']:.2f}s {'(auto-placed)' if c['auto'] else '(keyword)'}")
    print(f"  chart   @ {chart['start']:.2f}s   measure @ {measure['start']:.2f}s")


# ---------------------------------------------------------- frame tracking
class Tracker:
    """Per-frame person mask (temporally smoothed + feathered) and face landmarks."""
    FACE_IDX = {"l": 127, "r": 356, "lb": 70, "rb": 300, "le": 33, "re": 263, "top": 10, "chin": 152}

    def __init__(self, mask_ema=0.5):
        import mediapipe as mp
        from mediapipe.tasks.python import vision, BaseOptions
        self.mp = mp
        self.seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
            base_options=BaseOptions(model_asset_path=os.path.join(ASSETS, "selfie_segmenter.tflite")),
            running_mode=vision.RunningMode.VIDEO, output_confidence_masks=True))
        self.lm = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=os.path.join(ASSETS, "face_landmarker.task")),
            running_mode=vision.RunningMode.VIDEO, num_faces=1))
        self.prev_mask = None; self.face = None; self.ema = mask_ema; self.k = 0

    def step(self, rgb, ts_ms, reset=False):
        small = np.ascontiguousarray(cv2.resize(rgb, (W // 2, H // 2), interpolation=cv2.INTER_AREA))
        img = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=small)
        r = self.seg.segment_for_video(img, ts_ms)
        m = r.confidence_masks[-1].numpy_view().astype(np.float32)
        if m.shape != small.shape[:2]: m = cv2.resize(m, (W // 2, H // 2))
        if self.prev_mask is not None and not reset:
            # temporal smoothing: stronger where the mask is changing little (edges flicker)
            diff = np.abs(m - self.prev_mask)
            k = np.clip(self.ema + diff * 0.8, self.ema, 1.0)
            m = self.prev_mask * (1 - k) + m * k
        self.prev_mask = m
        hard = np.clip((m - 0.3) / 0.45, 0, 1)
        hard = cv2.GaussianBlur(hard, (0, 0), 2.0)          # feather
        mask = cv2.resize(hard, (W, H), interpolation=cv2.INTER_LINEAR)

        if self.k % 2 == 0 or reset:
            fr = self.lm.detect_for_video(img, ts_ms)
            if fr.face_landmarks:
                p = np.array([[q.x * W, q.y * H] for q in fr.face_landmarks[0]], np.float32)
                f = {k: p[i] for k, i in self.FACE_IDX.items()}
                f["box"] = np.array([p[:, 0].min(), p[:, 1].min(), p[:, 0].max(), p[:, 1].max()])
                if self.face is None or reset:
                    self.face = f
                else:
                    self.face = {k: self.face[k] * 0.5 + f[k] * 0.5 for k in f}
            elif reset:
                self.face = None
        self.k += 1
        return mask, self.face


# ---------------------------------------------------------------- graphics
class GFX:
    PANEL = (64, 150, W - 64, 1380)

    def __init__(self, tl):
        self.tl = tl
        x0, y0, x1, y1 = self.PANEL
        pw, ph = x1 - x0, y1 - y0
        g = vgrad(pw, ph, NAVY, PURPLE, 238, 235)
        # soft glow bottom like the brand poster
        yy, xx = np.mgrid[0:ph, 0:pw]
        glow = np.exp(-(((xx - pw / 2) / (pw * 0.45)) ** 2 + ((yy - ph) / (ph * 0.35)) ** 2))
        g[..., :3] = np.clip(g[..., :3] + glow[..., None] * np.array([90, 50, 120]), 0, 255)
        # faint grid
        for gx in range(0, pw, 90): g[:, gx, :3] = np.minimum(255, g[:, gx, :3] * 0.85 + 30)
        for gy in range(0, ph, 90): g[gy, :, :3] = np.minimum(255, g[gy, :, :3] * 0.85 + 30)
        pm = np.asarray(rounded_mask(pw, ph, 56)).astype(np.float32) / 255
        g[..., 3] = (g[..., 3] * pm).astype(np.uint8)
        panel = Image.fromarray(g)
        bd = Image.new("RGBA", (pw, ph)); ImageDraw.Draw(bd).rounded_rectangle([1, 1, pw - 2, ph - 2], 56, outline=(255, 255, 255, 50), width=2)
        panel.alpha_composite(bd)
        logo = Image.open(os.path.join(ASSETS, "im_mark.png")).convert("RGBA")
        lw = 190; logo = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
        panel.alpha_composite(logo, ((pw - lw) // 2, 46))
        self.panel = np.asarray(panel)

        # intro bg: navy radial
        yy, xx = np.mgrid[0:H, 0:W]
        r = np.sqrt(((xx - W / 2) / W) ** 2 + ((yy - H * 0.4) / H) ** 2)
        c0, c1 = np.array([24, 34, 96.]), np.array([5, 8, 28.])
        k = np.clip(r / 0.7, 0, 1)[..., None]
        self.intro_bg = (c0 * (1 - k) + c1 * k).astype(np.float32)

        # outro bg: navy -> purple with bottom glow (poster style)
        o = vgrad(W, H, (6, 10, 34), PURPLE, 255, 255)[..., :3].astype(np.float32)
        glow = np.exp(-(((xx - W / 2) / (W * 0.6)) ** 2 + ((yy - H) / (H * 0.28)) ** 2))
        o += glow[..., None] * np.array([150, 90, 160.])
        self.outro_bg = np.clip(o, 0, 255)
        self.logo_full = Image.open(os.path.join(ASSETS, "im_logo_full.png")).convert("RGBA")

    # ---------------- behind layer
    def behind(self, out, t):
        tl = self.tl; intro = tl["intro"]
        p = ease_out_cubic((t - intro) / 0.5)
        if p <= 0: return
        x0, y0, _, _ = self.PANEL
        blend(out, self.panel, x0, int(y0 + (1 - p) * 80), p)
        ch = tl["chart"]
        a = window_alpha(t, ch["start"], ch["end"], 0.2, 0.4)
        if a > 0: blend(out, self.chart(t - ch["start"], ch["label"]), x0 + 40, y0 + 330, a * p)

    def chart(self, tt, label):
        w, h = W - 2 * 64 - 80, 430
        im = Image.new("RGBA", (w, h)); d = ImageDraw.Draw(im)
        f = font(FONT_WIDE, 22)
        draw_spaced(d, 8, 0, label, f, (255, 255, 255, 210), 6)
        top, bot = 60, h - 20
        for i in range(4):
            y = top + (bot - top) * i / 3
            d.line([(0, y), (w, y)], fill=(255, 255, 255, 40), width=1)
        xs = np.linspace(10, w - 10, 40)
        base = np.linspace(0.15, 0.92, 40) ** 1.3
        wig = 0.06 * np.sin(np.linspace(0, 9, 40)) + 0.03 * np.sin(np.linspace(0, 23, 40))
        ys = bot - (bot - top) * np.clip(base + wig, 0.05, 0.95)
        p = ease_in_out(tt / 1.3)
        n = max(2, int(p * (len(xs) - 1)) + 1)
        frac = p * (len(xs) - 1) - (n - 1) if n < len(xs) else 0
        pts = [(xs[i], ys[i]) for i in range(n)]
        if 0 < frac < 1 and n < len(xs):
            pts.append((xs[n - 1] + (xs[n] - xs[n - 1]) * frac, ys[n - 1] + (ys[n] - ys[n - 1]) * frac))
        # area fill
        area = Image.new("L", (w, h), 0)
        ImageDraw.Draw(area).polygon(pts + [(pts[-1][0], bot), (pts[0][0], bot)], fill=255)
        grad = vgrad(w, h, PURPLE_HI, PURPLE, 120, 0)
        grad[..., 3] = (grad[..., 3].astype(np.float32) * np.asarray(area) / 255).astype(np.uint8)
        im.alpha_composite(Image.fromarray(grad))
        glow = Image.new("RGBA", (w, h)); ImageDraw.Draw(glow).line(pts, fill=PURPLE_HI + (255,), width=12, joint="curve")
        im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(8)))
        d.line(pts, fill=(255, 255, 255, 255), width=5, joint="curve")
        hx, hy = pts[-1]
        d.ellipse([hx - 11, hy - 11, hx + 11, hy + 11], fill=PURPLE_HI + (255,), outline=WHITE + (255,), width=3)
        return im

    # ---------------- front layer
    def front(self, out, t, face):
        tl = self.tl
        if t < tl["main_duration"]:
            self.measure(out, t, face)
            self.counters(out, t, face)
            self.chips(out, t)
        self.captions(out, t, face)

    def caption_y(self, face):
        y = 1560
        if face is not None and face["box"][3] > 1420: y = 1700
        return y

    def captions(self, out, t, face):
        if t >= self.tl["main_duration"] + 0.05: return
        chunk = next((c for c in self.tl["captions"] if c["start"] <= t < c["end"]), None)
        if not chunk: return
        size, sp = 66, 8
        words = chunk["words"]
        while True:
            f = font(FONT_WIDE, size)
            gap = f.getlength(" ") + sp * 2
            tw_ = sum(text_w(w["w"], f, sp) for w in words) + gap * (len(words) - 1)
            if tw_ <= W - 120 or size <= 38: break
            size -= 4
        ch_h = int(size * 1.9)
        im = Image.new("RGBA", (W, ch_h)); d = ImageDraw.Draw(im)
        sh_ = Image.new("RGBA", (W, ch_h)); ds = ImageDraw.Draw(sh_)
        x = (W - tw_) / 2; base_y = int(size * 0.35)
        for w in words:
            if t < w["start"] - 0.02: break
            cur = w["start"] - 0.02 <= t < w["end"] + 0.05 or w is words[-1] and t >= w["start"]
            nxt_started = any(t >= o["start"] for o in words if o["start"] > w["start"])
            active = cur and not nxt_started
            col = PURPLE_HI + (255,) if active else (255, 255, 255, 255)
            yo = -10 * (1 - ease_out_cubic((t - w["start"]) / 0.14))
            draw_spaced(ds, x, base_y + yo + 4, w["w"], f, (0, 0, 0, 170), sp)
            x2 = draw_spaced(d, x, base_y + yo, w["w"], f, col, sp)
            x = x2 - sp + gap
        sh_ = sh_.filter(ImageFilter.GaussianBlur(7))
        sh_.alpha_composite(im)
        a = clamp((t - chunk["start"]) / 0.08)
        blend(out, sh_, 0, self.caption_y(face) - base_y, a)

    def counters(self, out, t, face):
        for c in self.tl["counters"]:
            a = window_alpha(t, c["start"], c["end"], 0.22, 0.3)
            if a <= 0: continue
            tt = t - c["start"]
            card = self.counter_card(c, tt)
            s = 0.86 + 0.14 * ease_out_back(tt / 0.35)
            if abs(s - 1) > 0.01:
                card = card.resize((max(1, int(card.width * s)), max(1, int(card.height * s))), Image.BILINEAR)
            y = 1215
            if face is not None and face["box"][3] > 1130: y = 150   # close-up: move above head
            blend(out, card, (W - card.width) // 2, y + (240 - card.height) // 2, a)

    def counter_card(self, c, tt):
        cw, chh = 700, 240
        card = Image.new("RGBA", (cw, chh))
        bg = vgrad(cw, chh, NAVY, (40, 22, 100), 225, 225)
        bg[..., 3] = (bg[..., 3] * (np.asarray(rounded_mask(cw, chh, 36)) / 255)).astype(np.uint8)
        card.alpha_composite(Image.fromarray(bg))
        d = ImageDraw.Draw(card)
        d.rounded_rectangle([1, 1, cw - 2, chh - 2], 36, outline=PURPLE_HI + (160,), width=2)
        fl = font(FONT_WIDE, 24)
        lab = c["label"]; draw_spaced(d, (cw - text_w(lab, fl, 10)) / 2, 26, lab, fl, (255, 255, 255, 200), 10)
        p = ease_out_cubic(tt / 0.9)
        val = c.get("value")
        if val:
            v = val * p; dec = c.get("decimals", 0)
            num = f"{v:.{dec}f}" if dec else f"{int(round(v))}"
            final = f"{val:.{dec}f}" if dec else f"{int(val)}"
        else:
            num = final = "XX"
        unit = c.get("unit", "")
        fb, fu = font(FONT_BOLD, 96), font(FONT_WIDE, 34)
        nw = text_w(final, fb, 4); uw = text_w(unit, fu, 6)
        total = nw + 22 + uw
        nx = (cw - total) / 2; ny = 74
        # number: outline that fills with purple from the bottom as it counts
        mask = Image.new("L", (cw, chh), 0)
        draw_spaced(ImageDraw.Draw(mask), nx + (nw - text_w(num, fb, 4)), ny, num, fb, 255, 4)
        fill_h = 60 + 140 * p
        fillm = np.asarray(mask).astype(np.float32) / 255
        rows = np.arange(chh)[:, None]
        filled = (rows >= ny + 150 - fill_h).astype(np.float32)
        gr = vgrad(cw, chh, PURPLE_HI, PURPLE, 255, 255)
        layer = np.zeros((chh, cw, 4), np.uint8)
        layer[..., :3] = gr[..., :3] * filled[..., None] + 255 * (1 - filled[..., None])
        layer[..., 3] = (fillm * (filled * 255 + (1 - filled) * 70)).astype(np.uint8)
        card.alpha_composite(Image.fromarray(layer))
        edge = mask.filter(ImageFilter.MaxFilter(5))
        outline = np.clip(np.asarray(edge).astype(np.int16) - np.asarray(mask), 0, 255).astype(np.uint8)
        ol = np.zeros((chh, cw, 4), np.uint8); ol[..., :3] = 255; ol[..., 3] = outline
        card.alpha_composite(Image.fromarray(ol))
        draw_spaced(d, nx + nw + 22, ny + 52, unit, fu, (255, 255, 255, 235), 6)
        return card

    def chip_img(self, text):
        f = font(FONT_WIDE, 24); sp = 5
        tw_ = text_w(text, f, sp); h = 66; w = int(tw_ + 92)
        im = Image.new("RGBA", (w, h)); d = ImageDraw.Draw(im)
        bg = vgrad(w, h, NAVY, (36, 22, 92), 215, 215)
        bg[..., 3] = (bg[..., 3] * (np.asarray(rounded_mask(w, h, h // 2)) / 255)).astype(np.uint8)
        im.alpha_composite(Image.fromarray(bg))
        d.rounded_rectangle([1, 1, w - 2, h - 2], h // 2, outline=(255, 255, 255, 120), width=2)
        d.ellipse([28, h / 2 - 6, 40, h / 2 + 6], fill=PURPLE_HI + (255,))
        draw_spaced(d, 58, (h - 30) / 2, text, f, (255, 255, 255, 255), sp)
        return im

    def chips(self, out, t):
        active = [c for c in self.tl["chips"] if c["start"] <= t <= c["end"]]
        if not active: return
        imgs = [(c, self.chip_img(c["text"])) for c in active]
        # lay out in centered rows above the captions
        rows, cur, cw = [], [], 0
        for c, im in imgs:
            if cur and cw + im.width + 16 > W - 100: rows.append(cur); cur, cw = [], 0
            cur.append((c, im)); cw += im.width + 16
        rows.append(cur)
        y = 1440 - (len(rows) - 1) * 82
        for row in rows:
            rw = sum(im.width for _, im in row) + 16 * (len(row) - 1); x = (W - rw) // 2
            for c, im in row:
                tt = t - c["start"]
                s = max(0.05, ease_out_back(tt / 0.38, 2.4))
                a = window_alpha(t, c["start"], c["end"], 0.12, 0.3)
                sim = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.BILINEAR) if abs(s - 1) > 0.01 else im
                blend(out, sim, x + (im.width - sim.width) // 2, y + (im.height - sim.height) // 2, a)
                x += im.width + 16
            y += 82

    def measure(self, out, t, face):
        m = self.tl["measure"]
        a = window_alpha(t, m["start"], m["end"], 0.1, 0.35)
        if a <= 0 or face is None: return
        tt = t - m["start"]
        L, R = face["l"].astype(float), face["r"].astype(float)
        brow = (face["lb"] + face["rb"]) / 2; eye = (face["le"] + face["re"]) / 2
        v = R - L; ln = np.linalg.norm(v) + 1e-6; u = v / ln; nrm = np.array([u[1], -u[0]])
        if nrm[1] > 0: nrm = -nrm
        lift = abs(float(np.dot(eye - brow, nrm))) * 0.9 + 18
        # extend slightly past the temples (frame is wider than the face edge points)
        P0 = L - u * ln * 0.04 + nrm * lift; P1 = R + u * ln * 0.04 + nrm * lift
        # draw into a local canvas
        pad = 160
        bx0 = int(min(P0[0], P1[0]) - pad); by0 = int(min(P0[1], P1[1]) - pad)
        cw = int(abs(P1[0] - P0[0]) + 2 * pad); chh = int(abs(P1[1] - P0[1]) + 2 * pad)
        im = Image.new("RGBA", (cw, chh)); gl = Image.new("RGBA", (cw, chh))
        d = ImageDraw.Draw(im); dg = ImageDraw.Draw(gl)
        o = np.array([bx0, by0])
        A = P0 - o; B = P1 - o
        p = ease_in_out(tt / 0.65)
        E = A + (B - A) * p
        dg.line([tuple(A), tuple(E)], fill=PURPLE_HI + (255,), width=10)
        d.line([tuple(A), tuple(E)], fill=(255, 255, 255, 255), width=3)
        tick = nrm * 18
        for Q, show in ((A, True), (B, p >= 0.999)):
            if show:
                d.line([tuple(Q - tick), tuple(Q + tick)], fill=(255, 255, 255, 255), width=3)
        # travelling end marker
        d.ellipse([E[0] - 7, E[1] - 7, E[0] + 7, E[1] + 7], fill=PURPLE_HI + (255,), outline=(255, 255, 255, 255), width=2)
        im = Image.alpha_composite(gl.filter(ImageFilter.GaussianBlur(5)), im)
        blend(out, im, bx0, by0, a)
        la = clamp((tt - 0.55) / 0.25)
        if la > 0 and m["label"]:
            f = font(FONT_WIDE, 24); sp = 6
            lw = int(text_w(m["label"], f, sp) + 48); lh = 52
            lab = Image.new("RGBA", (lw, lh)); dl = ImageDraw.Draw(lab)
            dl.rounded_rectangle([0, 0, lw - 1, lh - 1], lh // 2, fill=NAVY + (215,), outline=PURPLE_HI + (200,), width=2)
            draw_spaced(dl, 24, (lh - 28) / 2, m["label"], f, (255, 255, 255, 255), sp)
            mid = (P0 + P1) / 2 + nrm * 58
            blend(out, lab, int(mid[0] - lw / 2), int(mid[1] - lh / 2 - 8 * (1 - la)), a * la)

    # ---------------- intro / outro
    def intro_compose(self, frame, mask, t):
        """0..intro: cut-out flashes over navy, then the full shot fades in."""
        bg = self.intro_bg.copy()
        flashes = [(0.08, 0.17), (0.30, 0.39), (0.52, 0.64)]
        on = any(a <= t < b for a, b in flashes)
        full = ease_in_out((t - 0.70) / 0.30)
        m = mask[..., None]
        if on or full > 0:
            cut_a = 1.0 if (on or full > 0) else 0.0
            person = bg * (1 - m * cut_a) + frame * m * cut_a
            if on:  # slight white rim glow on flash
                rim = cv2.GaussianBlur(mask, (0, 0), 6) - mask
                person += np.clip(rim, 0, 1)[..., None] * 140
            return np.clip(person * (1 - full) + frame * full, 0, 255)
        return bg

    def outro_compose(self, last, t_out):
        tl = self.tl
        x = ease_in_out(t_out / 0.3)
        out = last * (1 - x) + self.outro_bg * x
        lp = ease_out_cubic((t_out - 0.12) / 0.5)
        if lp > 0:
            lw = int(560 * (0.92 + 0.08 * lp))
            logo = self.logo_full.resize((lw, int(self.logo_full.height * lw / self.logo_full.width)), Image.LANCZOS)
            blend(out, logo, (W - lw) // 2, 720 - logo.height // 2, lp)
        hp = ease_out_cubic((t_out - 0.38) / 0.4)
        if hp > 0:
            f = font(FONT_WIDE, 38); sp = 9
            text = tl["handle"].upper()
            tw_ = int(text_w(text, f, sp)); pw, ph = tw_ + 90, 92
            pill = Image.new("RGBA", (pw, ph)); d = ImageDraw.Draw(pill)
            d.rounded_rectangle([1, 1, pw - 2, ph - 2], ph // 2, fill=(11, 20, 64, 120), outline=(255, 255, 255, 140), width=2)
            draw_spaced(d, 45, (ph - 46) / 2, text, f, (255, 255, 255, 255), sp)
            blend(out, pill, (W - pw) // 2, int(1060 + 20 * (1 - hp)), hp)
        return out


# ------------------------------------------------------------- rendering
def cut_boundaries(workdir):
    cuts = json.load(open(os.path.join(workdir, "cuts.json")))
    b, off = set(), 0.0
    for k in cuts["keep"]:
        b.add(int(round(off * FPS))); off += k["end"] - k["start"]
    return b


def frames(workdir, tl, only=None):
    """Yield (index, t, composed RGB uint8) for the whole reel (or just `only` indices)."""
    g = GFX(tl); tr = Tracker()
    cap = cv2.VideoCapture(os.path.join(workdir, "cut.mp4"))
    n_main = int(round(tl["main_duration"] * FPS)); n_total = int(round(tl["total"] * FPS))
    bounds = cut_boundaries(workdir)
    last_out = None; frame = None; mask = None; face = None
    last_needed = max(only) if only else n_total - 1
    for k in range(n_total):
        if k > last_needed: break
        t = k / FPS
        if k < n_main:
            ok, bgr = cap.read()
            if ok:
                frame_u8 = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
                mask, face = tr.step(frame_u8, int(t * 1000), reset=k in bounds)
                frame = frame_u8.astype(np.float32)
            if only is not None and k not in only and not (only and max(only) >= n_main and k == n_main - 1):
                continue
            if t < tl["intro"]:
                out = g.intro_compose(frame, mask, t)
            else:
                out = frame.copy()
                g.behind(out, t)
                m = mask[..., None]
                out = out * (1 - m) + frame * m
            g.front(out, t, face)
            last_out = out
        else:
            if only is not None and k not in only: continue
            out = g.outro_compose(last_out, t - tl["main_duration"])
        yield k, t, np.clip(out, 0, 255).astype(np.uint8)
    cap.release(); tr.seg.close(); tr.lm.close()


def cmd_preview(a):
    tl = json.load(open(os.path.join(a.workdir, "timeline.json")))
    c0 = tl["counters"][0] if tl["counters"] else None
    moments = {"intro": 0.33,
               "chart": min(tl["chart"]["start"] + 1.1, tl["main_duration"] - 0.1),
               "counter": (c0["start"] + 1.2) if c0 else 2.0,
               "outro": tl["total"] - 0.3}
    if a.at:
        for kv in a.at.split(","):
            k, v = kv.split("="); moments[k] = float(v)
    want = {int(round(v * FPS)): k for k, v in moments.items()}
    outdir = a.out or a.workdir
    for k, t, img in frames(a.workdir, tl, only=set(want)):
        name = want.get(k)
        if name:
            p = os.path.join(outdir, f"preview_{name}.png")
            Image.fromarray(img).save(p); print(f"{p}  (t={t:.2f}s)")


def mix_audio(workdir, tl, out_wav, sfx_dir):
    total = tl["total"]
    inputs = ["-i", os.path.join(workdir, "voice.wav"), "-stream_loop", "-1", "-i", os.path.join(sfx_dir, "beat.wav")]
    fc = [f"[0:a]aresample=48000,highpass=f=75,acompressor=threshold=-22dB:ratio=2.5:attack=5:release=90:makeup=2,"
          f"apad=whole_dur={total:.3f},asplit=2[voice][key]",
          f"[1:a]atrim=0:{total:.3f},volume=0.30,afade=t=in:d=0.4,afade=t=out:st={total - 1.0:.3f}:d=1.0[mus]",
          "[mus][key]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=400:makeup=1[duck]"]
    mix = ["[voice]", "[duck]"]
    for i, s in enumerate(tl["sfx"]):
        inputs += ["-i", os.path.join(sfx_dir, s["file"])]
        ms = int(max(0, s["t"]) * 1000)
        fc.append(f"[{i + 2}:a]adelay={ms}|{ms},volume={s.get('gain', 0.5)}[s{i}]")
        mix.append(f"[s{i}]")
    fc.append("".join(mix) + f"amix=inputs={len(mix)}:normalize=0:duration=first,"
              "loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]")
    sh(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(fc), "-map", "[aout]",
        "-t", f"{total:.3f}", "-ar", "48000", "-ac", "2", out_wav])


def cmd_render(a):
    wd = a.workdir
    tl = json.load(open(os.path.join(wd, "timeline.json")))
    sfx_dir = os.path.join(wd, "sfx")
    if not os.path.exists(os.path.join(sfx_dir, "beat.wav")):
        sh([sys.executable, os.path.join(HERE, "gen_audio.py"), sfx_dir, "--seconds", str(int(tl["total"]) + 4)])
    vid = os.path.join(wd, "video_only.mp4")
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                            "-pix_fmt", "yuv420p", "-r", str(FPS), vid], stdin=subprocess.PIPE)
    n_total = int(round(tl["total"] * FPS))
    for k, t, img in frames(wd, tl):
        enc.stdin.write(img.tobytes())
        if k % 30 == 0: print(f"\rframe {k}/{n_total}", end="", file=sys.stderr, flush=True)
    enc.stdin.close(); enc.wait(); print(file=sys.stderr)
    aud = os.path.join(wd, "mix.wav")
    mix_audio(wd, tl, aud, sfx_dir)
    out = a.out or os.path.join(wd, "final.mp4")
    sh(["ffmpeg", "-v", "error", "-y", "-i", vid, "-i", aud, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", out])
    info = probe(out)
    print(f"{out}: {float(info['format']['duration']):.2f}s, {os.path.getsize(out) / 1e6:.1f} MB")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    p = sp.add_parser("cut"); p.add_argument("workdir"); p.add_argument("--video")
    p = sp.add_parser("plan"); p.add_argument("workdir"); p.add_argument("--brief", required=True)
    p = sp.add_parser("preview"); p.add_argument("workdir"); p.add_argument("--at", help="name=sec,..."); p.add_argument("--out")
    p = sp.add_parser("render"); p.add_argument("workdir"); p.add_argument("--out")
    a = ap.parse_args()
    {"cut": cmd_cut, "plan": cmd_plan, "preview": cmd_preview, "render": cmd_render}[a.cmd](a)


if __name__ == "__main__":
    main()
