#!/usr/bin/env python3
"""Step 1: transcribe raw video with word timestamps and propose a cut list.

Writes into WORKDIR:
  words.json   - every word: {w, start, end, prob}
  cuts.json    - proposed KEEP segments [{start, end, text}] + removed items with reasons
  cutlist.md   - human-readable table to show the user before rendering

Cuts are only ever placed in gaps BETWEEN words (never mid-word); each kept
segment is padded into the surrounding silence so no syllable is clipped.

usage: analyze.py raw.mp4 WORKDIR [--lang en|el|auto] [--model small]
                                  [--max-gap 0.45] [--pad 0.08]
"""
import argparse, json, os, re, subprocess, sys

FILLERS_EN = {"um", "umm", "uhm", "uhh", "em", "uh", "erm", "er", "ah", "hmm", "mm", "uhm", "like", "you know", "so"}
FILLERS_EL = {"εε", "εεε", "μμ", "χμ", "ε", "δηλαδή", "λοιπόν", "ας πούμε", "ξέρεις"}
# "like"/"so"/"δηλαδή"/"λοιπόν" are only removed when standing alone (isolated by pauses)
SOFT_FILLERS = {"like", "so", "you know", "δηλαδή", "λοιπόν", "ας πούμε", "ξέρεις"}


def norm(w):
    return re.sub(r"[^\w']+", "", w.lower())


def transcribe(path, lang, model_name):
    os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
    from faster_whisper import WhisperModel
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    # decode with ffmpeg ourselves (avoids PyAV version issues), 16 kHz mono float
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "16000",
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    import numpy as np
    audio = np.frombuffer(pcm, np.float32)
    segs, info = model.transcribe(
        audio, language=None if lang == "auto" else lang, word_timestamps=True,
        vad_filter=True, vad_parameters={"min_silence_duration_ms": 250},
        # keep disfluencies so we can cut them
        initial_prompt="Umm, uh, so, like... I mean, uh, these glasses.",
        condition_on_previous_text=False)
    words = []
    for s in segs:
        for w in s.words or []:
            if words and re.match(r"^[-'’]", w.word.strip()) and w.start - words[-1]["end"] < 0.15:
                words[-1]["w"] += w.word.strip(); words[-1]["end"] = round(w.end, 3)
                continue
            words.append({"w": w.word.strip(), "start": round(w.start, 3),
                          "end": round(w.end, 3), "prob": round(w.probability, 3)})
    return words, info.language, info.duration


def phrases(words, max_gap):
    """Group words into phrases split at pauses, sentence punctuation, or a removed word."""
    out, cur = [], []
    for w in words:
        if cur and (w["start"] - cur[-1]["end"] > max_gap or w["i"] != cur[-1]["i"] + 1
                    or re.search(r"[.!?;]$", cur[-1]["w"])):
            out.append(cur); cur = []
        cur.append(w)
    if cur: out.append(cur)
    return out


