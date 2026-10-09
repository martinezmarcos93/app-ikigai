#!/usr/bin/env python3
"""Validate generated Ikigai brand/PWA assets without modifying them."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {
    "assets/pwa/icon-192.png": (192, 192),
    "assets/pwa/icon-512.png": (512, 512),
    "assets/pwa/icon-maskable-512.png": (512, 512),
    "assets/pwa/favicon-48.png": (48, 48),
    "assets/pwa/apple-touch-icon.png": (180, 180),
    "assets/social/og-image.png": (1200, 630),
}
manifest = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8"))
icons = {item["src"].removeprefix("./"): item for item in manifest.get("icons", [])}
for path, size in EXPECTED.items():
    full = ROOT / path
    if not full.is_file():
        raise SystemExit(f"Missing generated brand asset: {path}")
    with Image.open(full) as image:
        if image.size != size:
            raise SystemExit(f"{path}: expected {size}, got {image.size}")
        if image.mode not in ("RGB", "RGBA"):
            raise SystemExit(f"{path}: unexpected image mode {image.mode}")
        if image.convert("RGB").getpixel((0, 0)) != (0, 0, 0):
            raise SystemExit(f"{path}: expected black background at top-left corner")
        print(f"OK {path}: {image.size}, {image.mode}")

expected_icons = {
    "assets/pwa/icon-192.png": ("192x192", "any"),
    "assets/pwa/icon-512.png": ("512x512", "any"),
    "assets/pwa/icon-maskable-512.png": ("512x512", "maskable"),
}
for path, (size, purpose) in expected_icons.items():
    item = icons.get(path)
    if not item or item.get("sizes") != size or item.get("purpose") != purpose or item.get("type") != "image/png":
        raise SystemExit(f"Manifest entry missing or invalid for {path}")

tokens = (ROOT / "assets/brand/tokens.css").read_text(encoding="utf-8").lower()
if "--ikigai-brand-red: #e31a20;" not in tokens:
    raise SystemExit("Measured Ikigai red token is missing or changed without review.")
if "assets/ikigai-logo.jpg" not in (ROOT / "assets/brand/README.md").read_text(encoding="utf-8"):
    raise SystemExit("Brand source/provenance must be documented.")
print("Brand asset dimensions, manifest entries, and measured red token validated.")
