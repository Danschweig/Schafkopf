# SPDX-License-Identifier: AGPL-3.0-only
"""Prepare rank-first reader data. Only reviewed training photos, never test/."""
import argparse
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from card_index_reader import ROOT, SIZE, RANKS, SUITS, GLYPHS, TARGET, digest, save_json, prepare_patch, audit_dataset

spec = spec_from_file_location("corner_data", ROOT/"scripts/prepare-card-training.py")
BASE = module_from_spec(spec)
spec.loader.exec_module(BASE)


def synthetic_glyph(glyph, font_path, rng, layout=False):
    paper = int(rng.integers(205, 256))
    image = Image.new("RGB", (160, 160), (paper, paper, paper))
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(str(font_path), int(rng.integers(40, 66) if layout else rng.integers(65, 110)))
    box = draw.textbbox((0, 0), glyph, font=font)
    x = (160-(box[2]-box[0]))//2-box[0]+int(rng.integers(-9, 10))
    y = (int(rng.integers(18, 40))-box[1] if layout else (160-(box[3]-box[1]))//2-box[1]+int(rng.integers(-9, 10)))
    ink = int(rng.integers(0, 65))
    draw.text((x, y), glyph, font=font, fill=(ink, ink, ink))
    if layout:
        # Distractors have no suit label. Teach reading a small rank glyph next
        # to coloured marks and card lines, without inventing suit annotations.
        bottom = y+box[3]
        cx, cy = 80+int(rng.integers(-5, 6)), bottom+int(rng.integers(15, 22))
        colour = (int(rng.integers(100, 180)), 25, 25) if rng.random() < .5 else (20, int(rng.integers(65, 125)), 45)
        radius = int(rng.integers(8, 13))
        if rng.random() < .5:
            draw.ellipse((cx-radius, cy-radius, cx+radius, cy+radius), fill=colour)
        else:
            draw.polygon([(cx, cy-radius), (cx-radius, cy+radius), (cx+radius, cy+radius)], fill=colour)
        draw.line((cx, cy+radius, cx, 159), fill=(80, 80, 70), width=1)
        if rng.random() < .7:
            draw.arc((35, 5, 210, 70), 180, 275, fill=(70, 70, 65), width=1)
        if rng.random() < .5:
            draw.ellipse((140, 70, 210, 165), fill=colour)
    angle = int(rng.integers(4))*90+float(rng.uniform(-20, 20))
    image = image.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True, fillcolor=(paper, paper, paper))
    array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    return prepare_patch(array)


