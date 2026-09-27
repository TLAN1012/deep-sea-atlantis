"""Generate game art through the local Qwen-Image gateway, then post-process it.

Usage (run with ~/ComfyUI/.venv/bin/python):
  gen.py                 generate every missing asset in assets.py
  gen.py name1 name2     (re)generate just these, overwriting
  gen.py --process       re-run post-processing on existing raw images only
"""
import json, sys, time
from pathlib import Path

import numpy as np
import requests
from PIL import Image, ImageFilter
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).parent))
from assets import ASSETS, STYLE_SPRITE, STYLE_TEXTURE, STYLE_ART

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets/raw"
OUT = ROOT / "assets/img"
MANIFEST = ROOT / "assets/manifest.json"
GATEWAY = "http://127.0.0.1:8189"


def full_prompt(a):
    style = {"sprite": STYLE_SPRITE, "texture": STYLE_TEXTURE, "art": STYLE_ART}[a["kind"]]
    return style.format(subject=a["prompt"])


def generate(a):
    body = {"prompt": full_prompt(a), "mode": a.get("mode", "turbo"), "size": a.get("size", "1:1")}
    if "seed" in a:
        body["seed"] = a["seed"]
    t = time.time()
    r = requests.post(f"{GATEWAY}/api/generate", json=body, timeout=900)
    r.raise_for_status()
    (RAW / f"{a['name']}.png").write_bytes(r.content)
    print(f"  {a['name']}: seed {r.headers.get('X-Seed')} in {time.time() - t:.0f}s", flush=True)
    return int(r.headers.get("X-Seed", 0))


def cutout(img):
    """Remove the (near-)white background connected to the image border."""
    rgb = np.asarray(img.convert("RGB")).astype(np.int16)
    bright = rgb.min(axis=2)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    bgish = (bright > 222) & (sat < 28)
    labels, _ = ndimage.label(bgish)
    border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    bg = np.isin(labels, border[border > 0])
    fg = ~bg
    fg = ndimage.binary_opening(fg, iterations=2)          # drop specks
    lab, n = ndimage.label(fg)                               # keep sizeable parts only
    if n > 1:
        sizes = ndimage.sum(fg, lab, range(1, n + 1))
        keep = np.isin(lab, 1 + np.flatnonzero(sizes >= max(400, sizes.max() * 0.02)))
        fg &= keep
    fg = ndimage.binary_erosion(fg, iterations=1)
    alpha = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    out = img.convert("RGB").copy()
    out.putalpha(alpha)
    bbox = alpha.point(lambda v: 255 if v > 8 else 0).getbbox()
    out = out.crop(bbox)
    pad = 6
    canvas = Image.new("RGBA", (out.width + 2 * pad, out.height + 2 * pad), (0, 0, 0, 0))
    canvas.paste(out, (pad, pad))
    # bleed edge colours into transparent area so mipmaps don't get white halos
    arr = np.asarray(canvas).copy()
    a = arr[..., 3] > 128
    if a.any():
        idx = ndimage.distance_transform_edt(~a, return_distances=False, return_indices=True)
        arr[..., :3] = arr[..., :3][idx[0], idx[1]]
    return Image.fromarray(arr)


def make_tileable(img):
    """Blend the image with its half-offset copy so opposite edges match."""
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    h, w = a.shape[:2]
    s = np.roll(a, (h // 2, w // 2), axis=(0, 1))
    y = np.minimum(np.arange(h), h - 1 - np.arange(h)) / (h / 2)
    x = np.minimum(np.arange(w), w - 1 - np.arange(w)) / (w / 2)
    m = np.clip(np.minimum(y[:, None], x[None, :]) * 2.2, 0, 1)[..., None]
    m = m * m * (3 - 2 * m)
    return Image.fromarray((a * m + s * (1 - m)).clip(0, 255).astype(np.uint8))


def process(a):
    img = Image.open(RAW / f"{a['name']}.png")
    kind = a["kind"]
    if kind == "sprite":
        out = cutout(img)
        if a.get("flip"):
            out = out.transpose(Image.FLIP_LEFT_RIGHT)
        out.thumbnail((a.get("px", 512),) * 2, Image.LANCZOS)
        path = OUT / f"{a['name']}.webp"
        out.save(path, quality=88, method=6)
    elif kind == "texture":
        out = make_tileable(img).resize((a.get("px", 512),) * 2, Image.LANCZOS)
        path = OUT / f"{a['name']}.webp"
        out.save(path, quality=85, method=6)
    else:
        out = img.convert("RGB")
        out.thumbnail((a.get("px", 1024),) * 2, Image.LANCZOS)
        path = OUT / f"{a['name']}.webp"
        out.save(path, quality=85, method=6)
    return {"file": f"assets/img/{path.name}", "w": out.width, "h": out.height}


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    args = [x for x in sys.argv[1:] if not x.startswith("--")]
    only_process = "--process" in sys.argv
    by_name = {a["name"]: a for a in ASSETS}
    for n in args:
        if n not in by_name:
            sys.exit(f"unknown asset {n}")
    todo = [by_name[n] for n in args] if args else ASSETS
    for a in todo:
        raw = RAW / f"{a['name']}.png"
        if not only_process and (args or not raw.exists()):
            generate(a)
        if raw.exists():
            manifest[a["name"]] = {**process(a), "kind": a["kind"]}
            MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
            (ROOT / "assets/manifest.js").write_text("export default " + json.dumps(manifest, ensure_ascii=False) + ";\n")


if __name__ == "__main__":
    main()
