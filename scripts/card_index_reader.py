# SPDX-License-Identifier: AGPL-3.0-only
"""Small, independent rank/suit reader for localized card indices, not full hands."""
from pathlib import Path
import hashlib
import json
import cv2
import numpy as np
import torch
from torch import nn

ROOT = Path(__file__).resolve().parents[1]
SIZE = 96
RANKS = ["sieben", "acht", "neun", "zehn", "unter", "ober", "koenig", "ass", "unlesbar"]
SUITS = ["eichel", "gras", "herz", "schellen", "unlesbar"]
GLYPHS = ["7", "8", "9", "10", "U", "O", "K", "A"]
TARGET = "separate-rank-suit-reader"
ARCHITECTURE = "index-reader-v2-detail"


def digest(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def save_json(file, value):
    Path(file).write_text(json.dumps(value, indent=2)+"\n", encoding="utf-8")


def prepare_patch(image):
    """BGR photograph -> white letterbox, uint8 RGB, 96x96. Matches the JS reader."""
    if image is None or image.ndim != 3 or image.shape[2] != 3 or min(image.shape[:2]) < 2:
        raise ValueError("An index crop must contain a non-empty RGB image")
    height, width = image.shape[:2]
    scale = SIZE/max(height, width)
    resized = cv2.resize(image, (max(1, round(width*scale)), max(1, round(height*scale))), interpolation=cv2.INTER_LINEAR)
    canvas = np.full((SIZE, SIZE, 3), 255, np.uint8)
    top, left = (SIZE-resized.shape[0])//2, (SIZE-resized.shape[1])//2
    canvas[top:top+resized.shape[0], left:left+resized.shape[1]] = resized
    return cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB)


def tensor_image(rgb):
    return torch.from_numpy(np.ascontiguousarray(rgb.transpose(2, 0, 1))).float()/255


class IndexEncoder(nn.Module):
    def __init__(self, channels, classes):
        super().__init__()
        layers = []
        for width in [12, 20, 28]:
            layers += [nn.Conv2d(channels, width, 3, stride=2, padding=1, bias=False), nn.BatchNorm2d(width), nn.ReLU()]
            channels = width
        self.features = nn.Sequential(*layers, nn.AdaptiveAvgPool2d((4, 4)))
        self.classifier = nn.Sequential(nn.Flatten(), nn.Linear(28*16, 64), nn.ReLU(), nn.Dropout(.15), nn.Linear(64, classes))

    def forward(self, image):
        return self.classifier(self.features(image))


class CardIndexReader(nn.Module):
    """Rank sees only luminance; suit has its own RGB encoder and separate labels."""
    def __init__(self, architecture=ARCHITECTURE):
        super().__init__()
        if architecture not in (ARCHITECTURE, "index-reader-v1"):
            raise ValueError("Unknown reader architecture")
        self.architecture = architecture
        self.rank = DetailEncoder(1, len(RANKS)) if architecture == ARCHITECTURE else IndexEncoder(1, len(RANKS))
        self.suit = DetailEncoder(3, len(SUITS)) if architecture == ARCHITECTURE else IndexEncoder(3, len(SUITS))
        self.register_buffer("luminance", torch.tensor([.299, .587, .114]).view(1, 3, 1, 1))

    def forward(self, indices):
        gray = (indices*self.luminance).sum(dim=1, keepdim=True)
        if self.architecture == ARCHITECTURE:
            # Normalize paper/lighting without discarding faint character strokes.
            mean = gray.mean(dim=(2, 3), keepdim=True)
            deviation = ((gray-mean).square().mean(dim=(2, 3), keepdim=True)+.01).sqrt()
            gray = (gray-mean)/deviation
        return self.rank(gray), self.suit(indices)


class DetailEncoder(nn.Module):
    """Keep full-resolution strokes before pooling; retain spatial glyph structure."""
    def __init__(self, channels, classes):
        super().__init__()
        layers = []
        for width in [16, 24, 40]:
            layers += [nn.Conv2d(channels, width, 3, padding=1, bias=False), nn.BatchNorm2d(width), nn.ReLU(),
                       nn.Conv2d(width, width, 3, padding=1, bias=False), nn.BatchNorm2d(width), nn.ReLU(), nn.MaxPool2d(2)]
            channels = width
        self.features = nn.Sequential(*layers, nn.AdaptiveAvgPool2d((6, 6)))
        self.classifier = nn.Sequential(nn.Flatten(), nn.Linear(40*36, 96), nn.ReLU(), nn.Dropout(.2), nn.Linear(96, classes))

    def forward(self, image):
        return self.classifier(self.features(image))


