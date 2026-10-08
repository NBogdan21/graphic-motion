"""Analyse the reference track and write the choreography data the film reads.

Usage: python3 tools/analyze_music.py public/track.mp3 src/data/music.json

Everything the film reacts to is precomputed here (not live FFT) so the
real-time preview and the frame-by-frame render are identical.

Output:
  grid      - tempo, beat period, the drop time (beat 0 of the grid)
  sections  - hand-verified structure (intro / hooks / verses / silences)
  frames    - per video frame (30 fps): sub, kick, hat, snare, vox  (0..1)
"""
import json
import sys

import librosa
import numpy as np

FPS = 30
src, dst = sys.argv[1], sys.argv[2]

y, sr = librosa.load(src, sr=22050, mono=True)
dur = len(y) / sr
hop = 256
S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
f = librosa.fft_frequencies(sr=sr, n_fft=2048)
t = librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=hop)

H, P = librosa.decompose.hpss(S)


def band(M, lo, hi):
    return M[(f >= lo) & (f < hi)].mean(0)


def onset(x):
    d = np.maximum(0, np.diff(np.log1p(x * 10), prepend=0))
    return d


sub = band(S, 20, 90)                 # 808 body
kick = onset(band(P, 30, 120))        # low transients
hat = onset(band(P, 6000, 11000))     # hats / rolls
snare = onset(band(P, 1500, 5000))    # claps / snares
vox = band(H, 300, 3000)              # harmonic mids (voice + melody)


def to_frames(x, mode="mean"):
    n = int(np.ceil(dur * FPS))
    out = np.zeros(n)
    idx = np.minimum((t * FPS).astype(int), n - 1)
    if mode == "max":
        np.maximum.at(out, idx, x)
    else:
        np.add.at(out, idx, x)
        cnt = np.bincount(idx, minlength=n)
        out /= np.maximum(cnt, 1)
    return out


def norm(x, q=99):
    return np.clip(x / (np.percentile(x, q) + 1e-9), 0, 1)


def decay(x, k):
    # impulses -> exponentially decaying envelope (k = per-frame retention)
    o = np.zeros_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = max(v, acc * k)
        o[i] = acc
    return o


fr = {
    "sub": norm(to_frames(sub), 98),
    "kick": decay(norm(to_frames(kick, "max"), 99.5), 0.78),
    "hat": decay(norm(to_frames(hat, "max"), 99.5), 0.55),
    "snare": decay(norm(to_frames(snare, "max"), 99.5), 0.7),
    "vox": norm(to_frames(vox), 97),
}
# smooth the sustained envelopes a little
for k in ("sub", "vox"):
    v = fr[k]
    fr[k] = np.convolve(v, np.ones(3) / 3, mode="same")

BPM = 161.499
PER = 60 / BPM
DROP = 23.405  # beat 0 of the grid (first full 808 hit)


def b(n):
    return round(DROP + n * PER, 3)


# Structure verified against energy / self-similarity (see README).
sections = [
    {"name": "intro", "t0": 0.0, "t1": b(-32)},
    {"name": "pressure", "t0": b(-32), "t1": b(0)},
    {"name": "hook1", "t0": b(0), "t1": b(64)},
    {"name": "verse1a", "t0": b(64), "t1": 69.75},
    {"name": "silence1", "t0": 69.75, "t1": b(128)},
    {"name": "verse1b", "t0": b(128), "t1": 81.75},
    {"name": "silence2", "t0": 81.75, "t1": b(160)},
    {"name": "hook2", "t0": b(160), "t1": b(224)},
    {"name": "breakdown", "t0": b(224), "t1": b(232)},
    {"name": "verse2a", "t0": b(232), "t1": 117.4},
    {"name": "silence3", "t0": 117.4, "t1": b(256)},
    {"name": "verse2b", "t0": b(256), "t1": 141.0},
    {"name": "silence4", "t0": 141.0, "t1": b(320)},
    {"name": "hook3a", "t0": b(320), "t1": 152.7},
    {"name": "silence5", "t0": 152.7, "t1": b(352)},
    {"name": "hook3b", "t0": b(352), "t1": b(384)},
    {"name": "outro", "t0": b(384), "t1": round(dur, 3)},
]

out = {
    "duration": round(dur, 3),
    "fps": FPS,
    "grid": {"bpm": BPM, "period": PER, "drop": DROP},
    "sections": sections,
    "frames": {k: [round(float(x), 3) for x in v] for k, v in fr.items()},
}
with open(dst, "w") as fh:
    json.dump(out, fh, separators=(",", ":"))
print("wrote", dst, "frames", len(fr["sub"]), "duration", dur)
