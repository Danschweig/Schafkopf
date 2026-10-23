"""Prepare training-only photo views and import explicitly drawn surface polygons.

View coordinates map back to original pixels. Existing rank/suit labels supply
identities only. No detector predictions and no test photos are used.
"""
import argparse
import hashlib
import json
from pathlib import Path
import runpy

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT/"kartenfotos"
BASE = runpy.run_path(str(ROOT/"scripts/prepare-card-training.py"))
REVIEW = ROOT/".tools/card-training/surface-review-v2"


def save_json(path, value):
    path.write_text(json.dumps(value, indent=2)+"\n", encoding="utf-8")


def prepare():
    REVIEW.mkdir(parents=True, exist_ok=True)
    records = {}
    for labels_path in sorted((DATA/"training").glob("*.labels.json")):
        meta = json.loads(labels_path.read_text(encoding="utf-8"))
        source = (DATA/meta["source"]).resolve()
        source.relative_to((DATA/"training").resolve())
        assert BASE["digest"](source) == meta["sourceSha256"]
        image = cv2.imread(str(source))
        assert image is not None and image.shape[:2] == (meta["height"], meta["width"])
        transform = np.eye(3)
        degrees=meta.get("trainingRotationDegreesCCW", 0)
        index_centers=np.array([[(ann["indexBox"][0]+ann["indexBox"][2])/2,
                                 (ann["indexBox"][1]+ann["indexBox"][3])/2] for ann in meta["annotations"]])
        if degrees==0 and np.ptp(index_centers[:,1])>np.ptp(index_centers[:,0])*1.5:
            degrees=90
        for _ in range(degrees//90):
            height, width = image.shape[:2]
            image = cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)
            transform = np.array([[0, 1, 0], [-1, 0, width], [0, 0, 1]]) @ transform
        points = []
        for ann in meta["annotations"]:
            x1, y1, x2, y2 = ann["indexBox"]
            points.append(cv2.perspectiveTransform(np.float32([[[x1, y1], [x2, y2]]]), transform)[0])
        points = np.array(points)
        lo, hi = points.reshape(-1, 2).min(0), points.reshape(-1, 2).max(0)
        typical = float(np.median(np.abs(points[:, 1, 1]-points[:, 0, 1])))
        height, width = image.shape[:2]
        # Show all the way to the source boundaries: the lower card surfaces
        # must not be truncated merely because the index annotations end above.
        x1, y1 = 0, max(0, int(lo[1]-typical*.8))
        x2, y2 = width, height
        cropped = image[y1:y2, x1:x2]
        scale = 1400/cropped.shape[1]
        view = cv2.resize(cropped, (1400, round(cropped.shape[0]*scale)))
        mapping = np.array([[scale, 0, -x1*scale], [0, scale, -y1*scale], [0, 0, 1]]) @ transform
        cv2.imwrite(str(REVIEW/(source.stem+".jpg")), view)
        indices = []
        annotated = view.copy()
        for ann in meta["annotations"]:
            bx1, by1, bx2, by2 = ann["indexBox"]
            mapped = cv2.perspectiveTransform(np.float32([[[bx1, by1], [bx2, by2]]]), mapping)[0]
            center = mapped.mean(0)
            indices.append({"cardId": ann["cardId"], "center": center.round().astype(int).tolist()})
            cv2.putText(annotated, ann["cardId"], tuple(center.round().astype(int)), cv2.FONT_HERSHEY_SIMPLEX, .45, (0, 0, 255), 1)
        cv2.imwrite(str(REVIEW/(source.stem+"-indices.jpg")), annotated)
        records[source.stem] = {"source": meta["source"], "sourceSha256": meta["sourceSha256"],
                                "annotationsSha256": BASE["digest"](labels_path), "width": meta["width"], "height": meta["height"],
                                "viewSize": [view.shape[1], view.shape[0]], "originalToView": mapping.tolist(),
                                "trainingRotationDegreesCCW":degrees,
                                "cardIds": meta["cardIds"], "indices": indices}
    save_json(REVIEW/"views.json", records)
    print(json.dumps({"trainingPhotos": len(records), "views": str(REVIEW), "testPhotosRead": 0}))


