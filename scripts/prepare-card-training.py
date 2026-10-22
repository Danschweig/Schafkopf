"""Build a local corner-index detection pilot dataset from reviewed photographs.

Only reference sheets and training/ photographs are read. test/ is never read.
PNG/JPEG transformations are geometric/photometric data augmentation, no AI images.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SIZE = 640
IDS = [f"{suit}-{rank}" for suit in ["eichel","gras","herz","schellen"]
       for rank in ["sieben","acht","neun","zehn","unter","ober","koenig","ass"]]
NAMES = [f"{suit}_{rank}" for suit in ["Eichel","Gras","Herz","Schellen"]
         for rank in ["7","8","9","10","Unter","Ober","Koenig","Ass"]]
# Index rectangles in the deskewed individual reference cards, including margin.
INDEXES = [[.035,.055,.185,.22],[.815,.055,.965,.22],
           [.035,.78,.185,.945],[.815,.78,.965,.945]]

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def oriented_training_hand(image, metadata):
    """Orient a derived view while keeping annotations in original-file pixels."""
    degrees=metadata.get("trainingRotationDegreesCCW",0)
    if degrees not in (0,90,180,270):
        raise ValueError("trainingRotationDegreesCCW must be 0, 90, 180 or 270")
    annotations=[dict(ann,indexBox=list(ann["indexBox"])) for ann in metadata["annotations"]]
    for _ in range(degrees//90):
        height,width=image.shape[:2]
        image=cv2.rotate(image,cv2.ROTATE_90_COUNTERCLOCKWISE)
        for ann in annotations:
            x1,y1,x2,y2=ann["indexBox"]
            ann["indexBox"]=[y1,width-x2,y2,width-x1]
    return image,annotations

def save_json(path,value):
    path.write_text(json.dumps(value,indent=2)+"\n",encoding="utf-8")

def background(rng,photos=None):
    if photos and rng.random()<.6:
        image=photos[int(rng.integers(len(photos)))]
        return cv2.GaussianBlur(cv2.resize(image,(SIZE,SIZE)),(15,15),0)
    color = rng.uniform(45,190,3)
    noise = rng.normal(0,4,(SIZE,SIZE,1))
    gradient = np.linspace(-18,18,SIZE)[None,:,None]
    return np.uint8(np.clip(color+noise+gradient,0,255))

def photo_effects(image,rng):
    gains = rng.uniform(.86,1.12,3)
    image = np.clip(image.astype(np.float32)*gains*rng.uniform(.72,1.18)+rng.uniform(-12,12),0,255)
    image += rng.normal(0,rng.uniform(0,2.5),image.shape)
    image = np.uint8(np.clip(image,0,255))
    if rng.random()<.15:
        image = cv2.GaussianBlur(image,(3,3),rng.uniform(.2,.65))
    return image

def save_sample(out,split,name,image,labels):
    image_path = out/"images"/split/(name+".jpg")
    cv2.imwrite(str(image_path),image,[cv2.IMWRITE_JPEG_QUALITY,93])
    lines=[]
    for cls,box in labels:
        x1,y1,x2,y2 = np.clip(box,0,SIZE)
        if x2-x1<6 or y2-y1<6:
            continue
        lines.append(f"{cls} {(x1+x2)/2/SIZE:.8f} {(y1+y2)/2/SIZE:.8f} {(x2-x1)/SIZE:.8f} {(y2-y1)/SIZE:.8f}")
    (out/"labels"/split/(name+".txt")).write_text("\n".join(lines)+("\n" if lines else ""),encoding="utf-8")

def scene(refs,rng,index,photos=None):
    canvas = background(rng,photos)
    # Include backgrounds without cards to teach the detector to abstain.
    if index%16==0:
        return canvas,[]
    ids = rng.choice(32,size=8 if index%3!=0 else rng.integers(2,6),replace=False)
    owner = np.zeros((SIZE,SIZE),np.uint8)
    pending=[]
    fan = index%3!=0
    angle_base = rng.uniform(-35,35) + (90 if index%9==0 else 0)
    for position,cls in enumerate(ids):
        image = refs[int(cls)]
        ih,iw=image.shape[:2]
        if fan:
            height=rng.uniform(300,380)
            cx=125+position*47+rng.uniform(-4,4)
            cy=rng.uniform(350,390)
            angle=angle_base+(position-3.5)*rng.uniform(3,6)
        else:
            height=rng.uniform(180,290)
            cx=rng.uniform(110,530)
            cy=rng.uniform(140,500)
            angle=rng.uniform(-180,180)
        scale=height/ih
        matrix=cv2.getRotationMatrix2D((iw/2,ih/2),angle,scale)
        matrix[:,2]+=np.array([cx-iw/2,cy-ih/2])
        mask=np.full((ih,iw),255,np.uint8)
        warped=cv2.warpAffine(image,matrix,(SIZE,SIZE),flags=cv2.INTER_LINEAR)
        visible=cv2.warpAffine(mask,matrix,(SIZE,SIZE),flags=cv2.INTER_NEAREST)>0
        canvas[visible]=warped[visible]
        owner[visible]=position+1
        for box in INDEXES:
            x1,y1,x2,y2=np.array(box)*[iw,ih,iw,ih]
            points=np.float32([[x1,y1],[x2,y1],[x2,y2],[x1,y2]])
            transformed=cv2.transform(points[None],matrix)[0]
            pending.append((int(cls),position+1,transformed))
    if photos and fan and rng.random()<.45:
        # Synthetic palm/occluder; ownership also changes so hidden indices are
        # never retained as visible training targets.
        center=(int(rng.uniform(190,430)),int(rng.uniform(485,590)))
        axes=(int(rng.uniform(90,180)),int(rng.uniform(45,85)))
        color=tuple(int(v) for v in [rng.uniform(75,135),rng.uniform(105,170),rng.uniform(150,215)])
        occlusion_angle=int(rng.uniform(-35,35))
        cv2.ellipse(canvas,center,axes,occlusion_angle,0,360,color,-1)
        cv2.ellipse(owner,center,axes,occlusion_angle,0,360,0,-1)
    labels=[]
    for cls,own,points in pending:
        poly=np.zeros((SIZE,SIZE),np.uint8)
        cv2.fillConvexPoly(poly,np.int32(points),1)
        area=float(cv2.contourArea(points))
        # Exclude cropped or covered indices rather than labeling hidden cards.
        if area<=0 or np.count_nonzero((poly>0)&(owner==own))/area<.82:
            continue
        lo=points.min(axis=0);hi=points.max(axis=0)
        labels.append((cls,[*lo,*hi]))
    return photo_effects(canvas,rng),labels

def real_sample(image,annotations,rng,number,photos=None):
    # The reviewed labels describe the top indices only. Restrict this derived
    # training view to their band, excluding unannotated mirrored bottom indices.
    ih,iw=image.shape[:2]
    boxes=np.float32([ann["indexBox"] for ann in annotations])
    lo=boxes[:,:2].min(axis=0);hi=boxes[:,2:].max(axis=0)
    pad=(hi-lo)*rng.uniform(.04,.25)
    x1,y1=np.maximum(0,lo-pad).astype(int)
    x2,y2=np.minimum([iw,ih],hi+pad).astype(int)
    crop=image[y1:y2,x1:x2]
    ch,cw=crop.shape[:2]
    scale=min(SIZE/cw,SIZE/ch)*rng.uniform(.48,.96)
    angle=rng.uniform(-28,28) if photos else rng.uniform(-18,18)
    if photos and rng.random()<.4:
        angle+=int(rng.choice([90,180,270]))
    if photos:
        rad=math.radians(angle)
        rw=abs(cw*math.cos(rad))+abs(ch*math.sin(rad))
        rh=abs(cw*math.sin(rad))+abs(ch*math.cos(rad))
        scale=min(620/rw,620/rh)*rng.uniform(.45,.95)
    matrix=cv2.getRotationMatrix2D((cw/2,ch/2),angle,scale)
    center_y=SIZE/2 if photos else rng.uniform(280,430)
    matrix[:,2]+=np.array([SIZE/2-cw/2,center_y-ch/2])
    canvas=background(rng,photos)
    mask=cv2.warpAffine(np.full((ch,cw),255,np.uint8),matrix,(SIZE,SIZE),flags=cv2.INTER_NEAREST)>0
    warped=cv2.warpAffine(crop,matrix,(SIZE,SIZE),flags=cv2.INTER_LINEAR)
    canvas[mask]=warped[mask]
    labels=[]
    for ann in annotations:
        bx1,by1,bx2,by2=ann["indexBox"]
        points=np.float32([[bx1-x1,by1-y1],[bx2-x1,by1-y1],[bx2-x1,by2-y1],[bx1-x1,by2-y1]])
        points=cv2.transform(points[None],matrix)[0]
        if points.min()<0 or points.max()>SIZE:
            continue
        labels.append((IDS.index(ann["cardId"]),[*points.min(axis=0),*points.max(axis=0)]))
    return photo_effects(canvas,rng),labels

def index_scene(refs,rng,index,photos=None):
    """Teach rank/suit shapes without relying on the large card artwork."""
    canvas=background(rng,photos)
    labels=[]
    ids=rng.choice(32,size=8,replace=False)
    for number,cls in enumerate(ids):
        image=refs[int(cls)];ih,iw=image.shape[:2]
        box=np.array(INDEXES[int(rng.integers(4))])*[iw,ih,iw,ih]
        x1,y1,x2,y2=box.astype(int)
        # Include surrounding paper to avoid identifying pasted box borders.
        mx,my=max(5,int(iw*.035)),max(5,int(ih*.025))
        left,top=max(0,x1-mx),max(0,y1-my)
        patch=image[top:min(ih,y2+my),left:min(iw,x2+mx)]
        ph,pw=patch.shape[:2]
        height=rng.uniform(45,105)
        matrix=cv2.getRotationMatrix2D((pw/2,ph/2),rng.uniform(-180,180),height/ph)
        cx=90+(number%4)*150+rng.uniform(-15,15)
        cy=175+(number//4)*270+rng.uniform(-40,40)
        matrix[:,2]+=[cx-pw/2,cy-ph/2]
        mask=cv2.warpAffine(np.full((ph,pw),255,np.uint8),matrix,(SIZE,SIZE),flags=cv2.INTER_NEAREST)>0
        warped=cv2.warpAffine(patch,matrix,(SIZE,SIZE))
        canvas[mask]=warped[mask]
        points=cv2.transform(np.float32([[[x1-left,y1-top],[x2-left,y1-top],[x2-left,y2-top],[x1-left,y2-top]]]),matrix)[0]
        labels.append((int(cls),[*points.min(axis=0),*points.max(axis=0)]))
    return photo_effects(canvas,rng),labels

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",default=".tools/card-training/pilot-v1")
    parser.add_argument("--synthetic",type=int,default=224)
    parser.add_argument("--seed",type=int,default=20261022)
    parser.add_argument("--real-variants",type=int,default=16)
    parser.add_argument("--patch-scenes",type=int,default=0)
    parser.add_argument("--photo-backgrounds",action="store_true")
    args=parser.parse_args()
    data=ROOT/"kartenfotos"
    out=(ROOT/args.output).resolve()
    out.relative_to(ROOT)
    out.mkdir(parents=True,exist_ok=False)
    for split in ["train","val"]:
        for kind in ["images","labels"]:
            (out/kind/split).mkdir(parents=True)
    refs={}; provenance={"version":2 if args.photo_backgrounds or args.patch_scenes else 1,"target":"rank-and-suit-index","seed":args.seed,"sources":[],
                            "generator":{"synthetic":args.synthetic,"patchScenes":args.patch_scenes,"realVariantsPerHand":args.real_variants,"photoBackgrounds":args.photo_backgrounds,"validationImages":64,"validationSeed":78931},
                            "testPolicy":"No test photos or their derivatives are read during dataset generation or training.",
                            "validation":"Different arrangements from the first reference photograph; not independent real hand validation."}
    for split,filename in [("train","karten2.png"),("val","karten1.png")]:
        refs[split]=[]
        for cid in IDS:
            suit,rank=cid.split("-")
            path=data/"einzelkarten"/suit/rank/filename
            image=cv2.imread(str(path));assert image is not None,path
            refs[split].append(image)
            provenance["sources"].append({"file":path.relative_to(data).as_posix(),"sha256":digest(path),"split":split})
    real_sources=[];backgrounds=[]
    # Do not silently omit newly added, still unlabelled photographs.
    for photo in (data/"training").iterdir():
        if photo.suffix.lower() in (".jpg",".jpeg",".png") and not photo.with_suffix(".labels.json").is_file():
            raise ValueError(f"Training photo needs reviewed annotations: {photo.name}")
    for labels_path in sorted((data/"training").glob("*.labels.json")):
        metadata=json.loads(labels_path.read_text(encoding="utf-8"))
        assert metadata["split"]=="training"
        source=(data/metadata["source"]).resolve();source.relative_to((data/"training").resolve())
        assert digest(source)==metadata["sourceSha256"]
        image=cv2.imread(str(source));assert image is not None,source
        image,annotations=oriented_training_hand(image,metadata)
        metadata={**metadata,"annotations":annotations}
        real_sources.append((source,metadata,image,labels_path))
        if args.photo_backgrounds:
            ih,iw=image.shape[:2]
            boxes=np.array([ann["indexBox"] for ann in metadata["annotations"]])
            top=int(boxes[:,1].min()*.6)
            if top>ih*.15:region=image[:top]
            else:region=image[:ih//3,min(iw-50,int(boxes[:,2].max()+iw*.1)):]
            backgrounds.append(cv2.resize(region,(SIZE,SIZE)))
    for split,count,seed in [("train",args.synthetic,args.seed),("val",64,78931)]:
        rng=np.random.default_rng(seed)
        for index in range(count):
            image,labels=scene(refs[split],rng,index,backgrounds if args.photo_backgrounds and split=="train" else None)
            save_sample(out,split,f"synthetic-{index:04d}",image,labels)
    rng=np.random.default_rng(args.seed+97)
    for index in range(args.patch_scenes):
        image,labels=index_scene(refs["train"],rng,index,backgrounds)
        save_sample(out,"train",f"index-{index:04d}",image,labels)
    rng=np.random.default_rng(39245 if args.seed==20261022 else args.seed+103)
    # Explicitly select training/, never glob all hand annotations or manifest hands.
    for source,metadata,image,labels_path in real_sources:
        provenance["sources"].append({"file":source.relative_to(data).as_posix(),"sha256":digest(source),"split":"train",
                                      "annotationsSha256":digest(labels_path),"trainingRotationDegreesCCW":metadata.get("trainingRotationDegreesCCW",0)})
        for index in range(args.real_variants):
            sample,labels=real_sample(image,metadata["annotations"],rng,index,backgrounds if args.photo_backgrounds else None)
            save_sample(out,"train",f"real-{source.stem}-{index:03d}",sample,labels)
    # JSON is valid YAML, and preserves Windows paths without quoting hazards.
    config={"path":out.as_posix(),"train":"images/train","val":"images/val","names":dict(enumerate(NAMES))}
    save_json(out/"dataset.yaml",config)
    save_json(out/"provenance.json",provenance)
    counts={split:len(list((out/"images"/split).glob("*.jpg"))) for split in ["train","val"]}
    print(json.dumps({"dataset":str(out/"dataset.yaml"),"images":counts,"testImagesUsed":0}))

if __name__=="__main__":
    main()
