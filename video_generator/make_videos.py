#!/usr/bin/env python3
"""
Innometrics: δωρεάν παραγωγή κάθετων βίντεο (9:16) για Reels και TikTok.

Τρέχει με μία εντολή:
    python make_videos.py

Για κάθε σενάριο του scripts.json:
  1. Φωνή με edge-tts (ελληνικές φωνές της Microsoft, δωρεάν, χωρίς κλειδί).
  2. Χρονισμός λέξεων με faster-whisper (τοπικά, στον υπολογιστή σου).
  3. Τυχαία πλάνα από το clips/, κομμένα σε 1080x1920 και ίσα με τη διάρκεια της φωνής.
  4. Μεγάλοι λευκοί υπότιτλοι με μαύρο περίγραμμα στο κέντρο.
  5. Το logo.png πάνω δεξιά, απαλή μουσική από το music/ σε χαμηλή ένταση.
  6. Αποθήκευση στο output/ και συγκεντρωτικό output/captions.txt με λεζάντες και hashtags.

Προαιρετικές παράμετροι:
    python make_videos.py --only 3,7,12   # μόνο αυτά τα σενάρια
    python make_videos.py --force         # ξαναφτιάχνει και όσα υπάρχουν ήδη
"""

from __future__ import annotations

import argparse
import asyncio
import difflib
import json
import random
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unicodedata
from pathlib import Path

# ---------------------------------------------------------------------------
# Ρυθμίσεις: άλλαξε ελεύθερα
# ---------------------------------------------------------------------------
BASE = Path(__file__).resolve().parent
CLIPS_DIR = BASE / "clips"
MUSIC_DIR = BASE / "music"
OUTPUT_DIR = BASE / "output"
SCRIPTS_FILE = BASE / "scripts.json"
LOGO_FILE = BASE / "logo.png"
CAPTIONS_FILE = OUTPUT_DIR / "captions.txt"
FILE_PREFIX = "innometrics"

# Οι δύο ελληνικές φωνές εναλλάσσονται (μονά σενάρια Νέστορας, ζυγά Αθηνά).
VOICES = ["el-GR-NestorasNeural", "el-GR-AthinaNeural"]

# Διάρκεια βίντεο σε δευτερόλεπτα.
MIN_DURATION = 20.0
MAX_DURATION = 40.0
TAIL_SECONDS = 0.8  # λίγη μουσική μετά το τέλος της φωνής

# Βίντεο
WIDTH, HEIGHT, FPS = 1080, 1920, 30
SEGMENT_MIN, SEGMENT_MAX = 1.8, 3.5  # διάρκεια κάθε πλάνου

# Υπότιτλοι
FONT_NAME = "Arial"        # υπάρχει σε όλα τα Windows και έχει ελληνικά
FONT_SIZE = 110
OUTLINE = 7                # πάχος μαύρου περιγράμματος
MAX_WORDS_PER_LINE = 3
MAX_CHARS_PER_LINE = 18

# Λογότυπο
LOGO_WIDTH = 220
LOGO_MARGIN = 50

# Μουσική
MUSIC_VOLUME = 0.12        # 0.0 έως 1.0 (0.12 = απαλά, κάτω από τη φωνή)

# faster-whisper: "small" καλή ισορροπία, "medium" πιο ακριβές αλλά πιο αργό.
WHISPER_MODEL = "small"

# Λέξεις που η ελληνική φωνή προφέρει καλύτερα γραμμένες στα ελληνικά.
# Οι υπότιτλοι κρατούν την αρχική γραφή.
TTS_PRONUNCIATION = {
    "Skroutz": "Σκρουτζ",
    "Innometrics": "Ινομέτρικς",
    "smartglasses": "σμαρτ γκλάσες",
    "Bluetooth": "Μπλουτούθ",
    "hands-free": "χαντς φρι",
    "Hands-free": "Χαντς φρι",
    "podcasts": "πόντκαστ",
    "podcast": "πόντκαστ",
    "audiobooks": "όντιομπουκς",
    "online meetings": "όνλαϊν μίτινγκς",
    "playlist": "πλέιλιστ",
    "gadgets": "γκάτζετς",
    "play": "πλέι",
}

VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm"}
AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}


# ---------------------------------------------------------------------------
# Βοηθητικά
# ---------------------------------------------------------------------------
def log(msg: str) -> None:
    print(msg, flush=True)


def run(cmd: list[str], cwd: Path | None = None) -> None:
    """Τρέχει ffmpeg και δείχνει το σφάλμα του αν αποτύχει."""
    res = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True,
                         encoding="utf-8", errors="replace")
    if res.returncode != 0:
        tail = "\n".join(res.stderr.strip().splitlines()[-25:])
        raise RuntimeError(f"Η εντολή απέτυχε:\n{' '.join(cmd)}\n\n{tail}")


def media_duration(path: Path) -> float:
    res = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True,
    )
    try:
        return float(res.stdout.strip())
    except ValueError:
        return 0.0


def list_files(folder: Path, exts: set[str]) -> list[Path]:
    if not folder.is_dir():
        return []
    return sorted(p for p in folder.iterdir() if p.suffix.lower() in exts)


def check_requirements() -> None:
    missing = [t for t in ("ffmpeg", "ffprobe") if shutil.which(t) is None]
    if missing:
        sys.exit("Δεν βρέθηκε το ffmpeg. Δες το README.md (βήμα 2) για την εγκατάσταση "
                 "και άνοιξε ξανά το παράθυρο εντολών.")
    try:
        import edge_tts  # noqa: F401
        import faster_whisper  # noqa: F401
    except ImportError:
        sys.exit("Λείπουν βιβλιοθήκες Python. Τρέξε: pip install -r requirements.txt")


# ---------------------------------------------------------------------------
# 1. Φωνή (edge-tts)
# ---------------------------------------------------------------------------
def tts_text(text: str) -> str:
    for src in sorted(TTS_PRONUNCIATION, key=len, reverse=True):
        text = re.sub(rf"(?<!\w){re.escape(src)}(?!\w)", TTS_PRONUNCIATION[src], text)
    return text


async def _edge_tts(text: str, voice: str, rate: str, out: Path) -> None:
    import edge_tts
    await edge_tts.Communicate(text, voice, rate=rate).save(str(out))


def synthesize(text: str, voice: str, rate: str, out: Path) -> None:
    last: Exception | None = None
    for attempt in range(4):
        try:
            asyncio.run(_edge_tts(text, voice, rate, out))
            if out.exists() and out.stat().st_size > 0:
                return
        except Exception as exc:  # δίκτυο, προσωρινό σφάλμα της υπηρεσίας
            last = exc
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Το edge-tts απέτυχε (χρειάζεται σύνδεση στο internet): {last!r}")


def make_voice(text: str, voice: str, out: Path) -> float:
    """Φτιάχνει τη φωνή και διορθώνει την ταχύτητα ώστε να χωράει στα 20-40 δευτ."""
    rate = 0
    spoken = tts_text(text)
    for _ in range(4):
        synthesize(spoken, voice, f"{rate:+d}%", out)
        dur = media_duration(out)
        target_max = MAX_DURATION - TAIL_SECONDS - 0.5
        if dur > target_max:
            rate += int((dur / target_max - 1) * 100) + 3
        elif dur < MIN_DURATION - TAIL_SECONDS and rate > -15:
            rate = max(-15, rate - int((1 - dur / MIN_DURATION) * 100) - 2)
        else:
            return dur
        rate = max(-15, min(rate, 50))
    return media_duration(out)


# ---------------------------------------------------------------------------
# 2. Χρονισμός λέξεων (faster-whisper) και ευθυγράμμιση με το σενάριο
# ---------------------------------------------------------------------------
_whisper = None


def whisper_words(audio: Path, prompt: str) -> list[tuple[str, float, float]]:
    global _whisper
    from faster_whisper import WhisperModel
    if _whisper is None:
        log(f"  Φόρτωση faster-whisper ({WHISPER_MODEL}). Την 1η φορά κατεβαίνει το μοντέλο...")
        _whisper = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    segments, _ = _whisper.transcribe(
        str(audio), language="el", word_timestamps=True,
        initial_prompt=prompt[:400], beam_size=5,
    )
    words = []
    for seg in segments:
        for w in seg.words or []:
            if w.word.strip():
                words.append((w.word.strip(), float(w.start), float(w.end)))
    return words


