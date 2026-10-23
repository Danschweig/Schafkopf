"""Unattended local training and ONNX export; never replaces the app model."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import traceback

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="surfaces-v1")
    parser.add_argument("--epochs", type=int, default=24)
    parser.add_argument("--data", default=".tools/card-training/surfaces-v1/dataset.yaml")
    parser.add_argument("--weights", default=".tools/card-training/runs/pilot-v3/weights/best.pt")
    parser.add_argument("--lr", type=float, default=.0007)
    parser.add_argument("--warmup", type=float, default=2)
    parser.add_argument("--compare", action="store_true", help="Compare the exported candidate with the current model after training")
    args = parser.parse_args()
    if not args.name.replace("-", "").replace("_", "").isalnum():
        raise ValueError("Invalid run name")
    if args.epochs < 1:
        raise ValueError("At least one epoch is required")
    if not 0 < args.lr < .1 or args.warmup < 0:
        raise ValueError("Invalid learning rate or warmup")
    dataset_path=(ROOT/args.data).resolve()
    dataset_path.relative_to(ROOT/".tools/card-training")
    provenance=json.loads((dataset_path.parent/"provenance.json").read_text(encoding="utf-8"))
    weights_path=(ROOT/args.weights).resolve()
    if not weights_path.is_file():
        raise FileNotFoundError(weights_path)
    job = ROOT/".tools/card-training/jobs"/args.name
    job.mkdir(parents=True, exist_ok=True)
    status_path = job/"status.json"
    started = time.monotonic()
    status = {"status": "running", "phase": "starting", "epoch": 0, "epochs": args.epochs, "percent": 0}

    def save(phase, state="running", **extra):
        if status_path.exists():
            try:
                status.update(json.loads(status_path.read_text(encoding="utf-8")))
            except (json.JSONDecodeError, OSError):
                pass
        status.update(status=state, phase=phase, elapsedSeconds=round(time.monotonic()-started),
                      updatedUtc=datetime.now(timezone.utc).isoformat(), **extra)
        status_path.write_text(json.dumps(status, indent=2)+"\n", encoding="utf-8")
        print(f"{status['updatedUtc']} {phase.upper()}", flush=True)

    # Every dependency inherits local/offline configuration before importing ML code.
    os.environ["YOLO_CONFIG_DIR"] = str(ROOT/".tools/ultralytics-settings")
    os.environ["YOLO_OFFLINE"] = "true"
    os.environ["PYTHONUNBUFFERED"] = "1"
    (job/"process.json").write_text(json.dumps({"processId": os.getpid(), "name": args.name,
                                               "startedUtc": datetime.now(timezone.utc).isoformat()})+"\n", encoding="utf-8")

    def run(script, *arguments):
        subprocess.run([sys.executable, "-u", str(ROOT/"scripts"/script), *map(str, arguments)], cwd=ROOT, check=True)

    try:
        if (ROOT/".tools/card-training/runs"/args.name).exists():
            raise FileExistsError("Training output already exists; use a new --name instead of overwriting a previous run")
        save("dataset-audit")
        if provenance.get("generator",{}).get("script")=="scripts/prepare-real-card-surface-training.py":
            run("prepare-real-card-surface-training.py", "--output", dataset_path.parent, "--audit")
        else:
            run("audit-card-surface-dataset.py", dataset_path.parent)
        save("model-loading")
        run("train-card-model.py", "--data", dataset_path,
            "--weights", weights_path,
            "--name", args.name, "--epochs", args.epochs, "--freeze", 0,
            "--lr", args.lr, "--nbs", 32, "--warmup", args.warmup, "--warmup-bias-lr", .001,
            "--progress", status_path)
        save("onnx-export", percent=100, etaSeconds=None)
        output = f".tools/card-training/candidate-{args.name}/bavarian-surfaces.onnx"
        run("export-trained-card-model.py", f".tools/card-training/runs/{args.name}/weights/best.pt",
            "--output", output, "--version", f"bavarian-{args.name}")
        comparison=None
        if args.compare:
            save("comparison", percent=100, etaSeconds=None)
            comparison=f".tools/card-training/candidate-{args.name}/comparison.json"
            subprocess.run(["node",str(ROOT/"scripts/compare-card-surface-model.cjs"),output,comparison],cwd=ROOT,check=True)
        save("complete", "complete", percent=100, etaSeconds=0,
             artifact=output, checkpoint=f".tools/card-training/runs/{args.name}/weights/best.pt",comparison=comparison)
        print("Training and ONNX export finished. Candidate is local; app model unchanged.", flush=True)
    except Exception as error:
        save("failed", "failed", error=str(error), etaSeconds=None)
        traceback.print_exc()
        raise SystemExit(1)


if __name__ == "__main__":
    main()
