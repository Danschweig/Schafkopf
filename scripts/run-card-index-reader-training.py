# SPDX-License-Identifier: AGPL-3.0-only
"""Unattended CPU training, rank-first selection and verified ONNX export."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import traceback

os.environ.setdefault("OMP_NUM_THREADS", "6")
os.environ.setdefault("MKL_NUM_THREADS", "6")
import cv2
import numpy as np
import torch
from torch import nn
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
import onnx
from card_index_reader import ROOT, SIZE, RANKS, SUITS, TARGET, ARCHITECTURE, CardIndexReader, augment, tensor_image, audit_dataset, digest, save_json


def write_progress(path, state, attempts=6):
    """Atomic telemetry with bounded retries for Windows sharing violations.

    Monitoring is best-effort: a locked status file must not kill model training.
    Checkpoint/data write failures remain fatal and are not hidden by this helper.
    """
    temporary = path.with_suffix(".tmp")
    for attempt in range(attempts):
        try:
            save_json(temporary, state)
            os.replace(temporary, path)
            return True
        except PermissionError:
            if attempt+1 < attempts:
                time.sleep(min(.025*2**attempt, .4))
    return False


def load_warm_start(model, path, manifest_sha):
    """Older best.pt files have weights but no optimizer state: warm start only."""
    checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    config = json.loads((path.parent/"config.json").read_text(encoding="utf-8"))
    if (checkpoint.get("target") != TARGET or checkpoint.get("architecture") != ARCHITECTURE
            or checkpoint.get("ranks") != RANKS or checkpoint.get("suits") != SUITS
            or config.get("manifestSha256") != manifest_sha):
        raise ValueError("Warm-start checkpoint architecture, classes or dataset do not match")
    model.load_state_dict(checkpoint["state_dict"])
    return checkpoint


class IndexDataset(Dataset):
    def __init__(self, folder, samples, training, seed):
        self.samples = samples
        self.images = [cv2.cvtColor(cv2.imread(str(folder/item["file"])), cv2.COLOR_BGR2RGB) for item in samples]
        self.training = training
        self.rng = np.random.default_rng(seed)
        self.strength = .25

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, index):
        item = self.samples[index]
        image = augment(self.images[index], self.rng, self.strength) if self.training and self.rng.random() > .2 else self.images[index]
        # -100 means generated layout distractors are not labelled as real suits.
        return tensor_image(image), item["rank"], item["suit"] if item["suitSupervised"] else -100, item["kind"]


def validate(model, loader):
    model.eval()
    rank_ok = suit_ok = joint_ok = photo_total = rank_total = suit_total = glyph_ok = glyph_total = 0
    suit_class_ok = [0]*len(SUITS)
    suit_class_total = [0]*len(SUITS)
    rank_confusion = torch.zeros(len(RANKS), len(RANKS), dtype=torch.int64)
    by_kind = {}
    with torch.inference_mode():
        for images, ranks, suits, kinds in loader:
            rank_output, suit_output = model(images)
            right_rank = rank_output.argmax(1).eq(ranks)
            right_suit = suit_output.argmax(1).eq(suits)
            known_suit = suits.ne(-100)
            photo = torch.tensor([kind == "photographed-index" for kind in kinds])
            glyph = torch.tensor([kind in ("rendered-glyph", "rendered-index") for kind in kinds])
            prediction = rank_output.argmax(1)
            rank_confusion += torch.bincount(ranks*len(RANKS)+prediction, minlength=len(RANKS)**2).reshape(len(RANKS), len(RANKS))
            for index, kind in enumerate(kinds):
                totals = by_kind.setdefault(kind, {"examples": 0, "rankCorrect": 0, "suitExamples": 0, "suitCorrect": 0})
                totals["examples"] += 1
                totals["rankCorrect"] += int(right_rank[index])
                totals["suitExamples"] += int(known_suit[index])
                totals["suitCorrect"] += int(right_suit[index] & known_suit[index])
            rank_ok += right_rank.sum().item(); rank_total += len(ranks)
            suit_ok += (right_suit & known_suit).sum().item(); suit_total += known_suit.sum().item()
            for cls in range(len(SUITS)):
                selected = suits.eq(cls)
                suit_class_ok[cls] += (right_suit & selected).sum().item()
                suit_class_total[cls] += selected.sum().item()
            joint_ok += (right_rank & right_suit & photo).sum().item(); photo_total += photo.sum().item()
            glyph_ok += (right_rank & glyph).sum().item(); glyph_total += glyph.sum().item()
    result = {"rankAccuracy": rank_ok/max(1, rank_total), "suitAccuracy": suit_ok/max(1, suit_total),
              "referenceJointAccuracy": joint_ok/max(1, photo_total), "heldFontRankAccuracy": glyph_ok/max(1, glyph_total),
              "rankExamples": rank_total, "suitExamples": suit_total, "referenceExamples": photo_total, "heldFontExamples": glyph_total}
    result["suitBalancedAccuracy"] = sum(correct/max(1, count) for correct, count in zip(suit_class_ok, suit_class_total))/len(SUITS)
    result["rankConfusion"] = rank_confusion.tolist()
    result["byKind"] = by_kind
    reference = by_kind.get("photographed-index", {})
    result["referenceRankAccuracy"] = reference.get("rankCorrect", 0)/max(1, reference.get("examples", 0))
    result["referenceSuitAccuracy"] = reference.get("suitCorrect", 0)/max(1, reference.get("suitExamples", 0))
    result["knownSuitAccuracy"] = sum(suit_class_ok[:4])/max(1, sum(suit_class_total[:4]))
    result["selectionScore"] = .5*result["heldFontRankAccuracy"]+.3*result["referenceJointAccuracy"]+.2*result["suitBalancedAccuracy"]
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="index-reader-v2")
    parser.add_argument("--data", default=".tools/card-training/index-reader-v2")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--samples-per-epoch", type=int, default=1536)
    parser.add_argument("--batch", type=int, default=64)
    parser.add_argument("--patience", type=int, default=20)
    parser.add_argument("--min-epochs", type=int, default=40)
    parser.add_argument("--lr", type=float, default=.001)
    parser.add_argument("--warm-start", help="Reuse compatible best.pt weights; starts a new optimizer, not exact resumption")
    args = parser.parse_args()
    if not args.name.replace("-", "").replace("_", "").isalnum() or min(args.epochs, args.samples_per_epoch, args.batch, args.patience, args.min_epochs) < 1 or not 0 < args.lr < .1:
        raise ValueError("Invalid training parameters")
    folder = (ROOT/args.data).resolve(); folder.relative_to(ROOT/".tools/card-training")
    warm_start = (ROOT/args.warm_start).resolve() if args.warm_start else None
    if warm_start:
        warm_start.relative_to(ROOT/".tools/card-training/runs")
    job = ROOT/".tools/card-training/jobs"/args.name
    job.mkdir(parents=True, exist_ok=True)
    status_file = job/"status.json"
    out = ROOT/".tools/card-training/runs"/args.name
    # Reserve the run before touching status/process files. A duplicate launch
    # must never overwrite the status of the original running/completed job.
    if (ROOT/".tools/card-training"/("candidate-"+args.name)).exists():
        raise ValueError("Candidate already exists; use a new run name")
    out.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    state = {"status": "running", "phase": "starting", "epoch": 0, "epochs": args.epochs, "percent": 0, "etaSeconds": None}
    last_status_warning = float("-inf")

    def progress(**values):
        nonlocal last_status_warning
        state.update(values, elapsedSeconds=round(time.monotonic()-started), updatedUtc=datetime.now(timezone.utc).isoformat())
        if not write_progress(status_file, state) and time.monotonic()-last_status_warning >= 60:
            print("STATUS_WARNING: Windows locked the progress file; training continues and retries the next update.", file=sys.stderr, flush=True)
            last_status_warning = time.monotonic()

    try:
        save_json(job/"process.json", {"processId": os.getpid(), "name": args.name, "startedUtc": datetime.now(timezone.utc).isoformat()})
        progress(phase="dataset-audit")
        manifest, audit = audit_dataset(folder)
        torch.set_num_threads(6); cv2.setNumThreads(1)
        torch.manual_seed(manifest["seed"]); np.random.seed(manifest["seed"])
        torch.use_deterministic_algorithms(True)
        groups = {split: [item for item in manifest["samples"] if item["split"] == split] for split in ["train", "val"]}
        train_data = IndexDataset(folder, groups["train"], True, manifest["seed"])
        val_data = IndexDataset(folder, groups["val"], False, manifest["seed"]+1)
        # Sampling prevents font-only examples from crowding out real suits.
        probabilities = {"real-hand-index": .30, "photographed-index": .25, "rendered-glyph": .20, "rendered-index": .20, "blank": .05}
        frequencies = {kind: sum(item["kind"] == kind for item in groups["train"]) for kind in probabilities}
        if not all(frequencies.values()):
            raise ValueError("Prepare a v2 dataset including rendered-index examples first")
        sample_weights = [probabilities[item["kind"]]/frequencies[item["kind"]] for item in groups["train"]]
        generator = torch.Generator().manual_seed(manifest["seed"])
        sampler = WeightedRandomSampler(sample_weights, args.samples_per_epoch, replacement=True, generator=generator)
        train_loader = DataLoader(train_data, batch_size=args.batch, sampler=sampler, num_workers=0)
        val_loader = DataLoader(val_data, batch_size=args.batch, shuffle=False, num_workers=0)
        model = CardIndexReader()
        inherited = load_warm_start(model, warm_start, digest(folder/"manifest.json")) if warm_start else None
        start_epoch = inherited["epoch"] if inherited else 0
        if start_epoch >= args.epochs:
            raise ValueError("Target epoch must exceed the warm-start epoch")
        optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=.0005)
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, args.epochs-start_epoch, eta_min=args.lr*.1)
        rank_loss = nn.CrossEntropyLoss(label_smoothing=.03)
        suit_loss = nn.CrossEntropyLoss(weight=torch.tensor([1., 1., 1., 1., .4]), ignore_index=-100, label_smoothing=.03)
        history, best, stale = [], -1, 0
        best_path = out/"best.pt"
        save_json(out/"config.json", {**vars(args), "target": TARGET, "architecture": ARCHITECTURE, "augmentation": "20% clean; mild-to-full over first 12 epochs", "rankLossWeight": 2.5, "samplingProbabilities": probabilities, "sourceCounts": frequencies,
                                    "suitClassWeights": [1., 1., 1., 1., .4], "initialization": "warm-start weights; new optimizer and schedule" if inherited else "from scratch; no checkpoint or network download", "warmStartSha256": digest(warm_start) if warm_start else None, "startEpoch": start_epoch, "manifestSha256": digest(folder/"manifest.json"),
                                    "architectureSha256": digest(ROOT/"scripts/card_index_reader.py"), "trainerSha256": digest(__file__), "torchVersion": torch.__version__,
                                    "parameters": sum(parameter.numel() for parameter in model.parameters()), "testImagesUsed": 0})
        if inherited:
            # Keep the inherited model as a candidate, so later epochs cannot
            # discard a better known checkpoint when training restarts.
            initial_metrics = validate(model, val_loader)
            best = initial_metrics["selectionScore"]
            torch.save({**inherited, "metrics": initial_metrics}, best_path)
        print(f"TRAINING_START {args.name}: {len(train_data)} source examples, {args.samples_per_epoch} draws/epoch, epochs {start_epoch+1} to {args.epochs}", flush=True)
        for epoch in range(start_epoch, args.epochs):
            train_data.strength = min(1., .25+.75*epoch/12)
            model.train(); losses = []; epoch_started = time.monotonic()
            for batch, (images, ranks, suits, _) in enumerate(train_loader, 1):
                optimizer.zero_grad(set_to_none=True)
                rank_output, suit_output = model(images)
                colour_loss = suit_loss(suit_output, suits) if suits.ne(-100).any() else suit_output.sum()*0
                loss = 2.5*rank_loss(rank_output, ranks)+colour_loss
                if not torch.isfinite(loss):
                    raise ValueError("Non-finite training loss")
                loss.backward(); nn.utils.clip_grad_norm_(model.parameters(), 5); optimizer.step()
                losses.append(float(loss.detach()))
                fraction = (epoch+batch/len(train_loader))/args.epochs
                run_fraction = (epoch-start_epoch+batch/len(train_loader))/(args.epochs-start_epoch)
                elapsed = time.monotonic()-started
                if batch == 1 or batch%8 == 0 or batch == len(train_loader):
                    progress(phase="training", epoch=epoch+1, batch=batch, batches=len(train_loader), percent=round(fraction*100, 1), etaSeconds=round(elapsed*(1/run_fraction-1)))
            progress(phase="validation")
            metrics = validate(model, val_loader)
            row = {"epoch": epoch+1, "trainingLoss": sum(losses)/len(losses), "seconds": round(time.monotonic()-epoch_started, 2), **metrics}
            history.append(row); save_json(out/"history.json", history)
            if metrics["selectionScore"] > best:
                best = metrics["selectionScore"]; stale = 0
                torch.save({"state_dict": model.state_dict(), "architecture": ARCHITECTURE, "epoch": epoch+1, "metrics": metrics, "target": TARGET, "ranks": RANKS, "suits": SUITS}, best_path)
            else:
                stale += 1
            scheduler.step()
            # Recovery snapshot after every completed epoch, not only on a new
            # validation best. Optimizer/scheduler states are retained for repair.
            recovery_path = out/"last.pt"
            recovery_temp = out/"last.tmp.pt"
            torch.save({"state_dict": model.state_dict(), "optimizer": optimizer.state_dict(), "scheduler": scheduler.state_dict(),
                        "epoch": epoch+1, "architecture": ARCHITECTURE, "metrics": metrics, "target": TARGET,
                        "ranks": RANKS, "suits": SUITS, "manifestSha256": digest(folder/"manifest.json")}, recovery_temp)
            os.replace(recovery_temp, recovery_path)
            print(json.dumps({key: value for key, value in row.items() if key not in ("rankConfusion", "byKind")}), flush=True)
            if stale >= args.patience and epoch+1 >= args.min_epochs:
                print("EARLY_STOP: internal validation stopped improving", flush=True); break

        progress(phase="onnx-export", percent=100, etaSeconds=None)
        checkpoint = torch.load(best_path, map_location="cpu", weights_only=True)
        model.load_state_dict(checkpoint["state_dict"]); model.eval()
        candidate = ROOT/".tools/card-training"/("candidate-"+args.name)
        candidate.mkdir(parents=True, exist_ok=False)
        artifact = candidate/"card-index-reader.onnx"
        example = tensor_image(val_data.images[0]).unsqueeze(0)
        torch.onnx.export(model, example, str(artifact), opset_version=17, input_names=["indices"], output_names=["rank_logits", "suit_logits"],
                          dynamic_axes={"indices": {0: "batch"}, "rank_logits": {0: "batch"}, "suit_logits": {0: "batch"}}, dynamo=False)
        graph = onnx.load(str(artifact)); onnx.checker.check_model(graph)
        # Export only the reader contract, never private file paths or photographs.
        onnx.helper.set_model_props(graph, {"description": "Separate Bavarian card rank and suit reader; grayscale rank branch, 2.5x rank loss", "target": TARGET, "license": "AGPL-3.0", "ranks": json.dumps(RANKS), "suits": json.dumps(SUITS)})
        onnx.save(graph, str(artifact))
        with torch.inference_mode():
            rank_output, suit_output = model(example)
        # Private verification fixture stays beside the local, unpublished candidate.
        fixture = {"pixels": example.flatten().tolist(), "rank_logits": rank_output.flatten().tolist(), "suit_logits": suit_output.flatten().tolist()}
        save_json(candidate/"export-check.json", fixture)
        metadata = {"version": "bavarian-"+args.name, "target": TARGET, "ranks": RANKS, "suits": SUITS, "inputShape": ["batch", 3, SIZE, SIZE], "outputShapes": [["batch", len(RANKS)], ["batch", len(SUITS)]],
                    "onnxSha256": digest(artifact), "checkpointSha256": digest(best_path), "manifestSha256": digest(folder/"manifest.json"), "architecture": ARCHITECTURE, "rankLossWeight": 2.5, "rankInput": "luminance only, contrast normalized inside model", "localizer": "existing index detector is still required; reader is not a full-hand detector", "chosenEpoch": checkpoint["epoch"], "internalValidation": checkpoint["metrics"], "testImagesUsed": 0, "independentDeckValidation": False, "appModelReplaced": False}
        save_json(artifact.with_suffix(".metadata.json"), metadata)
        progress(phase="onnx-verification")
        subprocess.run(["node", str(ROOT/"scripts/check-card-index-reader.cjs"), "--verify-export", str(artifact)], cwd=ROOT, check=True)
        progress(status="complete", phase="complete", percent=100, etaSeconds=0, artifact=artifact.relative_to(ROOT).as_posix(), checkpoint=best_path.relative_to(ROOT).as_posix(), metrics=checkpoint["metrics"])
        print("TRAINING_COMPLETE: reader exported and checked with actual ONNX-WASM; app model unchanged.", flush=True)
    except Exception as error:
        progress(status="failed", phase="failed", error=str(error), etaSeconds=None)
        traceback.print_exc(); raise SystemExit(1)


if __name__ == "__main__":
    main()
