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