def augment(rgb, rng, strength=1.):
    """Rotate complete indices without reflection; preserve the original label."""
    image = np.rot90(rgb, int(rng.integers(4))).copy()
    matrix = cv2.getRotationMatrix2D((SIZE/2, SIZE/2), float(rng.uniform(-15, 15))*strength, float(rng.uniform(1-.2*strength, 1.)))
    matrix[:, 2] += rng.uniform(-3, 3, 2)*strength
    image = cv2.warpAffine(image, matrix, (SIZE, SIZE), borderValue=(255, 255, 255))
    image = np.clip(image.astype(np.float32)*rng.uniform(.65, 1.2)+rng.uniform(-12, 12)+rng.normal(0, rng.uniform(0, 3), image.shape), 0, 255).astype(np.uint8)
    if rng.random() < .15*strength:
        image = cv2.GaussianBlur(image, (3, 3), float(rng.uniform(.2, .65)))
    if rng.random() < .15*strength:
        # Small phone indices may contain only a few dozen useful pixels.
        small = int(rng.integers(32, 72))
        image = cv2.resize(cv2.resize(image, (small, small)), (SIZE, SIZE))
    return image


def audit_dataset(folder):
    folder = Path(folder).resolve()
    manifest = json.loads((folder/"manifest.json").read_text(encoding="utf-8"))
    if manifest.get("target") != TARGET or manifest.get("ranks") != RANKS or manifest.get("suits") != SUITS:
        raise ValueError("Wrong rank/suit dataset contract")
    groups, hashes = {}, {}
    counts = {split: {"samples": 0, "ranks": [0]*len(RANKS), "suits": [0]*len(SUITS)} for split in ["train", "val"]}
    sources = manifest["sources"]
    source_groups = set()
    for source in sources:
        if source["kind"] == "photo":
            path = (ROOT/"kartenfotos"/source["file"]).resolve()
            path.relative_to((ROOT/"kartenfotos").resolve())
            if "test" in path.relative_to(ROOT/"kartenfotos").parts:
                raise ValueError("Test photographs are forbidden in training or validation")
        elif source["kind"] in ("font", "generator"):
            path = Path(source["file"])
        else:
            raise ValueError("Unknown source type")
        if digest(path) != source["sha256"]:
            raise ValueError(f"Source changed: {source['file']}")
        if source.get("annotations"):
            annotations = (ROOT/"kartenfotos"/source["annotations"]).resolve()
            annotations.relative_to((ROOT/"kartenfotos/training").resolve())
            if digest(annotations) != source["annotationsSha256"]:
                raise ValueError("Reviewed annotations changed")
        source_groups.add((source["sha256"], source["group"]))
    for item in manifest["samples"]:
        split = item["split"]
        if split not in counts or not 0 <= item["rank"] < len(RANKS) or not 0 <= item["suit"] < len(SUITS):
            raise ValueError("Invalid sample labels")
        if (item["sourceSha256"], item["group"]) not in source_groups:
            raise ValueError("Sample has no recorded source")
        image_path = (folder/item["file"]).resolve()
        image_path.relative_to(folder)
        image_hash = digest(image_path)
        if image_hash != item["sha256"]:
            raise ValueError("Prepared image changed")
        if groups.setdefault(item["group"], split) != split or hashes.setdefault(image_hash, split) != split:
            raise ValueError("A source group or identical image crosses training and validation")
        image = cv2.imread(str(image_path))
        if image is None or image.shape != (SIZE, SIZE, 3):
            raise ValueError("Wrong reader image size")
        counts[split]["samples"] += 1
        counts[split]["ranks"][item["rank"]] += 1
        if item["suitSupervised"]:
            counts[split]["suits"][item["suit"]] += 1
    for count in counts.values():
        if not all(count["ranks"]) or not all(count["suits"]):
            raise ValueError("Every rank and suit, including abstention, must have supervision")
    report = {"target": TARGET, "counts": counts, "sourceGroups": len(groups), "testImagesUsed": 0, "independentDeckValidation": False}
    save_json(folder/"audit.json", report)
    return manifest, report
