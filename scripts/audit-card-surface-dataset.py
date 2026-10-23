"""Verify source separation, occlusion masks, and generated surface labels locally."""
import argparse
from collections import Counter
import json
from pathlib import Path
import runpy

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
GEN = runpy.run_path(str(ROOT/"scripts/prepare-card-surface-training.py"))


def audit(dataset):
    provenance = json.loads((dataset/"provenance.json").read_text(encoding="utf-8"))
    manifest = json.loads((dataset/"scenes.json").read_text(encoding="utf-8"))
    statistics = json.loads((dataset/"statistics.json").read_text(encoding="utf-8"))
    assert provenance["target"] == "card"
    assert GEN["BASE"]["digest"](ROOT/"scripts/prepare-card-surface-training.py") == provenance["generatorSha256"]
    assert GEN["BASE"]["digest"](ROOT/"scripts/prepare-card-training.py") == provenance["helperSha256"]
    source_hashes = {"train": set(), "val": set()}
    for source in provenance["sources"]:
        path = (ROOT/"kartenfotos"/source["file"]).resolve()
        path.relative_to((ROOT/"kartenfotos").resolve())
        assert source["file"].startswith(("training/", "einzelkarten/")), source
        assert GEN["BASE"]["digest"](path) == source["sha256"], source
        if "annotationsSha256" in source:
            assert GEN["BASE"]["digest"](path.with_suffix(".labels.json")) == source["annotationsSha256"]
        source_hashes[source["split"]].add(source["sha256"])
    assert not source_hashes["train"] & source_hashes["val"]
    for mode in ["all-corners-covered", "top-bottom-covered"]:
        original = np.full((500, 285, 3), 255, np.uint8)
        copy = original.copy()
        _, surface, _ = GEN["covered_card"](original, np.random.default_rng(42), mode)
        assert np.array_equal(original, copy), "Original input must not be changed"
        for box in GEN["BASE"]["INDEXES"]:
            x1, y1, x2, y2 = (np.array(box)*[285, 500, 285, 500]).astype(int)
            assert not np.any(surface[y1:y2, x1:x2]), (mode, box)
        assert np.any(surface[150:350, 85:200]), "Card artwork must remain visible"
    for split in ["train", "val"]:
        entries = [item for item in manifest if item["split"] == split]
        assert len(entries) == len(list((dataset/"images"/split).glob("*.jpg"))) == len(list((dataset/"labels"/split).glob("*.txt"))) == statistics[split]["images"]
        classes, modes = Counter(), Counter()
        for item in entries:
            image = cv2.imread(str(dataset/"images"/split/item["file"]))
            assert image is not None and image.shape == (640, 640, 3)
            labels = (dataset/"labels"/split/Path(item["file"]).with_suffix(".txt")).read_text().splitlines()
            assert len(labels) == len(item["cards"])
            for line, card in zip(labels, item["cards"]):
                cls, x, y, w, h = map(float, line.split())
                assert cls.is_integer() and 0 <= cls < 32
                assert w > 0 and h > 0
                assert min(x-w/2, y-h/2) >= -1e-7 and max(x+w/2, y+h/2) <= 1+1e-7
                expected = np.array(card["box"])
                actual = np.array([x-w/2, y-h/2, x+w/2, y+h/2])*640
                assert np.allclose(expected, actual, atol=.0001)
                assert GEN["IDS"][int(cls)] == card["cardId"] and card["visibleFraction"] >= .10
                classes[card["cardId"]] += 1
                modes[card["coverMode"]] += 1
        assert dict(classes) == statistics[split]["classes"]
        assert dict(modes) == statistics[split]["coverModes"]
        assert len(classes) == 32 and min(classes.values()) >= 5
    report = {"status": "PASS", "sourcesVerified": len(provenance["sources"]),
              "trainImages": statistics["train"]["images"], "validationImages": statistics["val"]["images"],
              "trainObjects": statistics["train"]["objects"], "validationObjects": statistics["val"]["objects"],
              "trainCoverModes": statistics["train"]["coverModes"],
              "all32ClassesInBothSplits": True, "testPhotosRead": 0,
              "limitation": provenance["limitation"]}
    (dataset/"audit.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset")
    args = parser.parse_args()
    dataset = (ROOT/args.dataset).resolve()
    dataset.relative_to(ROOT/".tools/card-training")
    audit(dataset)