def apply(annotations_path, reviewed):
    views = json.loads((REVIEW/"views.json").read_text(encoding="utf-8"))
    drawn = json.loads(annotations_path.read_text(encoding="utf-8"))
    assert set(drawn) == set(views), "All training photos need explicit surface polygons"
    for name, polygons in drawn.items():
        record = views[name]
        assert set(polygons) == set(record["cardIds"]) and len(polygons) == 8
        inverse = np.linalg.inv(np.array(record["originalToView"]))
        image = cv2.imread(str(REVIEW/(name+".jpg")))
        overlay = image.copy()
        annotations = []
        owner = np.zeros(image.shape[:2], np.uint8)
        for number, (cid, polygon) in enumerate(polygons.items(), 1):
            points = np.float32(polygon)
            assert len(points) >= 3 and np.isfinite(points).all()
            assert points.min() >= 0 and (points <= [image.shape[1], image.shape[0]]).all()
            assert cv2.contourArea(points) > 200, (name, cid)
            assert any(cv2.pointPolygonTest(points,tuple(index["center"]),False)>=-3
                       for index in record["indices"] if index["cardId"]==cid), (name,cid,"Index anchor outside surface")
            pixels = cv2.perspectiveTransform(points[None], inverse)[0]
            assert pixels.min() >= -1 and (pixels <= [record["width"]+1, record["height"]+1]).all()
            mask = np.zeros_like(owner)
            cv2.fillPoly(mask, [np.int32(points)], 1)
            overlap = np.count_nonzero((mask > 0) & (owner > 0))/max(1, np.count_nonzero(mask))
            assert overlap < .08, (name, cid, "Surface polygons overlap", overlap)
            owner[mask > 0] = number
            colour = ((number*83)%190+50, (number*137)%190+50, (number*53)%190+50)
            cv2.fillPoly(overlay, [np.int32(points)], colour)
            cv2.polylines(image, [np.int32(points)], True, colour, 3)
            box = cv2.boundingRect(points)
            cv2.putText(image, cid, (box[0], max(14, box[1]-4)), cv2.FONT_HERSHEY_SIMPLEX, .42, colour, 2)
            annotations.append({"cardId": cid, "visiblePolygon": pixels.round(2).tolist()})
        image = cv2.addWeighted(image, .78, overlay, .22, 0)
        cv2.imwrite(str(REVIEW/(name+"-surfaces.jpg")), image)
        source = DATA/record["source"]
        assert BASE["digest"](source) == record["sourceSha256"]
        output = {"version": 1, "source": record["source"], "sourceSha256": record["sourceSha256"],
                  "width": record["width"], "height": record["height"], "split": "training",
                  "target": "card", "coordinates": "original-oriented-image-pixels",
                  "trainingRotationDegreesCCW":record["trainingRotationDegreesCCW"],
                  "annotationMethod": "explicit visual polygon annotation; identities from existing reviewed index labels",
                  "reviewer": "Codex visual review", "visuallyReviewed": reviewed,
                  "viewAnnotationsSha256": hashlib.sha256(annotations_path.read_bytes()).hexdigest(),
                  "cardIds": record["cardIds"], "annotations": annotations}
        save_json(source.with_suffix(".surfaces.json"), output)
    print(json.dumps({"annotatedPhotos": len(drawn), "surfaces": len(drawn)*8, "reviewed": reviewed}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--annotations")
    parser.add_argument("--reviewed", action="store_true")
    args = parser.parse_args()
    if args.prepare:
        prepare()
    elif args.annotations:
        apply(Path(args.annotations), args.reviewed)
    else:
        parser.error("Use --prepare or --annotations <JSON>")
