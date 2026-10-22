# SPDX-License-Identifier: AGPL-3.0-only
"""Export a locally trained candidate without replacing the deployed model."""
import argparse
import hashlib
import json
import os
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
os.environ.setdefault("YOLO_CONFIG_DIR",str(ROOT/".tools/ultralytics-settings"))
os.environ["YOLO_OFFLINE"]="true"
import torch
import onnx
from ultralytics import YOLO
from card_model_checkpoint import load_checkpoint

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("checkpoint")
    parser.add_argument("--output",default=".tools/card-training/candidate-v1/bavarian-cards.onnx")
    parser.add_argument("--version",default="bavarian-corners-pilot-2026-10-22-v1")
    args=parser.parse_args()
    source=(ROOT/args.checkpoint).resolve()
    destination=(ROOT/args.output).resolve()
    destination.relative_to(ROOT/".tools")
    destination.parent.mkdir(parents=True,exist_ok=True)
    checkpoint=load_checkpoint(source)
    model=(checkpoint.get("ema") or checkpoint["model"]).float().eval()
    model.task="detect"
    if not isinstance(model.args,dict):
        model.args=vars(model.args)
    dataset_path=Path(model.args["data"]).resolve()
    dataset_path.relative_to(ROOT/".tools/card-training")
    provenance_path=dataset_path.parent/"provenance.json"
    provenance=json.loads(provenance_path.read_text(encoding="utf-8"))
    assert not any(item["file"].startswith("test/") for item in provenance["sources"])
    image_counts={split:len(list((dataset_path.parent/"images"/split).glob("*.jpg"))) for split in ["train","val"]}
    real_hands=sum(item["file"].startswith("training/") for item in provenance["sources"])
    parent_checkpoint=Path(model.args.get("model",""))
    parent_hash=hashlib.sha256(parent_checkpoint.read_bytes()).hexdigest() if parent_checkpoint.is_file() else None
    expected=[f"{s}_{r}" for s in ["Eichel","Gras","Herz","Schellen"]
              for r in ["7","8","9","10","Unter","Ober","Koenig","Ass"]]
    assert [model.names[i] for i in range(32)]==expected
    wrapper=YOLO("yolov8n.yaml")
    wrapper.model=model
    wrapper.task="detect"
    wrapper.model.pt_path=str(destination.with_suffix(".pt"))
    wrapper.overrides={"task":"detect","model":wrapper.model.pt_path}
    exported=Path(wrapper.export(format="onnx",imgsz=640,batch=1,dynamic=False,
                  simplify=False,opset=17,nms=False,half=False,device="cpu"))
    artifact=onnx.load(str(exported))
    onnx.checker.check_model(artifact)
    assert [dim.dim_value for dim in artifact.graph.input[0].type.tensor_type.shape.dim]==[1,3,640,640]
    assert [dim.dim_value for dim in artifact.graph.output[0].type.tensor_type.shape.dim]==[1,36,8400]
    # Do not embed local paths or training args in an artifact that may be published.
    props={item.key:item.value for item in artifact.metadata_props
           if item.key in {"description","author","date","version","license","task","stride","batch","imgsz","names"}}
    props["description"]="Schafkopf: rank and suit indices of 32 Bavarian playing cards"
    onnx.helper.set_model_props(artifact,props)
    onnx.save(artifact,str(destination))
    metadata={"version":args.version,"target":"rank-and-suit-index",
        "license":"AGPL-3.0", "classNames":expected,
        "inputShape":[1,3,640,640],"outputShape":[1,36,8400],
        "source":"https://github.com/Nikiki95/schafkopf-engine/blob/d4e4efc04973416b1aa98e2d13cd268c8fcf0f6d/schafkopf_yolo.pt",
        "sourceSha256":"2c96ad125f098e5dc6d7ce0c363ee704f212f337633395b023a8e0d512203802",
        "checkpointSha256":hashlib.sha256(source.read_bytes()).hexdigest(),
        "onnxSha256":hashlib.sha256(destination.read_bytes()).hexdigest(),
        "training":{"seed":20261022,"target":"rank-and-suit-index","realTrainingHands":real_hands,
                    "datasetSeed":provenance["seed"],"datasetGenerator":provenance.get("generator"),
                    "parentCheckpointSha256":parent_hash,
                    "images":image_counts,"requestedEpochs":model.args.get("epochs"),
                    "provenanceSha256":hashlib.sha256(provenance_path.read_bytes()).hexdigest(),
                    "internalValidationMetrics":{key:float(value) for key,value in checkpoint.get("train_metrics",{}).items()},
                    "testImagesUsed":0,"recipe":"scripts/train-card-model.py"},
        "export":{"torch":torch.__version__,"onnx":onnx.__version__,"ultralytics":"8.4.21","opset":17}}
    destination.with_suffix(".metadata.json").write_text(json.dumps(metadata,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(metadata,indent=2))

if __name__=="__main__":
    main()
