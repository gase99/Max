"""
Generate the Windows application icon for Cabinet Analysis Pro.

The mark is a geometric "cabinet" glyph (two panels + a shelf line) on the
product's industrial dark-amber palette, so the icon matches the in-app design
system instead of being an arbitrary image.

Output: apps/desktop/build/icon.ico  (multi-resolution Windows icon)
        apps/desktop/build/icon.png  (512 px, used by docs / marketing)

Run:  ./.venv/bin/python tools/make_icon.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

BG_TOP = (26, 32, 39)
BG_BOTTOM = (11, 14, 17)
AMBER = (240, 167, 42)
AMBER_DIM = (184, 123, 18)
STEEL = (233, 238, 245)

OUT = Path(__file__).resolve().parent.parent / "apps" / "desktop" / "build"


def draw_icon(size: int = 512) -> Image.Image:
    # Supersample for clean edges, then downscale.
    s = size * 4
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Rounded square background with a subtle vertical gradient.
    radius = int(s * 0.22)
    bg = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bg)
    for y in range(s):
        t = y / max(1, s - 1)
        col = tuple(round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3))
        bd.line([(0, y), (s, y)], fill=col + (255,))
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=255)
    img.paste(bg, (0, 0), mask)

    # Amber top accent bar.
    bar_h = int(s * 0.055)
    d.rounded_rectangle(
        [int(s * 0.10), int(s * 0.10), int(s * 0.90), int(s * 0.10) + bar_h],
        radius=bar_h // 2,
        fill=AMBER,
    )

    # Cabinet body: two side panels (steel) + shelf lines.
    left = int(s * 0.24)
    right = int(s * 0.76)
    top = int(s * 0.26)
    bottom = int(s * 0.86)
    panel_w = int(s * 0.075)

    d.rounded_rectangle([left, top, left + panel_w, bottom], radius=int(s * 0.018), fill=STEEL)
    d.rounded_rectangle([right - panel_w, top, right, bottom], radius=int(s * 0.018), fill=STEEL)

    # Shelves.
    shelf_h = int(s * 0.042)
    for frac in (0.34, 0.60):
        y = int(top + (bottom - top) * frac)
        d.rounded_rectangle(
            [left + panel_w, y, right - panel_w, y + shelf_h],
            radius=shelf_h // 2,
            fill=AMBER_DIM,
        )

    # Base.
    d.rounded_rectangle(
        [left + panel_w, bottom - shelf_h, right - panel_w, bottom],
        radius=shelf_h // 2,
        fill=AMBER,
    )

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    master = draw_icon(512)
    master.save(OUT / "icon.png")

    sizes = [16, 24, 32, 48, 64, 128, 256]
    frames = [draw_icon(n) for n in sizes]
    # Pillow writes a proper multi-image .ico when given `sizes` + a base image.
    master.save(OUT / "icon.ico", format="ICO", sizes=[(n, n) for n in sizes])
    (OUT / "icon.ico").write_bytes((OUT / "icon.ico").read_bytes())

    print("wrote", OUT / "icon.ico", (OUT / "icon.ico").stat().st_size, "bytes")
    print("wrote", OUT / "icon.png", (OUT / "icon.png").stat().st_size, "bytes")
    print("ico frames:", [im.size for im in frames])


if __name__ == "__main__":
    main()
