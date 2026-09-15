# Marketing assets moved out

The promo pipeline and its assets lived at `marketing/` in this repo until
2026-09-15. They are now in the private **`CedricConday/marketing`** repo, at
`protocol-tracker/video/`, checked out here on this box at
`~/workspace/marketing`.

Moved because marketing stopped being a property of one product: the Concode
brand video, reels and shorts share the renderer and the brand, and none of
them belong in a product repo.

What went: `cuts.py`, `clone_vo.py`, `lib/ptvideo.py`, `lib/ptaudio.py`, the
beat sheets under `scripts/`, the app stills in `assets/`, the NZ voice
reference, and the finished cut.

The app stills are captured from a running build of THIS repo, so a release
that changes a screen makes that repo's stills stale. They were wrong once
already, for two days.
