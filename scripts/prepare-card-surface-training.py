"""Create photographed-card scenes with exact visible-surface labels and occlusions.

Uses only the reviewed individual reference cards and training-photo backgrounds.
Test photos are never opened. Originals are never modified. All output is local.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import runpy

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "kartenfotos"
BASE = runpy.run_path(str(ROOT / "scripts/prepare-card-training.py"))
IDS, NAMES, SIZE = BASE["IDS"], BASE["NAMES"], BASE["SIZE"]
MODES = ("clear", "edge-covered", "all-corners-covered", "top-bottom-covered")


def covered_card(image, rng, mode):
    """Return image, actual remaining surface mask, and corner-cover mask."""
    image = image.copy()
    height, width = image.shape[:2]
    surface = np.full((height, width), 255, np.uint8)
    covered = np.zeros_like(surface)
    if mode == "edge-covered":
        side = int(rng.integers(4))
        fraction = rng.uniform(.17, .31)
        if side == 0:
            covered[:int(height*fraction)] = 255
        elif side == 1:
            covered[-int(height*fraction):] = 255
        elif side == 2:
            covered[:, :int(width*fraction)] = 255
        else:
            covered[:, -int(width*fraction):] = 255
    elif mode == "all-corners-covered":
        # These rectangles contain ALL four rank/suit indices, including margin.
        # No rank or suit from any index is left as a shortcut.
        for right, bottom in [(False, False), (True, False), (False, True), (True, True)]:
            dx, dy = int(width*rng.uniform(.26, .34)), int(height*rng.uniform(.25, .30))
            left, top = width-dx if right else 0, height-dy if bottom else 0
            covered[top:top+dy, left:left+dx] = 255
    elif mode == "top-bottom-covered":
        covered[:int(height*rng.uniform(.26, .31))] = 255
        covered[-int(height*rng.uniform(.26, .31)):] = 255
    elif mode != "clear":
        raise ValueError(f"Unknown cover mode: {mode}")
    # Mix fabric/paper/skin-like colours, independently of the card identity.
    colour = rng.uniform(35, 210, 3)
    texture = np.uint8(np.clip(colour+rng.normal(0, 3, (*surface.shape, 1)), 0, 255))
    image[covered > 0] = texture[covered > 0]
    surface[covered > 0] = 0
    return image, surface, covered


def visible_labels(owner, cards, min_fraction=.10):
    """Boxes cover actual visible pixels; fully hidden cards have no label."""
    labels, records = [], []
    for number, info in enumerate(cards, 1):
        ys, xs = np.where(owner == number)
        fraction = len(xs)/max(1, info["projectedArea"])
        if len(xs) < 160 or fraction < min_fraction:
            # Never treat tiny, intrinsically unrecognisable scraps as positives.
            continue
        box = [int(xs.min()), int(ys.min()), int(xs.max())+1, int(ys.max())+1]
        if box[2]-box[0] < 10 or box[3]-box[1] < 16:
            continue
        labels.append((info["classId"], box))
        records.append({"cardId": IDS[info["classId"]], "box": box,
                        "visibleFraction": round(fraction, 4), "coverMode": info["coverMode"]})
    return labels, records


def scene(refs, rng, index, photos=None):
    canvas = BASE["background"](rng, photos)
    owner = np.zeros((SIZE, SIZE), np.uint8)
    if index % 25 == 0:
        return canvas, [], [], "blank"
    kind = ("single", "fan", "fan", "spread")[index % 4]
    if kind == "single":
        # Balanced single-card views teach the motifs of every one of the 32 IDs.
        classes = [((index//4)-1) % 32]
    else:
        classes = rng.choice(32, size=8 if kind == "fan" else int(rng.integers(2, 6)), replace=False)
    base_angle = rng.uniform(-30, 30) + int(rng.choice([0, 0, 0, 90, 180, 270]))
    cards = []
    for position, cls in enumerate(classes):
        reference = refs[int(cls)]
        height, width = reference.shape[:2]
        # Half of the cover modes deliberately remove every corner index.
        # Choose independently of class and position to prevent label shortcuts.
        cover_mode = MODES[int(rng.integers(len(MODES)))]
        image, visible_surface, _ = covered_card(reference, rng, cover_mode)
        if kind == "fan":
            card_height = rng.uniform(300, 405)
            cx = 135+position*49+rng.uniform(-5, 5)
            cy = rng.uniform(330, 390)
            angle = base_angle+(position-3.5)*rng.uniform(3, 5)
        elif kind == "single":
            card_height = rng.uniform(250, 525)
            cx, cy = rng.uniform(250, 390, 2)
            angle = base_angle+rng.uniform(-20, 20)
        else:
            card_height = rng.uniform(190, 330)
            cx, cy = rng.uniform(120, 520, 2)
            angle = rng.uniform(-180, 180)
        matrix = cv2.getRotationMatrix2D((width/2, height/2), angle, card_height/height)
        matrix[:, 2] += [cx-width/2, cy-height/2]
        # Small perspective variation prevents learning only affine cutout edges.
        affine = np.vstack([matrix, [0, 0, 1]])
        perspective = np.array([[1, rng.uniform(-.025, .025), 0],
                                [rng.uniform(-.025, .025), 1, 0],
                                [rng.uniform(-.00008, .00008), rng.uniform(-.00008, .00008), 1]])
        transform = perspective @ affine
        solid = cv2.warpPerspective(np.full((height, width), 255, np.uint8), transform, (SIZE, SIZE), flags=cv2.INTER_NEAREST) > 0
        visible = cv2.warpPerspective(visible_surface, transform, (SIZE, SIZE), flags=cv2.INTER_NEAREST) > 0
        warped = cv2.warpPerspective(image, transform, (SIZE, SIZE), flags=cv2.INTER_LINEAR)
        # An opaque covering may obscure a previous card, but is never a target.
        canvas[solid] = warped[solid]
        owner[solid] = 0
        owner[visible] = position+1
        cards.append({"classId": int(cls), "projectedArea": int(np.count_nonzero(solid)), "coverMode": cover_mode})
    if kind != "single" and index % 3 == 0:
        # An additional palm/finger-like foreground occluder, with exact ownership.
        center = tuple(int(v) for v in rng.uniform([180, 400], [460, 585]))
        axes = (int(rng.uniform(70, 160)), int(rng.uniform(22, 60)))
        angle = float(rng.uniform(-55, 55))
        colour = tuple(int(v) for v in rng.uniform(70, 205, 3))
        cv2.ellipse(canvas, center, axes, angle, 0, 360, colour, -1)
        cv2.ellipse(owner, center, axes, angle, 0, 360, 0, -1)
    labels, records = visible_labels(owner, cards)
    # Remove tiny unlabeled remnants as well: they must not become false negatives.
    retained = {IDS.index(record["cardId"]) for record in records}
    for number, info in enumerate(cards, 1):
        if info["classId"] not in retained:
            pixels = owner == number
            canvas[pixels] = np.uint8(rng.uniform(50, 180, 3))
    return BASE["photo_effects"](canvas, rng), labels, records, kind


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=".tools/card-training/surfaces-v1")
    parser.add_argument("--train", type=int, default=768)
    parser.add_argument("--val", type=int, default=128)
    parser.add_argument("--seed", type=int, default=20261025)
    args = parser.parse_args()
    if args.train < 512 or args.val < 128:
        raise ValueError("At least 512 training and 128 validation scenes are required.")
    out = (ROOT/args.output).resolve()
    out.relative_to(ROOT/".tools/card-training")
    out.mkdir(parents=True, exist_ok=False)
    provenance = {"version": 1, "target": "card", "seed": args.seed, "sources": [],
                  "generator": {"script": "scripts/prepare-card-surface-training.py", "train": args.train,
                                "val": args.val, "coverModes": list(MODES), "validationSeed": 91283},
                  "testPolicy": "No test photographs or derivatives are opened during generation or training.",
                  "labelPolicy": "One axis-aligned box around each sufficiently visible card surface; covered pixels are not positive targets.",
                  "limitation": "Synthetic compositions of 32 photographed cards. Validation uses another known reference photo, not independent real hand photographs. Severe occlusion can make ranks intrinsically ambiguous."}
    backgrounds = []
    for labels_file in sorted((DATA/"training").glob("*.labels.json")):
        meta = json.loads(labels_file.read_text(encoding="utf-8"))
        source = (DATA/meta["source"]).resolve()
        source.relative_to((DATA/"training").resolve())
        assert meta["split"] == "training" and BASE["digest"](source) == meta["sourceSha256"]
        image = cv2.imread(str(source))
        image, annotations = BASE["oriented_training_hand"](image, meta)
        # The region above the hand contains no annotated card. Existing reviewed
        # index boxes are used only to exclude the hand, not as surface labels.
        top = int(min(ann["indexBox"][1] for ann in annotations)*.65)
        if top < 100:
            continue
        backgrounds.append(cv2.resize(image[:top], (SIZE, SIZE)))
        provenance["sources"].append({"file": source.relative_to(DATA).as_posix(), "sha256": BASE["digest"](source),
                                      "split": "train", "role": "background-only", "annotationsSha256": BASE["digest"](labels_file)})
    manifest = []
    statistics = {}
    preview = []
    for split, filename, count, seed in [("train", "karten2.png", args.train, args.seed), ("val", "karten1.png", args.val, 91283)]:
        refs = []
        for cid in IDS:
            suit, rank = cid.split("-")
            source = DATA/"einzelkarten"/suit/rank/filename
            image = cv2.imread(str(source))
            assert image is not None, source
            refs.append(cv2.resize(image, (round(image.shape[1]*500/image.shape[0]), 500)))
            provenance["sources"].append({"file": source.relative_to(DATA).as_posix(), "sha256": BASE["digest"](source), "split": split, "role": "card-reference"})
        for directory in [out/"images"/split, out/"labels"/split]:
            directory.mkdir(parents=True)
        rng = np.random.default_rng(seed)
        classes, modes, scenes = Counter(), Counter(), Counter()
        for index in range(count):
            image, labels, records, kind = scene(refs, rng, index, backgrounds if split == "train" else None)
            name = f"surface-{index:04d}"
            BASE["save_sample"](out, split, name, image, labels)
            manifest.append({"split": split, "file": name+".jpg", "kind": kind, "cards": records})
            classes.update(record["cardId"] for record in records)
            modes.update(record["coverMode"] for record in records)
            scenes[kind] += 1
            if split == "train" and 1 <= index <= 16:
                thumb = image.copy()
                for cls, box in labels:
                    cv2.rectangle(thumb, tuple(box[:2]), tuple(box[2:]), (50, 255, 50), 2)
                    cv2.putText(thumb, NAMES[cls], (box[0], max(10, box[1]-3)), cv2.FONT_HERSHEY_SIMPLEX, .34, (0, 0, 0), 2)
                    cv2.putText(thumb, NAMES[cls], (box[0], max(10, box[1]-3)), cv2.FONT_HERSHEY_SIMPLEX, .34, (50, 255, 50), 1)
                preview.append(cv2.resize(thumb, (320, 320)))
        assert len(classes) == 32, (split, classes)
        assert all(modes[mode] > 0 for mode in MODES)
        statistics[split] = {"images": count, "objects": sum(classes.values()), "classes": dict(classes), "coverModes": dict(modes), "scenes": dict(scenes)}
        print(json.dumps({"split": split, "images": count, "objects": sum(classes.values())}), flush=True)
    BASE["save_json"](out/"dataset.yaml", {"path": out.as_posix(), "train": "images/train", "val": "images/val", "names": dict(enumerate(NAMES))})
    provenance["generatorSha256"] = BASE["digest"](Path(__file__))
    provenance["helperSha256"] = BASE["digest"](ROOT/"scripts/prepare-card-training.py")
    BASE["save_json"](out/"provenance.json", provenance)
    BASE["save_json"](out/"scenes.json", manifest)
    BASE["save_json"](out/"statistics.json", statistics)
    contact = np.vstack([np.hstack(preview[i:i+4]) for i in range(0, len(preview), 4)])
    cv2.imwrite(str(out/"preview.jpg"), contact)
    print(json.dumps({"dataset": str(out/"dataset.yaml"), "testImagesUsed": 0}), flush=True)


if __name__ == "__main__":
    main()
