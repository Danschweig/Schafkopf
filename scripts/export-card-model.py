# SPDX-License-Identifier: AGPL-3.0-only
"""Development-only conversion; the deployed app needs neither Python nor a server.

Input: schafkopf_yolo.pt from Nikiki95/schafkopf-engine, commit
d4e4efc04973416b1aa98e2d13cd268c8fcf0f6d. The checkpoint declares AGPL-3.0.
Use Python 3.13, torch 2.8.0 CPU, torchvision 0.23.0, ultralytics 8.4.21,
onnx 1.18.0. Run with YOLO_CONFIG_DIR pointing to a development directory.

The foreign checkpoint is opened with the restricted weights-only unpickler.
Only model-layer classes from the installed libraries are explicitly allowed.
"""
import hashlib
import importlib
import json
import os
from pathlib import Path
import shutil
import sys

ROOT=Path(__file__).resolve().parents[1]
os.environ.setdefault("YOLO_CONFIG_DIR",str(ROOT/".tools"/"ultralytics-settings"))
Path(os.environ["YOLO_CONFIG_DIR"]).mkdir(parents=True,exist_ok=True)
import torch
from ultralytics import YOLO

checkpoint_path=Path(sys.argv[1] if len(sys.argv)>1 else ROOT/".tools"/"schafkopf_yolo.pt")
allowed=[]
for qualified in torch.serialization.get_unsafe_globals_in_checkpoint(checkpoint_path):
    if qualified=="builtins.set":
        allowed.append(set)
        continue
    if not qualified.startswith(("torch.nn.modules.","ultralytics.nn.")):
        raise ValueError(f"Refusing unexpected pickle global: {qualified}")
    module,name=qualified.rsplit(".",1)
    layer=getattr(importlib.import_module(module),name)
    if not isinstance(layer,type):
        raise ValueError(f"Refusing non-class pickle global: {qualified}")
    allowed.append(layer)
with torch.serialization.safe_globals(allowed):
    checkpoint=torch.load(checkpoint_path,map_location="cpu",weights_only=True)

model=checkpoint["model"].float().eval()
model.task="detect"
suits=["Eichel","Gras","Herz","Schellen"]
ranks=["7","8","9","10","Unter","Ober","Koenig","Ass"]
expected=[f"{suit}_{rank}" for suit in suits for rank in ranks]
if [model.names[index] for index in range(32)]!=expected:
    raise ValueError("Unexpected checkpoint class mapping")

wrapper=YOLO("yolov8n.yaml")
wrapper.model=model
wrapper.task="detect"
wrapper.model.pt_path=str(ROOT/".tools"/"bavarian-cards.pt")
wrapper.overrides={"task":"detect","model":wrapper.model.pt_path}
exported=wrapper.export(format="onnx",imgsz=640,batch=1,dynamic=False,
    simplify=False,opset=17,nms=False,half=False,device="cpu")
destination=ROOT/"models"/"bavarian-cards.onnx"
destination.parent.mkdir(exist_ok=True)
shutil.copyfile(exported,destination)
metadata={
    "version":"bavarian-yolov8n-2026-03-13",
    "source":"https://github.com/Nikiki95/schafkopf-engine/blob/d4e4efc04973416b1aa98e2d13cd268c8fcf0f6d/schafkopf_yolo.pt",
    "sourceSha256":hashlib.sha256(checkpoint_path.read_bytes()).hexdigest(),
    "license":checkpoint.get("license","AGPL-3.0"),
    "onnxSha256":hashlib.sha256(destination.read_bytes()).hexdigest(),
    "inputShape":[1,3,640,640],"outputShape":[1,36,8400],"classNames":expected,
    "export":{"torch":"2.8.0+cpu","ultralytics":"8.4.21","onnx":"1.18.0","opset":17}
}
destination.with_suffix(".metadata.json").write_text(json.dumps(metadata,indent=2)+"\n",encoding="utf-8")
print(json.dumps(metadata,indent=2))
