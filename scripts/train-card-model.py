# SPDX-License-Identifier: AGPL-3.0-only
"""Local CPU fine-tuning. All datasets/checkpoints stay in the ignored .tools/ tree."""
import argparse
import json
import os
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
os.environ.setdefault("YOLO_CONFIG_DIR",str(ROOT/".tools/ultralytics-settings"))
os.environ["YOLO_OFFLINE"]="true"
os.environ["OMP_NUM_THREADS"]="6"
os.environ["MKL_NUM_THREADS"]="6"
import torch
from ultralytics import YOLO
from card_model_checkpoint import load_checkpoint

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--data",default=".tools/card-training/pilot-v1/dataset.yaml")
    parser.add_argument("--weights",default=".tools/schafkopf_yolo.pt")
    parser.add_argument("--name",default="pilot-v1")
    parser.add_argument("--epochs",type=int,default=40)
    parser.add_argument("--freeze",type=int,default=10)
    parser.add_argument("--lr",type=float,default=.002)
    parser.add_argument("--nbs",type=int,default=64)
    parser.add_argument("--warmup",type=float,default=2)
    parser.add_argument("--warmup-bias-lr",type=float,default=.1)
    args=parser.parse_args()
    path=(ROOT/args.weights).resolve()
    checkpoint=load_checkpoint(path)
    model=checkpoint.get("ema") or checkpoint["model"]
    model=model.float()
    model.task="detect"
    torch.set_num_threads(6)
    wrapper=YOLO("yolov8n.yaml")
    wrapper.model=model
    wrapper.task="detect"
    wrapper.ckpt={"model":model}
    wrapper.ckpt_path=str(path)
    wrapper.overrides={"task":"detect","model":str(path)}
    result=wrapper.train(data=str((ROOT/args.data).resolve()),project=str(ROOT/".tools/card-training/runs"),
        name=args.name,exist_ok=False,epochs=args.epochs,patience=15,batch=8,imgsz=640,
        device="cpu",workers=0,cache=False,freeze=args.freeze,optimizer="AdamW",
        lr0=args.lr,lrf=.1,nbs=args.nbs,weight_decay=.0005,
        warmup_epochs=args.warmup,warmup_bias_lr=args.warmup_bias_lr,
        mosaic=0,mixup=0,copy_paste=0,fliplr=0,flipud=0,
        degrees=12,translate=.06,scale=.15,perspective=0,
        hsv_h=.008,hsv_s=.15,hsv_v=.15,close_mosaic=0,
        amp=False,plots=False,save=True,save_period=10,seed=20261022,
        deterministic=True,verbose=False)
    out=Path(wrapper.trainer.save_dir)
    (out/"summary.json").write_text(json.dumps({"metrics":{key:float(value) for key,value in result.results_dict.items()},
        "best":str(wrapper.trainer.best),"last":str(wrapper.trainer.last),
        "target":"rank-and-suit-index","testImagesUsed":0},indent=2)+"\n",encoding="utf-8")
    print("TRAINING_COMPLETE",out)

if __name__=="__main__":
    main()
