"""Mix visually reviewed real card surfaces with synthetic occlusion scenes.

Source-photo splits are fixed BEFORE augmentation. No test photos are read.
The earlier corner model has already seen these photos; validation is internal.
"""
import argparse
from collections import Counter
import json
import math
from pathlib import Path
import runpy

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT/"kartenfotos"
GEN = runpy.run_path(str(ROOT/"scripts/prepare-card-surface-training.py"))
BASE, IDS, NAMES = GEN["BASE"], GEN["IDS"], GEN["NAMES"]
VALIDATION_HANDS = {"Handkarten2", "IMG_7933", "IMG_7941"}


def save_json(path, value):
    BASE["save_json"](path, value)


def load_hand(source, metadata):
    image = cv2.imread(str(source))
    assert image is not None and image.shape[:2] == (metadata["height"], metadata["width"])
    polygons = [(ann["cardId"], np.float32(ann["visiblePolygon"])) for ann in metadata["annotations"]]
    indices = json.loads(source.with_suffix(".labels.json").read_text(encoding="utf-8"))["annotations"]
    index_polygons = [np.float32([[a, b], [c, b], [c, d], [a, d]])
                      for item in indices for a, b, c, d in [item["indexBox"]]]
    for _ in range(metadata.get("trainingRotationDegreesCCW", 0)//90):
        height, width = image.shape[:2]
        image = cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)
        rotation = np.float32([[0, 1, 0], [-1, 0, width-1]])
        polygons = [(cid, cv2.transform(points[None], rotation)[0]) for cid, points in polygons]
        index_polygons = [cv2.transform(points[None], rotation)[0] for points in index_polygons]
    scale = min(1, 2000/max(image.shape[:2]))
    image = cv2.resize(image, (round(image.shape[1]*scale), round(image.shape[0]*scale)))
    polygons = [(cid, points*scale) for cid, points in polygons]
    index_polygons = [points*scale for points in index_polygons]
    owner = np.zeros(image.shape[:2], np.uint8)
    for number, (_, points) in enumerate(polygons, 1):
        cv2.fillPoly(owner, [np.int32(points)], number)
    return image, owner, polygons, index_polygons


def real_sample(hand, rng, number):
    image, owner, polygons, indices = hand
    height, width = image.shape[:2]
    all_points = np.concatenate([points for _, points in polygons])
    lo, hi = all_points.min(0), all_points.max(0)
    # Preserve the actual whole-photo scale in a quarter of all samples.
    full = number % 4 == 0
    if full:
        x1, y1, x2, y2 = 0, 0, width, height
    else:
        padding = (hi-lo)*(.12 if number == 2 else rng.uniform(.08, .65))
        x1, y1 = np.maximum(0, lo-padding).astype(int)
        x2, y2 = np.minimum([width, height], hi+padding).astype(int)
    crop = image[y1:y2, x1:x2]
    crop_owner = owner[y1:y2, x1:x2]
    ch, cw = crop.shape[:2]
    exact = number in (0, 2)
    angle = 0 if exact else float(rng.uniform(-12, 12))
    if not exact and number % 6 == 5:
        angle += int(rng.choice([90, 180, 270]))
    radians = math.radians(angle)
    rotated_width = abs(cw*math.cos(radians))+abs(ch*math.sin(radians))
    rotated_height = abs(ch*math.cos(radians))+abs(cw*math.sin(radians))
    scale = (640 if exact else 608)/max(rotated_width, rotated_height)
    transform = cv2.getRotationMatrix2D((cw/2, ch/2), angle, scale)
    transform[:, 2] += [320-cw/2, 320-ch/2]
    output = cv2.warpAffine(crop, transform, (640, 640), borderValue=(114, 114, 114))
    labels_owner = cv2.warpAffine(crop_owner, transform, (640, 640), flags=cv2.INTER_NEAREST)
    before_counts = [np.count_nonzero(labels_owner == own) for own in range(1, 9)]
    mode = "clear"
    if number % 4 == 1:
        mode = "annotated-indices-covered"
        for points in indices:
            # Hide the annotated indices, including the extra opposite corner
            # where it exists. Do not claim all unannotated indices are hidden.
            center = points.mean(0)
            expanded = center+(points-center)*1.25
            mapped = cv2.transform((expanded-[x1, y1])[None].astype(np.float32), transform)[0]
            colour = tuple(int(value) for value in rng.uniform(75, 185, 3))
            cv2.fillPoly(output, [np.int32(mapped)], colour)
            cv2.fillPoly(labels_owner, [np.int32(mapped)], 0)
    elif number % 8 == 6:
        mode = "foreground-covered"
        visible_y, visible_x = np.where(labels_owner > 0)
        center = (int(np.median(visible_x)), int(np.quantile(visible_y, .65)))
        axes = (int(rng.uniform(25, 65)), int(rng.uniform(15, 35)))
        angle_cover = float(rng.uniform(-45, 45))
        colour = tuple(int(value) for value in rng.uniform(70, 190, 3))
        cv2.ellipse(output, center, axes, angle_cover, 0, 360, colour, -1)
        cv2.ellipse(labels_owner, center, axes, angle_cover, 0, 360, 0, -1)
    labels, records = [], []
    for own, (cid, _) in enumerate(polygons, 1):
        ys, xs = np.where(labels_owner == own)
        fraction = len(xs)/max(1, before_counts[own-1])
        # Preserve meaningful positives only; genuinely hidden cards get no ID.
        if len(xs) < 100 or fraction < .25 or xs.max()-xs.min() < 10 or ys.max()-ys.min() < 10:
            output[labels_owner == own] = (114, 114, 114)
            continue
        box = [int(xs.min()), int(ys.min()), int(xs.max())+1, int(ys.max())+1]
        labels.append((IDS.index(cid), box))
        records.append({"cardId": cid, "box": box, "visibleFraction": round(fraction, 4), "coverMode": mode})
    if exact:
        assert len(labels) == 8, "Original/tight clear views must retain all eight cards"
    return output if exact else BASE["photo_effects"](output, rng), labels, records, mode