def norm(word: str) -> str:
    word = unicodedata.normalize("NFD", word.lower())
    word = "".join(c for c in word if unicodedata.category(c) != "Mn")
    word = word.replace("ς", "σ")
    return "".join(c for c in word if c.isalnum())


def align(script_words: list[str], heard: list[tuple[str, float, float]],
          audio_dur: float) -> list[tuple[str, float, float]]:
    """Κρατάει τη σωστή ορθογραφία του σεναρίου και παίρνει τους χρόνους από το whisper."""
    n = len(script_words)
    starts: list[float | None] = [None] * n
    ends: list[float | None] = [None] * n

    if heard:
        a = [norm(w) for w in script_words]
        b = [norm(w) for w, _, _ in heard]
        sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
        for i, j, size in sm.get_matching_blocks():
            for k in range(size):
                starts[i + k] = heard[j + k][1]
                ends[i + k] = heard[j + k][2]
        speech_start, speech_end = heard[0][1], heard[-1][2]
    else:
        speech_start, speech_end = 0.1, max(0.5, audio_dur - 0.1)

    # Οι λέξεις που δεν ταίριαξαν μοιράζονται τον χρόνο ανάμεσα στις γειτονικές τους.
    i = 0
    while i < n:
        if starts[i] is not None:
            i += 1
            continue
        j = i
        while j < n and starts[j] is None:
            j += 1
        t0 = ends[i - 1] if i > 0 else speech_start
        t1 = starts[j] if j < n else speech_end
        if t1 <= t0:
            t1 = t0 + 0.25 * (j - i)
        weights = [max(1, len(norm(w))) for w in script_words[i:j]]
        total = sum(weights)
        t = t0
        for k, wgt in zip(range(i, j), weights):
            d = (t1 - t0) * wgt / total
            starts[k], ends[k] = t, t + d
            t += d
        i = j
    return [(w, float(s), float(e)) for w, s, e in zip(script_words, starts, ends)]


# ---------------------------------------------------------------------------
# 3. Υπότιτλοι (ASS)
# ---------------------------------------------------------------------------
def chunk_words(timed: list[tuple[str, float, float]]):
    chunks, cur = [], []
    for w in timed:
        text = " ".join(x[0] for x in cur + [w])
        if cur and (len(cur) >= MAX_WORDS_PER_LINE or len(text) > MAX_CHARS_PER_LINE):
            chunks.append(cur)
            cur = []
        cur.append(w)
        if w[0][-1] in ".,;!?:·…" and len(cur) >= 1:
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    return chunks


