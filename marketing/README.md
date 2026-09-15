# Protocol Tracker — marketing

Created 2026-09-13.

## Where this lives and why

Product marketing sits **with the product**, in `bet/`. It does not go in `gimel/`.

- `bet/<product>/marketing/` — assets *about a product*: promo video, store copy,
  screenshots, landing copy. One per product, versioned with the code they depict,
  so a claim on a slide and the code that backs it move together.
- `gimel/active/` — **channels**, not assets: the LinkedIn pack, `X_POSTS_QUEUE.md`,
  the Medium drafts, the GitHub profile. Where a thing gets posted and by whom.
- `aleph/recht/` — contracts, AGB, Widerruf. Legal, not promotional.

The boundary: if it depicts the product, it lives here. If it decides where
something is published, it lives in gimel.

## Rules for anything produced here

1. **Every number and every screen must be checkable.** Screenshots are the running
   app. No mockups presented as captures, no invented adherence figures, no staged
   user quotes.
2. **No medical claims.** The app records what the patient did; it does not treat,
   diagnose, or improve anything. Every patient- and clinician-facing piece carries:
   *Not medical advice. Discuss all results with your prescribing practitioner.*
3. **No patient data, real or implied.** Use the `Testpatient` / seeded captures.
   Anything with a real name in it never leaves this box.
4. **Date claims that decay.** Version numbers, check results and counts go stale;
   re-verify before re-cutting, don't copy them forward.

## Contents

| Path | What |
|---|---|
| `video/cuts.py` | The three promo cuts, declared as scenes |
| `video/lib/ptvideo.py` | Frame renderer — Pillow draws, ffmpeg encodes |
| `video/assets/` | App captures (2026-09-11) + mascot + icon |
| `video/lib/ptaudio.py` | Narration (piper) + the synthesised music bed + the mix |
| `video/scripts/` | Beat sheets, one per cut, with the source of every claim and its narration |
| `video/out/` | Rendered mp4s (gitignored if they get large) |

## Rendering

    cd marketing/video
    python3 cuts.py                      # all three, 1920x1080
    python3 cuts.py patients             # one cut
    python3 cuts.py patients --vertical  # 1080x1920 for Reels/Shorts/Stories

Flags: `--silent` drops the audio, `--amy` swaps the narrator for the US voice.

Needs ffmpeg, Pillow, scipy/soundfile, and piper in `~/.venvs/piper` with voices in
`~/.local/share/piper-voices` (installed 2026-09-13). ~3 min per cut, most of it frames.

### Sound

- **Voice** — piper `en_GB-jenny_dioco-medium`, offline, `--length-scale 1.12` so it
  reads slower than default. Dataset licence (dioco-group/jenny-tts-dataset, read
  2026-09-13): commercial use permitted; attribution is required in *software that
  generates audio on user action*, **not** when distributing generated clips. These
  are generated clips, so no on-screen credit is owed — crediting "Jenny (Dioco)" is
  welcome if a credit line ever exists.
- **Music** — synthesised in `ptaudio.bed()`: four sine-partial chords, ~9 s each,
  crossfaded, low-passed at 2.4 kHz with a short echo tail. Nothing sampled, nothing
  licensed, and it regenerates at whatever length the cut needs.
- **Mix** — the bed ducks 11 dB under narration, whole thing normalised to -16 LUFS
  / -1.5 dBTP, which is where YouTube and the Play listing want it.
- Narration lengthens every cut: scene durations stretch to fit their line, so the
  visual beats and the voice stay locked without hand-timing.

## The three cuts

| Cut | Audience | Length | Use |
|---|---|---|---|
| `patients` | People on the protocol | ~54 s | Play Store listing video, landing page hero |
| `clinicians` | Prescribing practitioners | ~71 s | Practice outreach, medtech positioning |
| `portfolio` | Engineers, recruiters | ~55 s | Profile, portfolio, technical write-ups |

Silent versions of all three (35.5 / 42.5 / 42.5 s) render with `--silent`.

## Open before launch

- Repo is private; the portfolio end card carries a loud `‹SET WHEN PUBLIC›` stub
  instead of a dead link. Fill it when the repo opens.
- Play Store listing copy, feature graphic (1024x500) and 8 phone screenshots are
  not written yet.
- `app.json` declares `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION`. Play review
  asks why a dose tracker needs location. Drop the permissions or prepare the answer
  before the listing goes in.