def prepare(out, font_directory, glyphs_per_rank=128, seed=20261023):
    out = out.resolve()
    out.relative_to(ROOT/".tools/card-training")
    out.mkdir(parents=True, exist_ok=False)
    for split in ["train", "val"]:
        (out/"images"/split).mkdir(parents=True)
    manifest = {"version": 2, "target": TARGET, "ranks": RANKS, "suits": SUITS, "seed": seed, "sources": [], "samples": [],
                "rankLossWeight": 2.5, "input": {"size": SIZE, "order": "RGB NCHW", "range": [0, 1], "resize": "aspect-preserving white letterbox"},
                "validationPolicy": "Internal diagnostic only. Synthetic rank validation holds out complete font families. Reference-sheet validation uses another photograph of the SAME deck. All 13 real hand photos remain together in training; no independent evening or deck test is claimed.",
                "testPolicy": "test/ is never read. No test-photo tuning or automatic app-model replacement.", "generatorSha256": digest(__file__)}
    previews = {"train": [], "val": []}

    def add_source(file, kind, group):
        record = {"file": file.relative_to(ROOT/"kartenfotos").as_posix() if kind == "photo" else str(file.resolve()), "kind": kind, "sha256": digest(file), "group": group}
        manifest["sources"].append(record)
        return record

    def emit(rgb, split, rank, suit, group, source, kind, suit_supervised=True, box=None):
        index = len(manifest["samples"])
        file = f"images/{split}/{index:05d}.png"
        cv2.imwrite(str(out/file), cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
        record = {"file": file, "sha256": digest(out/file), "split": split, "rank": rank, "suit": suit, "suitSupervised": suit_supervised, "group": group, "kind": kind, "sourceSha256": source["sha256"]}
        if box is not None:
            record["sourceIndexBox"] = box
        manifest["samples"].append(record)
        if kind != "rendered-glyph" or len(previews[split]) < 48:
            if len(previews[split]) < 112:
                cell = np.full((116, 104, 3), 245, np.uint8)
                cell[18:114, 4:100] = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
                title = (GLYPHS[rank] if rank < 8 else "?")+" / "+(SUITS[suit] if suit_supervised else "rank only")
                cv2.putText(cell, title, (2, 12), cv2.FONT_HERSHEY_SIMPLEX, .3, (0, 0, 0), 1)
                previews[split].append(cell)

    # The reference indices are already reviewed by the existing detector recipe.
    for split, filename in [("train", "karten2.png"), ("val", "karten1.png")]:
        group = "reference-sheet-"+filename
        for suit_id, suit in enumerate(SUITS[:4]):
            for rank_id, rank in enumerate(RANKS[:8]):
                file = ROOT/"kartenfotos/einzelkarten"/suit/rank/filename
                source = add_source(file, "photo", group)
                image = cv2.imread(str(file))
                if image is None:
                    raise ValueError(f"Reference missing: {file}")
                height, width = image.shape[:2]
                # Use only the complete upper-left index. Some photographed
                # reference cards have cropped right/bottom indices; the old
                # four-corner approximation must not label an empty crop as a glyph.
                for fractional in [[.025, .04, .20, .255]]:
                    x1, y1, x2, y2 = np.round(np.array(fractional)*[width, height, width, height]).astype(int)
                    emit(prepare_patch(image[y1:y2, x1:x2]), split, rank_id, suit_id, group, source, "photographed-index", box=[int(x1), int(y1), int(x2), int(y2)])

    for labels in sorted((ROOT/"kartenfotos/training").glob("*.labels.json")):
        metadata = json.loads(labels.read_text(encoding="utf-8"))
        file = (ROOT/"kartenfotos"/metadata["source"]).resolve()
        file.relative_to((ROOT/"kartenfotos/training").resolve())
        if metadata.get("split") != "training" or "reviewed" not in metadata.get("annotationMethod", "") or digest(file) != metadata["sourceSha256"]:
            raise ValueError(f"Unreviewed or changed photo: {file.name}")
        group = "known-evening-all-real-hands"
        source = add_source(file, "photo", group)
        source["annotationsSha256"] = digest(labels)
        source["annotations"] = labels.relative_to(ROOT/"kartenfotos").as_posix()
        image = cv2.imread(str(file))
        image, annotations = BASE.oriented_training_hand(image, metadata)
        for ann in annotations:
            suit, rank = ann["cardId"].split("-")
            x1, y1, x2, y2 = map(int, ann["indexBox"])
            if x1 < 0 or y1 < 0 or x2 > image.shape[1] or y2 > image.shape[0] or x2 <= x1 or y2 <= y1:
                raise ValueError("Invalid reviewed crop")
            emit(prepare_patch(image[y1:y2, x1:x2]), "train", RANKS.index(rank), SUITS.index(suit), group, source, "real-hand-index", box=[x1, y1, x2, y2])

    font_families = {"train": {"arial": ["arial.ttf", "arialbd.ttf"], "times": ["times.ttf", "timesbd.ttf"], "courier": ["cour.ttf", "courbd.ttf"], "georgia": ["georgia.ttf", "georgiab.ttf"]},
                     "val": {"verdana": ["verdana.ttf", "verdanab.ttf"], "trebuchet": ["trebuc.ttf", "trebucbd.ttf"]}}
    rng = np.random.default_rng(seed)
    for split, families in font_families.items():
        fonts = []
        for family, names in families.items():
            for name in names:
                file = font_directory/name
                if not file.is_file():
                    raise ValueError(f"Font missing: {file}. Set --fonts to a directory with the documented families.")
                fonts.append((file, family, add_source(file, "font", "font-family-"+family)))
        per_rank = glyphs_per_rank if split == "train" else max(16, glyphs_per_rank//4)
        for rank, glyph in enumerate(GLYPHS):
            for example in range(per_rank):
                file, family, source = fonts[int(rng.integers(len(fonts)))]
                # A standalone glyph has no visible suit. Teach explicit abstention.
                layout = example%2 == 0
                emit(synthetic_glyph(glyph, file, rng, layout=layout), split, rank, 4, "font-family-"+family, source,
                     "rendered-index" if layout else "rendered-glyph", suit_supervised=not layout)
        # Blank/background indices teach abstention instead of forced recognition.
        source = add_source(Path(__file__), "generator", "blank-"+split)
        for _ in range(64 if split == "train" else 24):
            paper = np.uint8(np.clip(rng.normal(rng.uniform(185, 253), rng.uniform(.5, 3), (SIZE, SIZE, 3)), 0, 255))
            emit(paper, split, 8, 4, "blank-"+split, source, "blank")

    for split, cells in previews.items():
        while len(cells)%8:
            cells.append(np.full_like(cells[0], 245))
        cv2.imwrite(str(out/f"preview-{split}.jpg"), np.vstack([np.hstack(cells[index:index+8]) for index in range(0, len(cells), 8)]))
    # A separate character sheet makes font diversity directly reviewable.
    for split in ["train", "val"]:
        examples = [item for item in manifest["samples"] if item["split"] == split and item["kind"] in ("rendered-glyph", "rendered-index")]
        cells = []
        for rank in range(8):
            for item in [row for row in examples if row["rank"] == rank][:8]:
                cells.append(cv2.imread(str(out/item["file"])))
        cv2.imwrite(str(out/f"glyphs-{split}.jpg"), np.vstack([np.hstack(cells[index:index+8]) for index in range(0, len(cells), 8)]))
    save_json(out/"manifest.json", manifest)
    _, report = audit_dataset(out)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=".tools/card-training/index-reader-v2")
    parser.add_argument("--fonts", default="C:/Windows/Fonts")
    parser.add_argument("--glyphs-per-rank", type=int, default=256)
    parser.add_argument("--audit", action="store_true")
    args = parser.parse_args()
    if args.glyphs_per_rank < 16:
        raise ValueError("At least 16 generated examples per rank required")
    if args.audit:
        _, result = audit_dataset(ROOT/args.output)
        print(json.dumps(result, indent=2))
    else:
        prepare(ROOT/args.output, Path(args.fonts), args.glyphs_per_rank)