def add_balanced_validation(out, scene_manifest):
    """Every validation class also occurs in all four controlled cover modes."""
    rng=np.random.default_rng(617031)
    refs=[]
    for cid in IDS:
        suit,rank=cid.split("-")
        refs.append(cv2.imread(str(DATA/"einzelkarten"/suit/rank/"karten1.png")))
    for mode_number,mode in enumerate(GEN["MODES"]):
        for group in range(4):
            image=np.full((640,640,3),114,np.uint8)
            owner=np.zeros((640,640),np.uint8)
            cards=[]
            for number in range(8):
                cls=((group*8+number)*13)%32
                card,mask,_=GEN["covered_card"](refs[cls],rng,mode)
                height,width=card.shape[:2]
                width=round(width*250/height)
                card=cv2.resize(card,(width,250))
                mask=cv2.resize(mask,(width,250),interpolation=cv2.INTER_NEAREST)
                left=(number%4)*160+(160-width)//2
                top=(number//4)*320+35
                image[top:top+250,left:left+width]=card
                region=owner[top:top+250,left:left+width]
                region[mask>0]=number+1
                cards.append({"classId":cls,"projectedArea":250*width,"coverMode":mode})
            labels,records=GEN["visible_labels"](owner,cards)
            assert len(labels)==8
            name=f"balanced-{mode_number}-{group}"
            BASE["save_sample"](out,"val",name,image,labels)
            scene_manifest.append({"split":"val","file":name+".jpg","kind":"balanced-spread","cards":records})


def audit(out):
    provenance = json.loads((out/"provenance.json").read_text(encoding="utf-8"))
    scenes = json.loads((out/"scenes.json").read_text(encoding="utf-8"))
    assert provenance["target"] == "card"
    assert provenance["generatorSha256"] == BASE["digest"](Path(__file__))
    train_hands = set(provenance["generator"]["realTrainingHands"])
    val_hands = set(provenance["generator"]["realValidationHands"])
    assert not train_hands & val_hands and len(train_hands) == 10 and len(val_hands) == 3
    hashes = {"train": set(), "val": set()}
    for source in provenance["sources"]:
        assert source["file"].startswith(("training/", "einzelkarten/"))
        path = (DATA/source["file"]).resolve()
        path.relative_to(DATA.resolve())
        assert BASE["digest"](path) == source["sha256"]
        hashes[source["split"]].add(source["sha256"])
        if source["role"] == "annotated-hand":
            assert BASE["digest"](path.with_suffix(".surfaces.json")) == source["surfaceAnnotationsSha256"]
            assert BASE["digest"](path.with_suffix(".labels.json")) == source["indexAnnotationsSha256"]
            meta = json.loads(path.with_suffix(".surfaces.json").read_text(encoding="utf-8"))
            assert meta["visuallyReviewed"] and len(meta["annotations"]) == 8
            assert set(meta["cardIds"]) == {ann["cardId"] for ann in meta["annotations"]}
            assert path.stem in (train_hands if source["split"] == "train" else val_hands)
    assert not hashes["train"] & hashes["val"]
    statistics = {}
    for split in ["train", "val"]:
        selected = [scene for scene in scenes if scene["split"] == split]
        images = list((out/"images"/split).glob("*.jpg"))
        labels = list((out/"labels"/split).glob("*.txt"))
        assert len(selected) == len(images) == len(labels)
        classes, real, modes = Counter(), Counter(), Counter()
        for scene in selected:
            image = cv2.imread(str(out/"images"/split/scene["file"]))
            assert image is not None and image.shape == (640, 640, 3)
            lines = (out/"labels"/split/Path(scene["file"]).with_suffix(".txt")).read_text().splitlines()
            assert len(lines) == len(scene["cards"])
            if scene["kind"] == "real-hand":
                assert scene["hand"] in (train_hands if split == "train" else val_hands)
                real[scene["hand"]] += 1
            for line, card in zip(lines, scene["cards"]):
                cls, x, y, w, h = map(float, line.split())
                assert cls.is_integer() and 0 <= cls < 32 and w > 0 and h > 0
                assert min(x-w/2, y-h/2) >= -1e-7 and max(x+w/2, y+h/2) <= 1+1e-7
                assert np.allclose(np.array([x-w/2, y-h/2, x+w/2, y+h/2])*640, card["box"], atol=.0001)
                assert IDS[int(cls)] == card["cardId"]
                if scene["kind"] == "real-hand":
                    assert card["cardId"] in json.loads((DATA/"training"/(scene["hand"]+".surfaces.json")).read_text())["cardIds"]
                classes[card["cardId"]] += 1
                modes[card["coverMode"]] += 1
        assert len(classes) == 32 and min(classes.values()) >= 3
        statistics[split] = {"images": len(selected), "objects": sum(classes.values()), "classes": dict(classes),
                             "realVariants": dict(real), "coverModes": dict(modes)}
    assert set(statistics["train"]["realVariants"]) == train_hands and set(statistics["val"]["realVariants"]) == val_hands
    assert set(statistics["train"]["realVariants"].values()) == {48}
    assert set(statistics["val"]["realVariants"].values()) == {12}
    save_json(out/"statistics.json", statistics)
    report = {"status": "PASS", "sourcePhotosSplitBeforeAugmentation": True, "testPhotosRead": 0,
              "annotatedRealPhotos": 13, "reviewedCardSurfaces": 104,
              "realTrainingHands": sorted(train_hands), "realValidationHands": sorted(val_hands),
              "trainImages": statistics["train"]["images"], "validationImages": statistics["val"]["images"],
              "trainObjects": statistics["train"]["objects"], "validationObjects": statistics["val"]["objects"],
              "all32ClassesInBothSplits": True, "sourcesVerified": len(provenance["sources"]),
              "limitation": provenance["limitation"]}
    save_json(out/"audit.json", report)
    print(json.dumps(report, indent=2), flush=True)
    return report


def prepare(out):
    out.relative_to(ROOT/".tools/card-training")
    out.mkdir(parents=True, exist_ok=False)
    for split in ["train", "val"]:
        for kind in ["images", "labels"]:
            (out/kind/split).mkdir(parents=True)
    sources, hands, backgrounds = [], {}, []
    for labels_path in sorted((DATA/"training").glob("*.labels.json")):
        source = labels_path.with_suffix("").with_suffix(".jpg")
        metadata_path = source.with_suffix(".surfaces.json")
        assert metadata_path.exists(), f"Missing reviewed surfaces: {source.name}"
        meta = json.loads(metadata_path.read_text(encoding="utf-8"))
        assert meta["visuallyReviewed"] and meta["sourceSha256"] == BASE["digest"](source)
        assert (DATA/meta["source"]).resolve() == source.resolve()
        split = "val" if source.stem in VALIDATION_HANDS else "train"
        hand = load_hand(source, meta)
        hands[source.stem] = (split, hand)
        sources.append({"file": source.relative_to(DATA).as_posix(), "sha256": BASE["digest"](source),
                        "split": split, "role": "annotated-hand", "surfaceAnnotationsSha256": BASE["digest"](metadata_path),
                        "indexAnnotationsSha256": BASE["digest"](labels_path)})
        if split == "train":
            image, _, polygons, _ = hand
            top = int(min(points[:, 1].min() for _, points in polygons)*.65)
            if top > 30:
                backgrounds.append(cv2.resize(image[:top], (640, 640)))
    assert len(hands) == 13 and set(hands) >= VALIDATION_HANDS
    scene_manifest, previews = [], []
    for split, count, filename, seed in [("train", 384, "karten2.png", 20261026), ("val", 64, "karten1.png", 456371)]:
        refs = []
        for cid in IDS:
            suit, rank = cid.split("-")
            source = DATA/"einzelkarten"/suit/rank/filename
            image = cv2.imread(str(source))
            refs.append(cv2.resize(image, (round(image.shape[1]*500/image.shape[0]), 500)))
            sources.append({"file": source.relative_to(DATA).as_posix(), "sha256": BASE["digest"](source), "split": split, "role": "card-reference"})
        rng = np.random.default_rng(seed)
        for index in range(count):
            image, labels, records, kind = GEN["scene"](refs, rng, index, backgrounds if split == "train" else None)
            name = f"synthetic-{index:04d}"
            BASE["save_sample"](out, split, name, image, labels)
            scene_manifest.append({"split": split, "file": name+".jpg", "kind": kind, "cards": records})
        print(f"Prepared {count} synthetic {split} images", flush=True)
    add_balanced_validation(out,scene_manifest)
    for position, (name, (split, hand)) in enumerate(hands.items()):
        rng = np.random.default_rng(20261026+position*97 if split == "train" else 67319+position*97)
        for number in range(48 if split == "train" else 12):
            image, labels, records, mode = real_sample(hand, rng, number)
            sample_name = f"real-{name}-{number:03d}"
            BASE["save_sample"](out, split, sample_name, image, labels)
            scene_manifest.append({"split": split, "file": sample_name+".jpg", "kind": "real-hand", "hand": name,
                                   "mode": mode, "cards": records})
            if number in [0, 1, 2] and name in ["Handkarten", "IMG_7931", "IMG_7934", "IMG_7940"]:
                for cls, box in labels:
                    cv2.rectangle(image, tuple(box[:2]), tuple(box[2:]), (40, 255, 40), 2)
                thumb = cv2.resize(image, (320, 320))
                cv2.putText(thumb, f"{name}: {mode}", (5, 15), cv2.FONT_HERSHEY_SIMPLEX, .33, (20, 20, 240), 1)
                previews.append(thumb)
        print(f"Prepared real {split} photo: {name}", flush=True)
    provenance = {"version": 2, "target": "card", "seed": 20261026, "sources": sources,
                  "generator": {"script": "scripts/prepare-real-card-surface-training.py", "syntheticTrain": 384,
                                "syntheticValidation": 80, "realVariantsPerTrainingHand": 48, "realVariantsPerValidationHand": 12,
                                "realTrainingHands": sorted(name for name, (split, _) in hands.items() if split == "train"),
                                "realValidationHands": sorted(VALIDATION_HANDS)},
                  "generatorSha256": BASE["digest"](Path(__file__)),
                  "testPolicy": "No test photographs or derivatives are read; all real-photo variants are grouped by source photograph before augmentation.",
                  "limitation": "Internal source-group validation. The inherited corner checkpoint already saw these training photographs, and single-card validation references are also known. Not independent real-photo validation. Real covers hide annotated indices only; synthetic modes cover all four indices."}
    save_json(out/"dataset.yaml", {"path": out.as_posix(), "train": "images/train", "val": "images/val", "names": dict(enumerate(NAMES))})
    save_json(out/"provenance.json", provenance)
    save_json(out/"scenes.json", scene_manifest)
    cv2.imwrite(str(out/"preview.jpg"), np.vstack([np.hstack(previews[i:i+3]) for i in range(0, len(previews), 3)]))
    audit(out)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=".tools/card-training/surfaces-v2")
    parser.add_argument("--audit", action="store_true")
    args = parser.parse_args()
    out = (ROOT/args.output).resolve()
    out.relative_to(ROOT/".tools/card-training")
    if args.audit:
        audit(out)
    else:
        prepare(out)
