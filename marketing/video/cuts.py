#!/usr/bin/env python3
"""Three promo cuts for Protocol Tracker: patients, clinicians, portfolio.

Every claim on screen is checkable against the repo or the app screenshots in
./assets. Nothing is staged footage. Usage:

    python3 cuts.py                 # all three, 1920x1080
    python3 cuts.py patients        # one cut
    python3 cuts.py patients --vertical   # 1080x1920 for social
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))

from PIL import Image, ImageDraw  # noqa: E402

import ptvideo as V  # noqa: E402
from ptvideo import Scene  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
DISCLAIMER = "Not medical advice. Discuss all results with your prescribing practitioner."


# ---------------------------------------------------------------- layout


def cols(size):
    """Left text column + right device centre, for both aspects."""
    W, H = size
    if W >= H:
        return dict(tx=150, tw=int(W * 0.44), dcx=int(W * 0.735), dcy=H // 2, dh=int(H * 0.82), ty=int(H * 0.23))
    return dict(tx=90, tw=W - 180, dcx=W // 2, dcy=int(H * 0.67), dh=int(H * 0.58), ty=int(H * 0.09))


def feature(eyebrow, head, body, shot, ring_frac=None, ring_label=None):
    """Text on one side, the app on the other."""

    def draw(canvas, t, dur, size):
        L = cols(size)
        p = min(1.0, t / max(0.1, min(dur - 0.3, 3.4)))
        dev = V.phone(V.asset(shot), L["dh"])
        drift = int(V.ease_in_out(min(1.0, t / dur)) * 16)
        V.paste_device(canvas, dev, L["dcx"], L["dcy"] - 8 + drift)
        V.eyebrow(canvas, L["tx"], L["ty"] - 66, eyebrow, alpha=V.ease_out(V.window(p, 0.0, 0.3)))
        V.text_block(
            canvas, L["tx"], L["ty"],
            [(head, "bold", V.INK, 60 if size[0] >= size[1] else 52),
             (body, "regular", V.MUTED, 32)],
            L["tw"], reveal=p,
        )
        if ring_frac is not None:
            a = V.ease_out(V.window(p, 0.35, 0.5))
            cx, cy = L["tx"] + 74, L["ty"] + (300 if size[0] >= size[1] else 360)
            V.ring(canvas, cx, cy, 62, ring_frac * a, V.GREEN, width=16)
            d = ImageDraw.Draw(canvas)
            lab = f"{int(round(ring_frac * 100 * a))}%"
            f = V.font("bold", 34)
            d.text((cx - d.textlength(lab, font=f) / 2, cy - 22), lab, font=f, fill=V.INK)
            if ring_label:
                f2 = V.font("regular", 27)
                d.text((cx + 104, cy - 16), ring_label, font=f2, fill=V.MUTED)

    return draw


def ui_card(eyebrow, head, body, shot, crop, caption=None, cw_frac=0.365):
    """A real card lifted out of the app, enlarged."""

    def draw(canvas, t, dur, size):
        W, H = size
        p = min(1.0, t / max(0.1, min(dur - 0.3, 3.4)))
        src = V.asset(shot).crop(crop)
        cw = int(W * cw_frac) if W >= H else int(W * 0.82)
        img = V.card(src, cw)
        a = V.ease_out(V.window(p, 0.1, 0.5))
        cx = int(W * 0.755) if W >= H else W // 2
        cy = (H // 2) if W >= H else int(H * 0.68)
        drift = int(V.ease_in_out(min(1.0, t / dur)) * 12)
        x, y = cx - img.width // 2, cy - img.height // 2 + int((1 - a) * 30) + drift
        V.rounded_shadow(canvas, (x, y, x + img.width, y + img.height), 26)
        alpha = img.getchannel("A").point(lambda v: int(v * a))
        canvas.paste(img.convert("RGB"), (x, y), alpha)
        if caption:
            d = ImageDraw.Draw(canvas, "RGBA")
            f = V.font("mono", 22)
            d.text((x, y + img.height + 20), caption, font=f, fill=V.MUTED + (int(255 * a),))
        L = cols(size)
        V.eyebrow(canvas, L["tx"], L["ty"] - 66, eyebrow, alpha=V.ease_out(V.window(p, 0.0, 0.3)))
        V.text_block(
            canvas, L["tx"], L["ty"],
            [(head, "bold", V.INK, 54 if W >= H else 50), (body, "regular", V.MUTED, 31)],
            int(L["tw"] * 0.80) if W >= H else L["tw"], reveal=p,
        )

    return draw


def statement(head, body, tint=V.INK, small=None):
    def draw(canvas, t, dur, size):
        W, H = size
        p = min(1.0, t / max(0.1, min(dur - 0.3, 3.4)))
        d = ImageDraw.Draw(canvas, "RGBA")
        fh = V.font("bold", 76 if W >= H else 56)
        lines = V.wrap(head, fh, int(W * 0.74))
        fb = V.font("regular", 34)
        blines = V.wrap(body, fb, int(W * 0.62)) if body else []
        total = len(lines) * int(fh.size * 1.26) + (len(blines) * 46 + 40 if blines else 0)
        y = (H - total) // 2
        for i, ln in enumerate(lines):
            a = V.ease_out(V.window(p, i * 0.1, 0.45))
            d.text(((W - d.textlength(ln, font=fh)) / 2, y + int((1 - a) * 22)), ln, font=fh,
                   fill=tint + (int(255 * a),))
            y += int(fh.size * 1.26)
        y += 40
        for i, ln in enumerate(blines):
            a = V.ease_out(V.window(p, 0.25 + i * 0.08, 0.45))
            d.text(((W - d.textlength(ln, font=fb)) / 2, y), ln, font=fb, fill=V.MUTED + (int(255 * a),))
            y += 46
        if small:
            a = V.ease_out(V.window(p, 0.6, 0.5))
            fs = V.font("regular", 24)
            d.text(((W - d.textlength(small, font=fs)) / 2, H - 92), small, font=fs,
                   fill=V.MUTED + (int(200 * a),))

    return draw


def bullets(eyebrow_txt, head, items):
    def draw(canvas, t, dur, size):
        W, H = size
        p = min(1.0, t / max(0.1, min(dur - 0.3, 3.4)))
        fh_probe = V.font("bold", 58 if W >= H else 46)
        head_lines = len(V.wrap(head, fh_probe, int(W * 0.76)))
        block = head_lines * int(fh_probe.size * 1.3) + 34 + len(items) * 104
        x = int(W * 0.12)
        y = max(int(H * 0.22), (H - block) // 2)
        V.eyebrow(canvas, x, y - 66, eyebrow_txt, alpha=V.ease_out(V.window(p, 0, 0.3)))
        d = ImageDraw.Draw(canvas, "RGBA")
        fh = V.font("bold", 58 if W >= H else 46)
        for ln in V.wrap(head, fh, int(W * 0.76)):
            a = V.ease_out(V.window(p, 0.05, 0.4))
            d.text((x, y + int((1 - a) * 20)), ln, font=fh, fill=V.INK + (int(255 * a),))
            y += int(fh.size * 1.3)
        y += 34
        fi = V.font("regular", 36)
        for i, (label, note) in enumerate(items):
            a = V.ease_out(V.window(p, 0.3 + i * 0.14, 0.45))
            if a <= 0:
                y += 104
                continue
            d.ellipse((x + 4, y + 18, x + 20, y + 34), fill=V.TEAL + (int(255 * a),))
            d.text((x + 44, y + 4), label, font=fi, fill=V.INK + (int(255 * a),))
            fn = V.font("regular", 27)
            d.text((x + 44, y + 52), note, font=fn, fill=V.MUTED + (int(255 * a),))
            y += 104

    return draw


def term_scene(title, lines, head=None):
    def draw(canvas, t, dur, size):
        W, H = size
        total = sum(max(1, len(s)) for s, _ in lines)
        p = min(1.0, max(0.0, (t - 0.5) / max(0.1, min(dur * 0.62, 4.2))))
        bh = 74 + 40 * len(lines) + 22
        bw = int(W * 0.66) if W >= H else W - 120
        bx = (W - bw) // 2
        by = max(int(H * 0.32), (H - bh) // 2 + 54)
        box = (bx, by, bx + bw, by + bh)
        V.terminal(canvas, box, lines, int(total * p), title=title)
        if head:
            d = ImageDraw.Draw(canvas, "RGBA")
            fh = V.font("bold", 52 if W >= H else 42)
            y = int(H * 0.17)
            for ln in V.wrap(head, fh, int(W * 0.8)):
                a = V.ease_out(V.window(min(1.0, t / dur), 0, 0.4))
                d.text(((W - d.textlength(ln, font=fh)) / 2, y), ln, font=fh, fill=V.INK + (int(255 * a),))
                y += int(fh.size * 1.25)

    return draw


def montage(shots, head):
    def draw(canvas, t, dur, size):
        W, H = size
        p = min(1.0, t / max(0.1, min(dur - 0.3, 3.4)))
        dh = int(H * 0.62) if W >= H else int(H * 0.34)
        step = int(W / (len(shots) + 0.6))
        for i, s in enumerate(shots):
            a = V.ease_out(V.window(p, 0.12 + i * 0.16, 0.45))
            if a <= 0:
                continue
            dev = V.phone(V.asset(s), dh)
            cx = int(step * (i + 0.8))
            V.paste_device(canvas, dev, cx, int(H * 0.62) + int((1 - a) * 26), opacity=a)
        d = ImageDraw.Draw(canvas, "RGBA")
        fh = V.font("bold", 56 if W >= H else 44)
        y = int(H * 0.12)
        for ln in V.wrap(head, fh, int(W * 0.8)):
            a = V.ease_out(V.window(p, 0, 0.4))
            d.text(((W - d.textlength(ln, font=fh)) / 2, y), ln, font=fh, fill=V.INK + (int(255 * a),))
            y += int(fh.size * 1.25)

    return draw


def endcard(line, small=None, sub=None):
    def draw(canvas, t, dur, size):
        W, H = size
        p = min(1.0, t / max(0.1, min(dur - 0.3, 3.4)))
        a = V.ease_out(V.window(p, 0, 0.5))
        V.logo_lockup(canvas, W // 2, int(H * 0.42), scale=1.0 if W >= H else 0.8, alpha=a, sub=sub)
        d = ImageDraw.Draw(canvas, "RGBA")
        f = V.font("bold", 38)
        a2 = V.ease_out(V.window(p, 0.3, 0.5))
        d.text(((W - d.textlength(line, font=f)) / 2, int(H * 0.68)), line, font=f,
               fill=V.BLUE + (int(255 * a2),))
        if small:
            fs = V.font("regular", 24)
            a3 = V.ease_out(V.window(p, 0.5, 0.5))
            d.text(((W - d.textlength(small, font=fs)) / 2, H - 96), small, font=fs,
                   fill=V.MUTED + (int(215 * a3),))

    return draw


# ---------------------------------------------------------------- cuts

CAL_CROP = (24, 206, 758, 1012)      # 8-seeded-history: month grid + legend
ADHERENCE_CROP = (40, 420, 740, 610)  # 7-seeded-records: weighted adherence card
MOOD_CROP = (20, 500, 760, 760)       # 2-journal: this-week mood strip


def cut_patients():
    return [
        Scene(4.5, lambda c, t, d, s: endcard("The day starts when you do.", sub=None)(c, t, d, s)),
        Scene(6.5, feature(
            "T = 0",
            "You set the anchor. The app schedules the rest.",
            "Every reminder fires at T0 plus its own offset in minutes, so the protocol "
            "follows your morning instead of a fixed clock.",
            "1-today.png")),
        Scene(6.0, feature(
            "one tap",
            "Log a dose. Log how you feel. Move on.",
            "Doses, water, mood, sun and exercise — each a single tap. Notes for side "
            "effects and protocol deviations save as you type.",
            "2-journal.png")),
        Scene(7.0, ui_card(
            "the long view",
            "Every day you logged, on one screen.",
            "A compliance ring per day, a month average, and 30-day, 12-month and "
            "2-year views when your practitioner asks.",
            "8-seeded-history.png", CAL_CROP,
            caption="Calendar — September 2026")),
        Scene(5.5, statement(
            "Your data stays on your phone.",
            "An on-device database, a fingerprint or face-unlock gate on launch, and "
            "no account needed to use the app.")),
        Scene(6.0, endcard("Free. Android first.", small=DISCLAIMER, sub="High-dose Vitamin D3 protocol companion")),
    ]


def cut_clinicians():
    return [
        Scene(4.5, statement(
            "What happens between appointments.",
            "Protocol Tracker — an adherence record your patient keeps, and you can read.")),
        Scene(6.5, ui_card(
            "adherence",
            "A weighted score, not a self-report.",
            "Completeness and timing both count. Missed and late doses stay visible "
            "instead of being smoothed away.",
            "7-seeded-records.png", ADHERENCE_CROP,
            caption="Summary — 14-day weighted adherence", cw_frac=0.44)),
        Scene(6.5, feature(
            "timing",
            "Doses are anchored to T0, not wall-clock time.",
            "Each rule carries an offset in minutes from the patient's own daily anchor, "
            "so a late start shifts the whole day rather than scoring it as failure.",
            "1-today.png")),
        Scene(6.5, bullets(
            "what is tracked",
            "The values you titrate on.",
            [("Vitamin D, calcium, PTH, creatinine, NFL", "entered by the patient, charted as 12-month trends"),
             ("MRI reports", "photographed and dated in the record"),
             ("Symptoms, relapses, sleep, calcium reintroduction", "each with its own structured log")])),
        Scene(6.5, ui_card(
            "at a glance",
            "Day-level compliance you can read in one pass.",
            "Green at or above 80%, amber 50–79%, red below 50%. Events, journal entries "
            "and water are marked on the day they happened.",
            "8-seeded-history.png", CAL_CROP,
            caption="Calendar — compliance rings")),
        Scene(6.0, bullets(
            "what you receive",
            "It leaves the phone as a document.",
            [("Printable compliance report", "30-day, 12-month and 2-year windows"),
             ("Caregiver export", "relapse log in a form a third party can read"),
             ("Patient-initiated share", "nothing leaves the device unless they send it")])),
        Scene(6.0, endcard("On-device. No clinic account to procure.",
                           small=DISCLAIMER,
                           sub="Free for your patients · Android first")),
    ]


def cut_portfolio():
    return [
        Scene(4.0, statement(
            "Protocol Tracker",
            "A local-first medical adherence app for high-dose Vitamin D3 patients.",
            small="Built by Cedric Conday · MIT")),
        Scene(7.0, term_scene(
            "protocol-tracker — bash",
            [("$ npx tsc --noEmit", (226, 232, 240)),
             ("", (226, 232, 240)),
             ("$ echo $?", (226, 232, 240)),
             ("0", (110, 231, 145))],
            head="Type-clean, checked today.")),
        Scene(6.0, bullets(
            "stack",
            "Expo SDK 57 on the new architecture.",
            [("React Native 0.86 · React 19.2 · TypeScript 6.0", "pinned in package.json, no version drift"),
             ("expo-sqlite with versioned migrations", "offline-first; the device is the source of truth"),
             ("expo-notifications + background-fetch", "reminders survive the app being closed")])),
        Scene(6.5, montage(["1-today.png", "2-journal.png", "8-seeded-history.png"],
                           "Five tabs, 21 routes, 16 screen modules.")),
        Scene(7.0, term_scene(
            "src/engine/scheduler.ts",
            [("export async function startDay(t0: Date) {", (226, 232, 240)),
             ("  scheduled_time:", (226, 232, 240)),
             ("    t0Ms + rule.offset_minutes * 60 * 1000,", (125, 211, 252)),
             ("}", (226, 232, 240))],
            head="The whole product is this line.")),
        Scene(6.0, statement(
            "Anchored time, not clock time.",
            "One patient's day starts at 06:10 and another's at 11:40. Every dose, "
            "reminder and compliance score is computed from their own T0.")),
        Scene(6.0, endcard("MIT · repo ‹SET WHEN PUBLIC›",
                           small="Screens are the running app. No staged footage, no invented numbers.",
                           sub="Cedric Conday")),
    ]


VO = {
    ('patients', 0): 'Protocol Tracker. The day starts when you do.',
    ('patients', 1): 'You set the anchor when your day begins, and every dose is scheduled from that moment. The protocol follows your morning, instead of a fixed clock.',
    ('patients', 2): 'Log a dose. Log your water, your mood, how you slept. One tap each, saved as you go.',
    ('patients', 3): 'Every day you log builds the record. A ring for each day, an average for the month, and longer views when your practitioner asks.',
    ('patients', 4): 'It all stays on your phone. An on-device database, a fingerprint or face unlock, and no account to create.',
    ('patients', 5): 'Protocol Tracker. Free, on Android. Not medical advice. Discuss all results with your prescribing practitioner.',
    ('clinicians', 0): 'What happens between appointments.',
    ('clinicians', 1): 'A weighted adherence score, not a self-report. Completeness and timing both count, and missed or late doses stay visible.',
    ('clinicians', 2): "Doses are anchored to the patient's own start time, not to the wall clock. A late start shifts the whole day, rather than scoring it as failure.",
    ('clinicians', 3): 'Vitamin D, calcium, parathyroid hormone, creatinine and neurofilament light, charted over twelve months. M.R.I. reports, symptoms, relapses and sleep each have their own log.',
    ('clinicians', 4): 'Day-level compliance you can read in one pass. Green at eighty percent or above, amber between fifty and seventy-nine, red below fifty.',
    ('clinicians', 5): 'And it leaves the phone as a document. A printable compliance report, a caregiver export, shared by the patient when they choose.',
    ('clinicians', 6): 'On device. No clinic account to procure. Not medical advice. Discuss all results with the prescribing practitioner.',
    ('portfolio', 0): 'Protocol Tracker. A local-first medical adherence app, built for high-dose vitamin D patients.',
    ('portfolio', 1): 'Type clean, checked today.',
    ('portfolio', 2): 'Expo S.D.K. fifty-seven on the new architecture, with an on-device SQLite database as the source of truth.',
    ('portfolio', 3): 'Five tabs, twenty-one routes, sixteen screen modules.',
    ('portfolio', 4): 'The whole product is this line.',
    ('portfolio', 5): "One patient's day starts at ten past six, another's at twenty to twelve. Every dose, reminder and score is computed from their own anchor.",
    ('portfolio', 6): 'M.I.T. licensed. Built by Cedric Conday.',
}


CUTS = {"patients": cut_patients, "clinicians": cut_clinicians, "portfolio": cut_portfolio}


def build_audio(name, scenes, voice, tmpdir, vo_dir=None):
    """Narrate every scene, stretch scenes to fit, lay a bed under the lot.

    vo_dir: use pre-rendered `<cut>-<index>.wav` (from clone_vo.py) instead of piper.
    """
    import numpy as np
    import soundfile as sf
    from scipy.signal import resample_poly
    import ptaudio as A

    def prerendered(i):
        path = os.path.join(vo_dir, f"{name}-{i}.wav")
        if not os.path.exists(path):
            return None
        x, sr = sf.read(path, dtype="float32")
        if x.ndim > 1:
            x = x.mean(axis=1)
        if sr != A.SR:
            x = resample_poly(x, A.SR, sr).astype("float32")
        peak = np.max(np.abs(x)) or 1.0
        return A.trim_silence((x / peak * 0.7).astype("float32"))

    lead, tail = 0.8, 1.0
    clips = []
    for i, sc in enumerate(scenes):
        text = VO.get((name, i))
        clip = None
        if vo_dir:
            clip = prerendered(i)
        if clip is None:
            clip = A.say(text, voice=voice) if text else np.zeros(0, dtype="float32")
        clips.append(clip)
        need = lead + len(clip) / A.SR + tail
        sc.dur = max(sc.dur, round(need, 2))

    total = sum(sc.dur for sc in scenes)
    track = np.zeros(int(total * A.SR) + A.SR, dtype="float32")
    at = 0.0
    for sc, clip in zip(scenes, clips):
        if len(clip):
            start = int((at + lead) * A.SR)
            track[start:start + len(clip)] += clip
        at += sc.dur
    track = track[: int(total * A.SR)]

    mixed = A.mix(track, A.bed(total))
    raw = os.path.join(tmpdir, f"{name}-raw.wav")
    final = os.path.join(tmpdir, f"{name}.wav")
    A.write(raw, mixed)
    A.loudnorm(raw, final)
    return final, total


def main():
    flagged = {"--vo-dir", "--tag"}
    argv = sys.argv[1:]
    args = [a for i, a in enumerate(argv)
            if not a.startswith("-") and not (i and argv[i - 1] in flagged)]
    vertical = "--vertical" in sys.argv
    silent = "--silent" in sys.argv
    vo_dir = None
    if "--vo-dir" in sys.argv:
        vo_dir = sys.argv[sys.argv.index("--vo-dir") + 1]
    tag = "-" + sys.argv[sys.argv.index("--tag") + 1] if "--tag" in sys.argv else ""
    voice = "en_US-amy-medium" if "--amy" in sys.argv else "en_GB-jenny_dioco-medium"
    size = (1080, 1920) if vertical else (1920, 1080)
    names = args or list(CUTS)
    tmpdir = os.path.join(OUT, "audio")
    os.makedirs(tmpdir, exist_ok=True)
    for name in names:
        suffix = ("-vertical" if vertical else "") + ("-silent" if silent else "") + tag
        out = os.path.join(OUT, f"protocol-tracker-{name}{suffix}.mp4")
        scenes = CUTS[name]()
        audio = None
        if not silent:
            audio, total = build_audio(name, scenes, voice, tmpdir, vo_dir=vo_dir)
            print(f"[{name}] narrated with {vo_dir or voice}, {total:.1f}s")
        print(f"[{name}] {size[0]}x{size[1]} -> {out}")
        dur = V.render(scenes, size, out, audio=audio)
        print(f"[{name}] done, {dur:.2f}s")


if __name__ == "__main__":
    main()
