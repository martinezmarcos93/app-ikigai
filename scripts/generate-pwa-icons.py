#!/usr/bin/env python3
"""Generate consistent, opaque-black PWA and social assets from the approved Ikigai logo.

Requires Pillow (PIL). The source logo is deliberately not background-erased because its
black linework is integral to the samurai, weights, and lettering.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "ikigai-logo.jpg"
OUT = ROOT / "assets" / "pwa"
BRAND = ROOT / "assets" / "brand"
SOCIAL = ROOT / "assets" / "social"
OUT.mkdir(parents=True, exist_ok=True)
BRAND.mkdir(parents=True, exist_ok=True)
SOCIAL.mkdir(parents=True, exist_ok=True)

BLACK = (0, 0, 0, 255)
source = Image.open(SOURCE).convert("RGBA")


def make_icon(size: int, scale: float, filename: str) -> None:
    canvas = Image.new("RGBA", (size, size), BLACK)
    max_side = int(size * scale)
    logo = source.copy()
    logo.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    # Preserve the original proportions and center the complete logo.
    canvas.alpha_composite(logo, ((size - logo.width) // 2, (size - logo.height) // 2))
    canvas.convert("RGB").save(OUT / filename, format="PNG", optimize=True)


make_icon(192, 0.92, "icon-192.png")
make_icon(512, 0.92, "icon-512.png")
# Keep the important logo composition inside the maskable icon's central safe region.
make_icon(512, 0.72, "icon-maskable-512.png")
make_icon(48, 0.94, "favicon-48.png")
make_icon(180, 0.92, "apple-touch-icon.png")

# Open Graph image: black field with the unmodified logo centered and fully visible.
canvas = Image.new("RGBA", (1200, 630), BLACK)
logo = source.copy()
logo.thumbnail((680, 610), Image.Resampling.LANCZOS)
canvas.alpha_composite(logo, ((1200 - logo.width) // 2, (630 - logo.height) // 2))
canvas.convert("RGB").save(SOCIAL / "og-image.png", format="PNG", optimize=True)

print("Generated PWA assets from", SOURCE.relative_to(ROOT), "source size", source.size)
for path in sorted(OUT.glob("*.png")):
    with Image.open(path) as image:
        print(path.relative_to(ROOT), image.size, image.mode)
