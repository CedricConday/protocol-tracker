"""Voice-over and music bed for the Protocol Tracker cuts.

Voice: piper (neural, offline) from ~/.venvs/piper. Music: synthesised here from
sine partials — no sample libraries, no licensing question, deterministic output.
"""

from __future__ import annotations

import os
import subprocess
import tempfile

import numpy as np
import soundfile as sf
from scipy.signal import butter, resample_poly, sosfilt

SR = 48000
PIPER = os.path.expanduser("~/.venvs/piper/bin/python")
VOICE_DIR = os.path.expanduser("~/.local/share/piper-voices")
DEFAULT_VOICE = "en_GB-jenny_dioco-medium"


# ---------------------------------------------------------------- voice


def say(text: str, voice: str = DEFAULT_VOICE, length_scale: float = 1.12) -> np.ndarray:
    """One narration line as mono float32 at SR. Slower than default on purpose."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as fh:
        path = fh.name
    try:
        subprocess.run(
            [PIPER, "-m", "piper", "-m", voice, "--data-dir", VOICE_DIR,
             "-f", path, "--length-scale", str(length_scale),
             "--sentence-silence", "0.35"],
            input=text.encode(), check=True, capture_output=True,
        )
        audio, sr = sf.read(path, dtype="float32")
    finally:
        os.unlink(path)
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    if sr != SR:
        audio = resample_poly(audio, SR, sr).astype(np.float32)
    return trim_silence(audio)


def trim_silence(x: np.ndarray, thresh: float = 2e-3, pad: int = int(0.06 * SR)) -> np.ndarray:
    above = np.where(np.abs(x) > thresh)[0]
    if above.size == 0:
        return x
    a = max(0, above[0] - pad)
    b = min(len(x), above[-1] + pad)
    return x[a:b]


# ---------------------------------------------------------------- music

# Slow, warm, unresolved. Four chords, looped; nothing lands hard enough to
# pull attention off the screen.
PROGRESSION = [
    (146.83, 220.00, 277.18, 329.63),   # D  major add9 voicing
    (123.47, 185.00, 246.94, 293.66),   # B  minor 7
    (196.00, 246.94, 293.66, 392.00),   # G  major 7
    (110.00, 164.81, 220.00, 277.18),   # A  major 6
]


def _note(freq: float, n: int, detune: float = 3.0) -> np.ndarray:
    t = np.arange(n) / SR
    out = np.zeros(n, dtype=np.float32)
    for cents in (-detune, detune):
        f = freq * (2 ** (cents / 1200.0))
        for h, amp in ((1, 1.0), (2, 0.32), (3, 0.14), (4, 0.07), (5, 0.035)):
            out += (amp * np.sin(2 * np.pi * f * h * t + h * 0.7)).astype(np.float32)
    return out / 12.0


def bed(duration: float, chord_len: float = 9.0, seed: int = 7) -> np.ndarray:
    """Stereo pad of `duration` seconds."""
    n = int(duration * SR)
    fade = int(chord_len * 0.45 * SR)
    left = np.zeros(n + fade, dtype=np.float32)
    right = np.zeros(n + fade, dtype=np.float32)
    step = int(chord_len * SR)
    rng = np.random.default_rng(seed)

    i, k = 0, 0
    while i < n:
        chord = PROGRESSION[k % len(PROGRESSION)]
        seg_n = step + fade
        env = np.ones(seg_n, dtype=np.float32)
        env[:fade] = np.linspace(0, 1, fade) ** 1.6
        env[-fade:] = np.linspace(1, 0, fade) ** 1.6
        for j, f in enumerate(chord):
            v = _note(f, seg_n) * env * (0.85 if j else 0.6)
            pan = 0.5 + (j - 1.5) * 0.12          # spread the voices gently
            lfo = 1.0 + 0.06 * np.sin(
                2 * np.pi * (0.045 + 0.01 * j) * np.arange(seg_n) / SR + rng.random() * 6.28
            )
            v = (v * lfo).astype(np.float32)
            end = min(len(left), i + seg_n)
            left[i:end] += v[: end - i] * (1 - pan)
            right[i:end] += v[: end - i] * pan
        i += step
        k += 1

    stereo = np.stack([left[:n], right[:n]], axis=1)
    sos = butter(2, 2400, btype="low", fs=SR, output="sos")
    stereo = sosfilt(sos, stereo, axis=0).astype(np.float32)
    sos_hp = butter(2, 70, btype="high", fs=SR, output="sos")
    stereo = sosfilt(sos_hp, stereo, axis=0).astype(np.float32)

    # A short tail echo stands in for reverb; anything longer smears the pad.
    for delay_ms, gain in ((170, 0.28), (330, 0.16)):
        d = int(delay_ms * SR / 1000)
        stereo[d:] += stereo[:-d] * gain

    peak = np.max(np.abs(stereo)) or 1.0
    stereo = stereo / peak * 0.5
    ramp = int(2.5 * SR)
    stereo[:ramp] *= np.linspace(0, 1, ramp)[:, None]
    stereo[-ramp:] *= np.linspace(1, 0, ramp)[:, None]
    return stereo


# ---------------------------------------------------------------- mix


def envelope(x: np.ndarray, attack: float = 0.05, release: float = 0.45) -> np.ndarray:
    """Smoothed absolute envelope, for ducking."""
    a = np.exp(-1.0 / (attack * SR))
    r = np.exp(-1.0 / (release * SR))
    y = np.zeros_like(x)
    prev = 0.0
    mag = np.abs(x)
    for i in range(0, len(x), 16):                 # 16-sample hop: inaudible, 16x faster
        m = mag[i:i + 16].max()
        coef = a if m > prev else r
        prev = coef * prev + (1 - coef) * m
        y[i:i + 16] = prev
    return y


def mix(voice: np.ndarray, music: np.ndarray, duck_db: float = -11.0) -> np.ndarray:
    """Voice over a ducked bed. Voice is mono, music stereo, same length."""
    n = min(len(voice), len(music))
    voice, music = voice[:n], music[:n]
    env = envelope(voice)
    env = env / (np.percentile(env, 99) or 1.0)
    gain = 1.0 - (1.0 - 10 ** (duck_db / 20.0)) * np.clip(env, 0, 1)
    out = music * gain[:, None] + np.stack([voice, voice], axis=1) * 0.92
    peak = np.max(np.abs(out)) or 1.0
    if peak > 0.97:
        out = out / peak * 0.97
    return out.astype(np.float32)


def write(path: str, audio: np.ndarray):
    sf.write(path, audio, SR, subtype="PCM_16")


def loudnorm(src: str, dst: str, target: float = -16.0):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", src,
         "-af", f"loudnorm=I={target}:TP=-1.5:LRA=11", "-ar", str(SR), dst],
        check=True,
    )
