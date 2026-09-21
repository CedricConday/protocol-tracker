#!/usr/bin/env python3
"""One mark, one master, everything else generated from it.

    python3 scripts/mark.py            # regenerate every derived copy
    python3 scripts/mark.py --check    # fail if any copy has drifted

MASTER: assets/mascot/sun-mascot.svg

The mark existed in five disagreeing copies until 2026-09-21 — three with
an ink face, two with a white one, three different ray silhouettes — because
every copy was made by hand and nothing tied them together. This is the tie.

Derived here:
    assets/mascot/sun-mascot-cream.svg      master over the app's ground
    assets/mascot/sun-mascot-adaptive.svg   inside Android's 66% safe circle
    assets/icon.png            1024   app.json expo.icon
    assets/adaptive-icon.png   1024   android.adaptiveIcon.foregroundImage
    assets/favicon.png           48   web.favicon
    assets/splash-icon.png     1024   splash plugin + SplashAnimation

Derived elsewhere, and NOT written by this script — check them by hand when
the master changes:
    src/components/SunMascot.tsx        the three paths, verified by
                                        src/components/__tests__/mark.test.ts
    condaydigital: img/pt-sun.svg       a copy of the master
    marketing: remotion/public/mascot.png, video/assets/{mascot,icon}.png

Needs rsvg-convert and Pillow, both already on this box.
"""
import hashlib
import io
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MASTER = ROOT / "assets" / "mascot" / "sun-mascot.svg"
CREAM = "#F7F7F2"


def rsvg(src: pathlib.Path, px: int) -> bytes:
    out = subprocess.run(["rsvg-convert", "-w", str(px), "-h", str(px), str(src)],
                         capture_output=True, check=True)
    return out.stdout


def derive() -> dict[str, bytes]:
    src = MASTER.read_text(encoding="utf-8")
    anchor = "</title>"
    assert anchor in src, "master lost its <title>; the variants key off it"

    cream = src.replace(anchor, anchor + f'\n<rect width="32" height="32" fill="{CREAM}"/>')
    adaptive = src.replace('viewBox="0 0 32 32"', 'viewBox="-9.8 -9.8 51.6 51.6"')

    out = {
        "assets/mascot/sun-mascot-cream.svg": cream.encode("utf-8"),
        "assets/mascot/sun-mascot-adaptive.svg": adaptive.encode("utf-8"),
        "assets/icon.png": rsvg(MASTER, 1024),
        "assets/favicon.png": rsvg(MASTER, 48),
        "assets/splash-icon.png": rsvg(MASTER, 1024),
    }

    # Android's adaptive foreground: the mark must sit inside the 66% safe
    # circle, so it is inset rather than simply scaled to the canvas.
    from PIL import Image
    fg = Image.open(io.BytesIO(out["assets/icon.png"])).convert("RGBA")
    inner = int(1024 * 0.62)
    fg = fg.resize((inner, inner), Image.LANCZOS)
    canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    canvas.alpha_composite(fg, ((1024 - inner) // 2, (1024 - inner) // 2))
    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    out["assets/adaptive-icon.png"] = buf.getvalue()
    return out


def main() -> int:
    check = "--check" in sys.argv
    if not MASTER.is_file():
        print(f"master missing: {MASTER}", file=sys.stderr)
        return 1

    drifted = []
    for rel, data in derive().items():
        p = ROOT / rel
        same = p.is_file() and hashlib.sha256(p.read_bytes()).digest() == hashlib.sha256(data).digest()
        if same:
            continue
        if check:
            drifted.append(rel)
        else:
            p.write_bytes(data)
            print(f"wrote {rel}")

    if check:
        if drifted:
            print("drifted from assets/mascot/sun-mascot.svg:", file=sys.stderr)
            for r in drifted:
                print(f"  {r}", file=sys.stderr)
            print("\nrun: python3 scripts/mark.py", file=sys.stderr)
            return 1
        print("every derived copy matches the master")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
