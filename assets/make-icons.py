"""Generate the app-icon set for the capture app from the brand logo.

Reads `logo.png` (the Pronatura roundel, transparent) and emits the assets
`app.json` references. Run from this folder:  python make-icons.py

Outputs (1024x1024 unless noted):
- icon.png          — logo on a white square (base `expo.icon`, iOS/legacy launcher)
- adaptive-icon.png — logo inside the Android adaptive safe zone, transparent
                      (paired with android.adaptiveIcon.backgroundColor)
- splash.png        — logo centered with padding, transparent (shown on the splash bg)

Background for the opaque icon is white so the vivid multi-color logo reads
cleanly; change BG below to a brand color (e.g. Tide #1b5c5a) if desired.
"""
from PIL import Image

S = 1024
BG = (255, 255, 255, 255)          # white backdrop for the opaque launcher icon
SRC = "logo.png"


def scaled(logo: Image.Image, frac: float) -> tuple[Image.Image, int]:
    d = round(S * frac)
    return logo.resize((d, d), Image.LANCZOS), (S - d) // 2


def main() -> None:
    logo = Image.open(SRC).convert("RGBA")

    # icon.png — logo ~92% on a white square, flattened (no transparency)
    base = Image.new("RGBA", (S, S), BG)
    lg, off = scaled(logo, 0.92)
    base.alpha_composite(lg, (off, off))
    base.convert("RGB").save("icon.png")

    # adaptive-icon.png — logo ~68% (adaptive safe zone) on transparent
    adap = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    lg, off = scaled(logo, 0.68)
    adap.alpha_composite(lg, (off, off))
    adap.save("adaptive-icon.png")

    # splash.png — logo ~45% centered on transparent (splash uses `contain`)
    spl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    lg, off = scaled(logo, 0.45)
    spl.alpha_composite(lg, (off, off))
    spl.save("splash.png")

    print("wrote icon.png, adaptive-icon.png, splash.png (1024x1024)")


if __name__ == "__main__":
    main()