def text_of(ws):
    return " ".join(w["w"] for w in ws)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("workdir")
    ap.add_argument("--lang", default="auto"); ap.add_argument("--model", default="small")
    ap.add_argument("--max-gap", type=float, default=0.45, help="pause that ends a phrase (s)")
    ap.add_argument("--pad", type=float, default=0.08, help="silence kept around each segment (s)")
    ap.add_argument("--min-prob", type=float, default=0.35, help="phrases averaging below this are flagged")
    a = ap.parse_args()
    os.makedirs(a.workdir, exist_ok=True)

    words, lang, dur = transcribe(a.video, a.lang, a.model)
    json.dump({"language": lang, "duration": dur, "words": words},
              open(f"{a.workdir}/words.json", "w"), ensure_ascii=False, indent=1)
    fillers = FILLERS_EL if lang == "el" else FILLERS_EN

    for i, w in enumerate(words): w["i"] = i
    removed = []
    # 1) drop filler words
    kept = []
    for i, w in enumerate(words):
        n = norm(w["w"])
        if n in fillers:
            prev_gap = w["start"] - (words[i - 1]["end"] if i else 0)
            next_gap = (words[i + 1]["start"] if i + 1 < len(words) else dur) - w["end"]
            isolated = prev_gap > 0.15 or next_gap > 0.15
            if n not in SOFT_FILLERS or isolated:
                removed.append({"start": w["start"], "end": w["end"], "text": w["w"], "reason": "filler"})
                continue
        kept.append(w)

    ph = phrases(kept, a.max_gap)

    # 2) bad takes: a phrase whose opening 2+ words are repeated by the next phrase
    #    (the speaker restarted) or that is cut off / very low confidence
    final = []
    for i, p in enumerate(ph):
        nxt = ph[i + 1] if i + 1 < len(ph) else None
        head = [norm(w["w"]) for w in p[:3]]
        if nxt:
            nhead = [norm(w["w"]) for w in nxt[:3]]
            k = 0
            while k < min(len(head), len(nhead)) and head[k] == nhead[k]: k += 1
            if k >= 2 or (k >= 1 and len(p) <= 3):
                removed.append({"start": p[0]["start"], "end": p[-1]["end"], "text": text_of(p),
                                "reason": "retake (repeated by next phrase)"})
                continue
        avg = sum(w["prob"] for w in p) / len(p)
        if avg < a.min_prob and len(p) <= 4:
            removed.append({"start": p[0]["start"], "end": p[-1]["end"], "text": text_of(p),
                            "reason": f"mumbled / low confidence ({avg:.2f})"})
            continue
        final.append(p)

    # 3) keep segments = phrases, padded into silence, never overlapping a cut word
    segs = []
    all_starts = sorted([w["start"] for w in words]); all_ends = sorted([w["end"] for w in words])
    for p in final:
        s, e = p[0]["start"], p[-1]["end"]
        prev_end = max([x for x in all_ends if x <= s + 1e-6], default=0.0)
        next_start = min([x for x in all_starts if x >= e - 1e-6 and x > s], default=dur)
        s2 = max(prev_end + 0.01, s - a.pad, 0.0)
        e2 = min(next_start - 0.01, e + a.pad + 0.04, dur)
        segs.append({"start": round(s2, 3), "end": round(e2, 3), "text": text_of(p)})
    # merge segments that touch (cut gap < 60 ms is pointless)
    merged = []
    for s in segs:
        if merged and s["start"] - merged[-1]["end"] < 0.06:
            merged[-1]["end"] = s["end"]; merged[-1]["text"] += " " + s["text"]
        else:
            merged.append(dict(s))
    # silences removed = gaps between kept segments
    for x, y in zip([{"end": 0}] + merged, merged + [{"start": dur}]):
        if y["start"] - x["end"] > 0.25:
            removed.append({"start": round(x["end"], 3), "end": round(y["start"], 3),
                            "text": "", "reason": "silence / dead air"})
    removed.sort(key=lambda r: r["start"])
    kept_dur = sum(s["end"] - s["start"] for s in merged)
    json.dump({"source": os.path.abspath(a.video), "language": lang, "source_duration": dur,
               "keep": merged, "removed": removed, "kept_duration": round(kept_dur, 2)},
              open(f"{a.workdir}/cuts.json", "w"), ensure_ascii=False, indent=1)

    md = [f"# Proposed cut list — {os.path.basename(a.video)}",
          f"Language: **{lang}** · source {dur:.1f}s → kept {kept_dur:.1f}s "
          f"(+ intro/outro added at render)\n",
          "## Keep", "| # | from | to | len | text |", "|---|---|---|---|---|"]
    for i, s in enumerate(merged, 1):
        md.append(f"| {i} | {s['start']:.2f} | {s['end']:.2f} | {s['end']-s['start']:.2f} | {s['text']} |")
    md += ["", "## Removed", "| from | to | reason | text |", "|---|---|---|---|"]
    for r in removed:
        md.append(f"| {r['start']:.2f} | {r['end']:.2f} | {r['reason']} | {r['text']} |")
    open(f"{a.workdir}/cutlist.md", "w").write("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main()
