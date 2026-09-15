"""Narrate one cut's lines with a cloned reference voice, instead of piper.

Runs in the chatterbox venv (torch 2.6), which is separate from the render
environment — so this writes wavs to disk and `cuts.py --vo-dir` picks them up.

    ~/.venvs/chatterbox/bin/python clone_vo.py patients assets/voice/nz-93612d57.wav

Output: out/audio/clone/<cut>-<index>.wav, one per narrated scene.
"""

import ast
import os
import sys
import time

import torch
import torchaudio
from chatterbox.tts import ChatterboxTTS

HERE = os.path.dirname(os.path.abspath(__file__))


def load_vo(cut):
    """Pull the VO dict out of cuts.py without importing it (different venv)."""
    tree = ast.parse(open(os.path.join(HERE, "cuts.py")).read())
    for node in tree.body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", None) == "VO":
            table = ast.literal_eval(node.value)
            return {k[1]: v for k, v in table.items() if k[0] == cut}
    raise SystemExit("no VO table found in cuts.py")


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    cut, ref = sys.argv[1], sys.argv[2]
    ref = ref if os.path.isabs(ref) else os.path.join(HERE, ref)
    lines = load_vo(cut)
    outdir = os.path.join(HERE, "out", "audio", "clone")
    os.makedirs(outdir, exist_ok=True)

    torch.set_num_threads(os.cpu_count() or 4)
    t0 = time.time()
    model = ChatterboxTTS.from_pretrained(device="cpu")
    print(f"model loaded in {time.time() - t0:.0f}s", flush=True)

    for i in sorted(lines):
        t = time.time()
        wav = model.generate(
            lines[i],
            audio_prompt_path=ref,
            exaggeration=0.35,   # flat, documentary read
            cfg_weight=0.5,
            temperature=0.7,
        )
        out = os.path.join(outdir, f"{cut}-{i}.wav")
        torchaudio.save(out, wav, model.sr)
        print(f"  [{i}] {wav.shape[-1] / model.sr:5.1f}s audio in {time.time() - t:3.0f}s"
              f"  {lines[i][:58]}...", flush=True)

    print(f"done in {time.time() - t0:.0f}s -> {outdir}", flush=True)


if __name__ == "__main__":
    main()
