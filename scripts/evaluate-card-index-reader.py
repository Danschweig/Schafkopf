# SPDX-License-Identifier: AGPL-3.0-only
"""Compare frozen reader checkpoints on internal validation, never test/ photos."""
import argparse
from importlib.util import module_from_spec, spec_from_file_location
import json
import cv2
import torch
from torch.utils.data import DataLoader
from card_index_reader import ROOT, TARGET, RANKS, SUITS, CardIndexReader, audit_dataset, digest, save_json

spec = spec_from_file_location("reader_training", ROOT/"scripts/run-card-index-reader-training.py")
training = module_from_spec(spec)
spec.loader.exec_module(training)


def evaluate(data, checkpoints):
    manifest, audit = audit_dataset(data)
    samples = [item for item in manifest["samples"] if item["split"] == "val"]
    dataset = training.IndexDataset(data, samples, False, manifest["seed"])
    loader = DataLoader(dataset, batch_size=64, shuffle=False)
    result = {"manifestSha256": digest(data/"manifest.json"), "audit": audit, "checkpoints": [],
              "limitation": "Internal diagnostics on reused fonts/reference deck; not an independent test or evidence of cross-deck performance."}
    for path in checkpoints:
        checkpoint = torch.load(path, map_location="cpu", weights_only=True)
        if checkpoint["target"] != TARGET or checkpoint["ranks"] != RANKS or checkpoint["suits"] != SUITS:
            raise ValueError("Checkpoint does not match the reader contract")
        architecture = checkpoint.get("architecture", "index-reader-v1")
        model = CardIndexReader(architecture).eval()
        model.load_state_dict(checkpoint["state_dict"])
        result["checkpoints"].append({"run": path.parent.name, "sha256": digest(path), "architecture": architecture,
                                      "chosenEpoch": checkpoint["epoch"], "metrics": training.validate(model, loader)})
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("checkpoints", nargs="+")
    parser.add_argument("--data", default=".tools/card-training/index-reader-v2")
    parser.add_argument("--report")
    args = parser.parse_args()
    data = (ROOT/args.data).resolve()
    data.relative_to(ROOT/".tools/card-training")
    checkpoints = [(ROOT/value).resolve() for value in args.checkpoints]
    for checkpoint in checkpoints:
        checkpoint.relative_to(ROOT/".tools/card-training/runs")
    torch.set_num_threads(4)
    cv2.setNumThreads(1)
    result = evaluate(data, checkpoints)
    if args.report:
        report = (ROOT/args.report).resolve()
        report.relative_to(ROOT/".tools/card-training")
        save_json(report, result)
    for row in result["checkpoints"]:
        print(json.dumps({**row, "metrics": {key: value for key, value in row["metrics"].items() if key != "rankConfusion"}}, indent=2))
