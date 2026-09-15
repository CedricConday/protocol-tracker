# Reference voice — provenance

`nz-93612d57.wav` — 7.9 s, three concatenated clips from **Mozilla Common Voice 17.0**
(`en` dev split, rows tagged `accents = New Zealand English`), obtained 2026-09-13 from
the ungated mirror `fsicoli/common_voice_17_0`, licence **CC0-1.0**.

Clips: `common_voice_en_27081371.mp3`, `_27081379.mp3`, `_27081401.mp3`
(client_id prefix `93612d57`). Processed: concatenated, high-passed at 70 Hz, silence
trimmed, loudness-normalised to -20 LUFS, 24 kHz mono.

Used as the speaker prompt for chatterbox-tts 0.1.7 (MIT). CC0 places no restriction
on this use. It is still a real donor's voice, recorded for ASR research rather than
for advertising — that trade was made deliberately, not by default, and the generated
audio carries Resemble's Perth watermark, so the output is detectable as synthetic.

Alternative references from the same pull (kept out of the repo, in scratch):
`2cd8bc41` 13.2 s, `80c419a3` 15.1 s, `c5072f9f` 11.7 s.
