"""Assemble docs/demo.gif from docs/_demo-frames (fullscreen + cursor)."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FRAME_DIR = ROOT / "docs" / "_demo-frames"
OUT = ROOT / "docs" / "demo.gif"
# Keep native 1440×900 — README width attr scales display; GIF stays sharp/full UI.
TARGET_W = 1440


def main() -> None:
    meta_path = FRAME_DIR / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    entries = meta["meta"]
    files = [FRAME_DIR / Path(e["file"]).name for e in entries]
    durations = [int(e.get("holdMs", 120)) for e in entries]

    rgb_frames: list[Image.Image] = []
    for f in files:
        im = Image.open(f).convert("RGB")
        w, h = im.size
        if w != TARGET_W:
            nh = max(1, round(h * TARGET_W / w))
            im = im.resize((TARGET_W, nh), Image.Resampling.LANCZOS)
        rgb_frames.append(im)

    strip_h = sum(im.height for im in rgb_frames)
    strip = Image.new("RGB", (TARGET_W, strip_h))
    y = 0
    for im in rgb_frames:
        strip.paste(im, (0, y))
        y += im.height
    pw = 640
    ph = max(1, round(strip.height * pw / strip.width))
    pal = strip.resize((pw, ph), Image.Resampling.BOX).quantize(
        colors=256, method=Image.Quantize.MEDIANCUT
    )
    frames = [im.quantize(palette=pal, dither=Image.Dither.NONE) for im in rgb_frames]

    frames[0].save(
        OUT,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=2,
    )
    kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT} ({kb:.1f} KB, {len(frames)} frames, {frames[0].size})")


if __name__ == "__main__":
    main()
