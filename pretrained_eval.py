"""Offline grayscale HOG experiment. Arguments: review.json video.mp4 weights.bin.
Uses OpenCV's pretrained linear SVM with an independent NumPy feature extractor.
"""
import json
import sys
import subprocess
from collections import Counter
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage
from appearance_eval import proposals

def boxes_for_scale(image,weights,scale):
    image=image.resize((round(image.width*scale),round(image.height*scale)),Image.Resampling.BILINEAR)
    gray=np.sqrt(np.asarray(image,dtype=np.float32))
    gx=ndimage.correlate1d(gray,[-1.,0.,1.],axis=1,mode='mirror')
    gy=ndimage.correlate1d(gray,[-1.,0.,1.],axis=0,mode='mirror')
    mag=np.hypot(gx,gy)
    angle=(np.arctan2(gy,gx)*9/np.pi-.5)%9
    lower=np.floor(angle).astype(int)
    frac=angle-lower
    height,width=gray.shape
    rows=(height-16)//8+1
    cols=(width-16)//8+1
    if rows<15 or cols<7:return []
    hist=np.zeros((rows,cols,4,9),np.float32)
    # Gaussian-weighted orientation votes with bilinear cell interpolation.
    for y in range(16):
        for x in range(16):
            view=np.s_[y:y+8*rows:8,x:x+8*cols:8]
            vote=mag[view]*np.exp(-((x-8)**2+(y-8)**2)/32)
            lo=lower[view]
            ry,rx=np.ogrid[:rows,:cols]
            for cx in (0,1):
                for cy in (0,1):
                    weight=max(0,1-abs((x+.5)/8-.5-cx))*max(0,1-abs((y+.5)/8-.5-cy))
                    if weight:
                        cell=hist[:,:,2*cx+cy,:]
                        cell[ry,rx,lo]+=vote*weight*(1-frac[view])
                        cell[ry,rx,(lo+1)%9]+=vote*weight*frac[view]
    hist=hist.reshape(rows,cols,36)
    hist/=np.linalg.norm(hist,axis=2,keepdims=True)+3.6
    np.minimum(hist,.2,out=hist)
    hist/=np.linalg.norm(hist,axis=2,keepdims=True)+.001
    grid=np.lib.stride_tricks.sliding_window_view(hist,(15,7),axis=(0,1))
    coeff=weights[:-1].reshape(7,15,36).transpose(2,1,0)
    scores=np.einsum('ijabc,abc->ij',grid,coeff)+weights[-1]
    return [(float(scores[y,x]),(x*8/scale,y*8/scale,64/scale,128/scale))
            for y,x in zip(*np.where(scores>=0))]

def iou(a,b):
    x,y,w,h=a; u,v,s,t=b
    overlap=max(0,min(x+w,u+s)-max(x,u))*max(0,min(y+h,v+t)-max(y,v))
    return overlap/(w*h+s*t-overlap)

def evaluate(rows,video,weights):
    totals=Counter(); log=[]
    for row in rows:
        w,h=row['width'],row['height']
        data=subprocess.check_output(['ffmpeg','-v','error','-ss',str(row['timeSeconds']),'-i',str(video),
            '-frames:v','1','-vf',f'scale={w}:{h}','-pix_fmt','rgb24','-f','rawvideo','-'])
        rgb=Image.frombytes('RGB',(w,h),data)
        gray=rgb.convert('L'); raw=[]
        for scale in (.75,1,1.5,2,3):raw.extend(boxes_for_scale(gray,weights,scale))
        kept=[]
        for _,box in sorted(raw,reverse=True):
            if all(iou(box,k)<.4 for k in kept):kept.append(box)
        gt=[(b['label'],(b['x'],b['y'],b['w'],b['h'])) for b in row['regions'] if b['label'] in ('enemy','ally')]
        totals['people']+=len(gt);totals['detections']+=len(kept)
        paired=set();matches={}
        for overlap,k,g in sorted(((iou(box,b),k,g) for k,box in enumerate(kept) for g,(_,b) in enumerate(gt)),reverse=True):
            if overlap<.3:break
            if k not in matches and g not in paired:matches[k]=g;paired.add(g)
        totals['person_hits']+=len(matches)
        marks=list(proposals(np.asarray(rgb)))
        selected=[k for k,(x,y,bw,bh) in enumerate(kept) if any(abs(mx-x-bw/2)<=bw*.65 and y-bh*.35<=my<=y+bh*.25 for mx,my in marks)]
        outcome='abstained'
        if len(selected)==1:
            k=selected[0];outcome=gt[matches[k]][0] if k in matches else 'unmatched'
        totals[outcome]+=1
        log.append(dict(time=row['timeSeconds'],people=len(gt),predicted=len(kept),matched=len(matches),teamDecision=outcome))
    return dict(frames=len(rows),totals=dict(totals),rows=log)

if __name__=='__main__':
    report,video,coeff=map(Path,sys.argv[1:])
    rows=sorted((r for r in json.loads(report.read_text())['rows'] if r['file']==video.name),key=lambda r:r['timeSeconds'])
    if not rows:raise ValueError('No matching annotations')
    split=(rows[0]['timeSeconds']+rows[-1]['timeSeconds'])/2
    weights=np.fromfile(coeff,np.float32)
    if weights.size!=3781:raise ValueError('Invalid SVM dimensionality')
    print(json.dumps(evaluate([r for r in rows if r['timeSeconds']>=split+2],video,weights),indent=2))
