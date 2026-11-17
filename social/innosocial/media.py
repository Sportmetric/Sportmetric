"""Video helpers: probe + preview frames for caption writing."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path


def probe(video: Path) -> dict:
    if not shutil.which("ffprobe"):
        return {}
    out = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(video)],
                         capture_output=True, text=True)
    if out.returncode:
        return {}
    info = json.loads(out.stdout)
    v = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), {})
    return {"duration": float(info.get("format", {}).get("duration") or 0), "width": v.get("width"),
            "height": v.get("height"), "has_audio": any(s.get("codec_type") == "audio" for s in info.get("streams", []))}


def frames(video: Path, out_dir: Path, duration: float, n: int = 5) -> list[str]:
    if not shutil.which("ffmpeg") or duration <= 0:
        return []
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for i in range(n):
        t = duration * (i + 0.5) / n
        p = out_dir / f"frame_{i + 1}.jpg"
        r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", str(video),
                            "-frames:v", "1", "-vf", "scale=540:-2", str(p)], capture_output=True)
        if r.returncode == 0 and p.exists():
            paths.append(str(p))
    return paths


def avg_fps(video: Path) -> float:
    if not shutil.which("ffprobe"):
        return 0.0
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=avg_frame_rate",
                          "-of", "default=nw=1:nk=1", str(video)], capture_output=True, text=True)
    try:
        num, _, den = out.stdout.strip().partition("/")
        return float(num) / float(den or 1)
    except (ValueError, ZeroDivisionError):
        return 0.0


def fix_frame_rate(video: Path) -> Path:
    """TikTok rejects videos averaging under 23 or over 60 fps (common with phone screen recordings and
    variable-frame-rate clips). Re-encode those to a steady 30 fps; return the file to upload."""
    fps = avg_fps(video)
    if not fps or 23 <= fps <= 60 or not shutil.which("ffmpeg"):
        return video
    out = video.with_name(video.stem + "_30fps.mp4")
    if not out.exists():
        r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(video), "-vf", "fps=30",
                            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
                            "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(out)], capture_output=True)
        if r.returncode or not out.exists():
            return video
    return out