def ass_time(t: float) -> str:
    t = max(0.0, t)
    cs = int(round(t * 100))
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def write_ass(timed, path: Path, video_dur: float) -> None:
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {WIDTH}
PlayResY: {HEIGHT}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main,{FONT_NAME},{FONT_SIZE},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,{OUTLINE},3,5,80,80,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    chunks = chunk_words(timed)
    lines = []
    for idx, ch in enumerate(chunks):
        start = ch[0][1]
        if idx + 1 < len(chunks):
            end = min(chunks[idx + 1][0][1], ch[-1][2] + 0.6)
        else:
            end = min(video_dur, ch[-1][2] + 0.8)
        end = max(end, start + 0.3)
        text = " ".join(w for w, _, _ in ch)
        text = text.replace("\\", "").replace("{", "(").replace("}", ")")
        pop = r"{\fad(40,0)\fscx88\fscy88\t(0,110,\fscx100\fscy100)}"
        lines.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Main,,0,0,0,,{pop}{text}")
    path.write_text(header + "\n".join(lines) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# 4. Πλάνα από clips/
# ---------------------------------------------------------------------------
_clip_durations: dict[Path, float] = {}


def build_broll(clips: list[Path], duration: float, work: Path) -> Path:
    for c in clips:
        if c not in _clip_durations:
            _clip_durations[c] = media_duration(c)
    usable = [c for c in clips if _clip_durations[c] > 0.5]
    if not usable:
        raise RuntimeError("Κανένα βίντεο στο clips/ δεν διαβάζεται από το ffmpeg.")

    vf = (f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=increase,"
          f"crop={WIDTH}:{HEIGHT},setsar=1,fps={FPS},format=yuv420p")
    total, idx, last = 0.0, 0, None
    pool: list[Path] = []
    entries = []
    while total < duration + 0.5:
        if not pool:
            pool = usable[:]
            random.shuffle(pool)
            if len(pool) > 1 and pool[0] == last:
                pool.append(pool.pop(0))
        clip = pool.pop(0)
        last = clip
        seg = random.uniform(SEGMENT_MIN, SEGMENT_MAX)
        cdur = _clip_durations[clip]
        out = work / f"seg_{idx:03d}.mp4"
        cmd = ["ffmpeg", "-y", "-v", "error"]
        if cdur < seg + 0.1:
            cmd += ["-stream_loop", "-1", "-i", str(clip)]
        else:
            start = random.uniform(0, cdur - seg)
            cmd += ["-ss", f"{start:.3f}", "-i", str(clip)]
        cmd += ["-t", f"{seg:.3f}", "-vf", vf, "-an", "-c:v", "libx264",
                "-preset", "veryfast", "-crf", "18", str(out)]
        run(cmd)
        entries.append(out.name)
        total += seg
        idx += 1

    concat = work / "list.txt"
    concat.write_text("".join(f"file '{n}'\n" for n in entries), encoding="utf-8")
    return concat


# ---------------------------------------------------------------------------
# 5. Τελικό μοντάζ
# ---------------------------------------------------------------------------
def render(work: Path, voice: Path, music: Path | None, duration: float, out: Path) -> None:
    cmd = ["ffmpeg", "-y", "-v", "error",
           "-f", "concat", "-safe", "0", "-i", "list.txt",
           "-i", str(voice)]
    inputs = 2
    music_idx = logo_idx = None
    if music:
        cmd += ["-stream_loop", "-1", "-i", str(music)]
        music_idx, inputs = inputs, inputs + 1
    if LOGO_FILE.exists():
        cmd += ["-i", str(LOGO_FILE)]
        logo_idx, inputs = inputs, inputs + 1

    f = ["[0:v]ass=subs.ass[vs]"]
    if logo_idx is not None:
        f.append(f"[{logo_idx}:v]scale={LOGO_WIDTH}:-1,format=rgba[lg]")
        f.append(f"[vs][lg]overlay=W-w-{LOGO_MARGIN}:{LOGO_MARGIN}:format=auto,format=yuv420p[v]")
    else:
        f.append("[vs]format=yuv420p[v]")

    f.append("[1:a]aresample=48000,aformat=channel_layouts=stereo,apad[vo]")
    if music_idx is not None:
        fade_out = max(0.0, duration - 1.5)
        f.append(f"[{music_idx}:a]aresample=48000,aformat=channel_layouts=stereo,"
                 f"volume={MUSIC_VOLUME},afade=t=in:st=0:d=1,"
                 f"afade=t=out:st={fade_out:.2f}:d=1.5[mu]")
        f.append("[vo][mu]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,"
                 "alimiter=limit=0.95[a]")
    else:
        f.append("[vo]anull[a]")

    cmd += ["-filter_complex", ";".join(f), "-map", "[v]", "-map", "[a]",
            "-t", f"{duration:.3f}",
            "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-r", str(FPS),
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
            "-movflags", "+faststart", str(out)]
    run(cmd, cwd=work)


# ---------------------------------------------------------------------------
# Κύρια ροή
# ---------------------------------------------------------------------------
def narration(s: dict) -> str:
    return " ".join(x.strip() for x in (s["hook"], s["body"], s["cta"]) if x.strip())


def video_name(s: dict) -> str:
    return f"{FILE_PREFIX}_{int(s['id']):02d}.mp4"


def make_one(s: dict, clips: list[Path], music_files: list[Path]) -> None:
    out = OUTPUT_DIR / video_name(s)
    text = narration(s)
    voice_name = s.get("voice") or VOICES[(int(s["id"]) - 1) % len(VOICES)]
    with tempfile.TemporaryDirectory(prefix="innometrics_") as tmp:
        work = Path(tmp)
        voice = work / "voice.mp3"

        log(f"  Φωνή ({voice_name})...")
        voice_dur = make_voice(text, voice_name, voice)
        duration = min(MAX_DURATION, max(MIN_DURATION, voice_dur + TAIL_SECONDS))

        log("  Υπότιτλοι (faster-whisper)...")
        try:
            heard = whisper_words(voice, text)
        except Exception as exc:
            log(f"  ! Το whisper απέτυχε ({exc}). Οι υπότιτλοι μοιράζονται αναλογικά.")
            heard = []
        timed = align(text.split(), heard, voice_dur)
        write_ass(timed, work / "subs.ass", duration)

        log("  Πλάνα...")
        build_broll(clips, duration, work)

        music = random.choice(music_files) if music_files else None
        log(f"  Μοντάζ ({duration:.1f} δευτ.)...")
        render(work, voice, music, duration, out)
    log(f"  ✓ {out.relative_to(BASE)}")


def write_captions(scripts: list[dict]) -> None:
    parts = []
    for s in scripts:
        parts.append(f"=== {video_name(s)} ===\n{s['caption'].strip()}\n\n{s['hashtags'].strip()}\n")
    CAPTIONS_FILE.write_text("\n".join(parts), encoding="utf-8-sig")


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    ap = argparse.ArgumentParser(description="Κάθετα βίντεο Innometrics για Reels και TikTok")
    ap.add_argument("--only", help="μόνο αυτά τα σενάρια, π.χ. 1,4,10")
    ap.add_argument("--force", action="store_true", help="ξαναφτιάχνει και όσα υπάρχουν ήδη")
    args = ap.parse_args()

    check_requirements()
    OUTPUT_DIR.mkdir(exist_ok=True)

    scripts = json.loads(SCRIPTS_FILE.read_text(encoding="utf-8"))
    clips = list_files(CLIPS_DIR, VIDEO_EXTS)
    music_files = list_files(MUSIC_DIR, AUDIO_EXTS)
    if not clips:
        sys.exit("Ο φάκελος clips/ είναι άδειος. Βάλε μέσα τα βίντεο με τα γυαλιά (.mp4, .mov).")
    if not music_files:
        log("Προσοχή: ο φάκελος music/ είναι άδειος, τα βίντεο θα βγουν χωρίς μουσική.")
    if not LOGO_FILE.exists():
        log("Προσοχή: δεν βρέθηκε το logo.png, τα βίντεο θα βγουν χωρίς λογότυπο.")

    write_captions(scripts)

    selected = scripts
    if args.only:
        wanted = {int(x) for x in args.only.split(",") if x.strip()}
        selected = [s for s in scripts if int(s["id"]) in wanted]

    log(f"{len(clips)} πλάνα, {len(music_files)} μουσικές, {len(selected)} σενάρια.\n")
    done, failed = 0, []
    for n, s in enumerate(selected, 1):
        out = OUTPUT_DIR / video_name(s)
        log(f"[{n}/{len(selected)}] {video_name(s)}: {s['hook']}")
        if out.exists() and not args.force:
            log("  Υπάρχει ήδη, παραλείπεται (βάλε --force για να ξαναγίνει).")
            continue
        try:
            make_one(s, clips, music_files)
            done += 1
        except Exception as exc:
            log(f"  ✗ Σφάλμα: {exc}")
            failed.append(video_name(s))
            if out.exists():
                out.unlink()

    log(f"\nΤέλος. Νέα βίντεο: {done}. Λεζάντες: {CAPTIONS_FILE.relative_to(BASE)}")
    if failed:
        log("Απέτυχαν: " + ", ".join(failed) + " (ξανατρέξε την ίδια εντολή για να ξαναδοκιμαστούν)")


if __name__ == "__main__":
    main()
