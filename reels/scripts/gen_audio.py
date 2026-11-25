#!/usr/bin/env python3
"""Synthesize royalty-free audio assets: a quiet modern beat, a whoosh and a pop.

Everything is generated from scratch with numpy (no samples), so there are no
licensing questions.

usage: gen_audio.py OUT_DIR [--seconds 90] [--bpm 100]
"""
import argparse, wave, os
import numpy as np

SR = 48000


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())


def env(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(t / max(a, 1e-4), 1) * np.exp(-t / d)


def kick(n=int(0.45 * SR)):
    t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env(n, 0.002, 0.16) * 0.9


def hat(n=int(0.07 * SR), rng=np.random.default_rng(1)):
    x = rng.standard_normal(n)
    x = np.diff(np.concatenate([[0], x]))  # crude high-pass
    return x * env(n, 0.001, 0.018) * 0.18


def clap(n=int(0.25 * SR), rng=np.random.default_rng(2)):
    x = rng.standard_normal(n)
    x = x - np.convolve(x, np.ones(8) / 8, "same")
    e = env(n, 0.001, 0.06)
    for k in (0.011, 0.022):
        e[int(k * SR):] += env(n - int(k * SR), 0.001, 0.012) * 0.6
    return x * e * 0.25


def pad_chord(n, freqs):
    t = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * f * t + i) + 0.5 * np.sin(2 * np.pi * f * 2.003 * t)
            for i, f in enumerate(freqs))
    # slow filter-ish swell
    sw = 0.5 - 0.5 * np.cos(2 * np.pi * np.minimum(t / (n / SR), 1))
    return x / len(freqs) * (0.25 + 0.75 * sw) * 0.12


def lowpass(x, k=24):
    return np.convolve(x, np.ones(k) / k, "same")


def beat(seconds, bpm):
    beat_s = 60 / bpm
    bar = 4 * beat_s
    n = int(seconds * SR)
    L = np.zeros(n); R = np.zeros(n)
    # Am9 - Fmaj7 - C - G  (minor, modern, calm)
    chords = [[220, 261.6, 329.6, 493.9], [174.6, 220, 261.6, 329.6],
              [261.6, 329.6, 392, 493.9], [196, 246.9, 293.7, 392]]
    bass = [55, 43.65, 65.41, 49]
    t_bar = 0; i = 0
    while t_bar < seconds:
        s = int(t_bar * SR); bn = int(bar * SR)
        c = lowpass(pad_chord(bn, chords[i % 4]), 6)
        e = min(n, s + bn); L[s:e] += c[:e - s]; R[s:e] += np.roll(c, 300)[:e - s]
        # sub bass on beats 1 and 3 (+ off-beat pickup)
        for b, ln in ((0, 1.6), (2, 1.2), (3.5, 0.4)):
            bs = s + int(b * beat_s * SR); bl = int(ln * beat_s * SR)
            if bs >= n: continue
            tt = np.arange(bl) / SR
            x = np.sin(2 * np.pi * bass[i % 4] * tt) * env(bl, 0.01, 0.5) * 0.35
            be = min(n, bs + bl); L[bs:be] += x[:be - bs]; R[bs:be] += x[:be - bs]
        for b in range(4):
            bs = s + int(b * beat_s * SR)
            for snd, when in ((kick(), b in (0, 2) or False), (clap(), b in (1, 3))):
                if when and bs < n:
                    be = min(n, bs + len(snd)); L[bs:be] += snd[:be - bs]; R[bs:be] += snd[:be - bs]
            for h in (0, 0.5):
                hs = bs + int(h * beat_s * SR)
                if hs < n:
                    hx = hat() * (1 if h else 0.6); he = min(n, hs + len(hx))
                    L[hs:he] += hx[:he - hs] * 0.8; R[hs:he] += hx[:he - hs]
        t_bar += bar; i += 1
    x = np.stack([L, R], 1)
    x = np.tanh(x * 1.2) * 0.6
    fade = int(1.5 * SR); x[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return x


def whoosh(d=0.45, rng=np.random.default_rng(3)):
    n = int(d * SR); t = np.arange(n) / SR
    x = rng.standard_normal(n)
    # sweeping band: crossfade between a dark and a bright filtered noise
    dark = np.convolve(x, np.ones(40) / 40, "same") * 4
    bright = np.convolve(x, np.ones(5) / 5, "same") - np.convolve(x, np.ones(60) / 60, "same")
    m = np.sin(np.pi * t / d)
    out = dark * (1 - m) + bright * m
    e = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2
    pan = np.linspace(-0.6, 0.6, n)
    y = out * e * 1.6
    y = y / (np.abs(y).max() + 1e-9) * 0.5
    return np.stack([y * (1 - pan), y * (1 + pan)], 1) / 1.6


def pop(d=0.12):
    n = int(d * SR); t = np.arange(n) / SR
    f = 900 * np.exp(-t * 18) + 420
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.0015, 0.03) * 0.6
    return x


def tick(d=0.03):
    n = int(d * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * 2400 * t) * env(n, 0.0005, 0.006) * 0.25


def riser(d=0.9, rng=np.random.default_rng(4)):
    n = int(d * SR); t = np.arange(n) / SR
    f = 200 + 1400 * (t / d) ** 2
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.15 + rng.standard_normal(n) * 0.05
    return x * (t / d) ** 1.5 * 0.7


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("out"); ap.add_argument("--seconds", type=float, default=90)
    ap.add_argument("--bpm", type=float, default=100)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    write_wav(f"{a.out}/beat.wav", beat(a.seconds, a.bpm))
    write_wav(f"{a.out}/whoosh.wav", whoosh())
    write_wav(f"{a.out}/pop.wav", pop())
    write_wav(f"{a.out}/tick.wav", tick())
    write_wav(f"{a.out}/riser.wav", riser())
    print("wrote beat/whoosh/pop/tick/riser to", a.out)
