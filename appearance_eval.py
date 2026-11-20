"""Offline marker + player appearance test. Usage: python appearance_eval.py REVIEW VIDEO"""
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

def descriptor(image, box):
    # Normalize the crop, then pool unsigned gradient directions in spatial cells.
    patch = np.asarray(Image.fromarray(image).crop(box).resize((16, 32)).convert('L'), dtype=float)
    dy, dx = np.gradient(patch)
    bins = (np.arctan2(dy, dx) * 8 / np.pi).astype(int) % 8
    strength = np.hypot(dx, dy)
    cells = []
    for y in range(0, 32, 8):
        for x in range(0, 16, 8):
            region = np.s_[y:y+8, x:x+8]
            hist = np.bincount(bins[region].ravel(), weights=strength[region].ravel(), minlength=8)
            cells.extend(hist / (np.linalg.norm(hist) + 1))
    vector = np.asarray(cells)
    return vector / (np.linalg.norm(vector) + 1e-8)

def proposals(image):
    h,w = image.shape[:2]
    r,g,b = image.astype(int).transpose(2,0,1)
    red = (r>=75) & (r-np.maximum(g,b)>=40) & (abs(g-b)<=35)
    labels,_ = ndimage.label(red)
    counts = np.bincount(labels.ravel())
    for i,slices in enumerate(ndimage.find_objects(labels), 1):
        y,x = slices
        width,height = x.stop-x.start,y.stop-y.start
        cx,top = (x.start+x.stop)//2,y.stop
        if not (3<=counts[i] and .2*w<cx<.8*w and .15*h<top<.8*h and width<=.02*w and height<=.03*h and .5<=width/height<=2):
            continue
        yield cx,top

def people_first(image, positive, negative):
    # Score windows using grayscale appearance; consult team cues only afterwards.
    h,w=image.shape[:2]
    windows=[]
    vectors=[]
    for height in (32,64,96):
        width=height//2
        stride=height//3
        for y in range(int(.12*h),int(.88*h)-height,stride):
            for x in range(int(.15*w),int(.85*w)-width,stride):
                windows.append((x,y,width,height))
                vectors.append(descriptor(image,(x,y,x+width,y+height)))
    if not windows: return []
    vectors=np.asarray(vectors)
    margins=(vectors@np.asarray(positive).T).max(axis=1)-(vectors@np.asarray(negative).T).max(axis=1)
    boxes=[]
    for idx in np.argsort(-margins):
        if margins[idx]<=.05 or len(boxes)>=12: break
        x,y,bw,bh=windows[idx]
        if any(abs(x+bw/2-a-aw/2)<min(bw,aw)/2 and abs(y+bh/2-b-ah/2)<min(bh,ah)/2
               for a,b,aw,ah in boxes): continue
        boxes.append(windows[idx])
    return boxes

def run(report,video,person_first=False):
    rows = sorted((r for r in report['rows'] if r['file']==video.name),key=lambda r:r['timeSeconds'])
    if len(rows)<4: raise ValueError('Not enough matching frames')
    # Freeze a temporal split with a guard gap to avoid near-duplicate evaluation.
    split = (rows[0]['timeSeconds']+rows[-1]['timeSeconds'])/2
    positive,negative = [],[]
    results=[]
    rng=np.random.default_rng(37)
    for row in rows:
        t=row['timeSeconds']
        if abs(t-split)<2: continue
        w,h=row['width'],row['height']
        raw=subprocess.check_output(['ffmpeg','-v','error','-ss',str(t),'-i',str(video),'-frames:v','1','-vf',f'scale={w}:{h}','-pix_fmt','rgb24','-f','rawvideo','-'])
        image=np.frombuffer(raw,np.uint8).reshape(h,w,3)
        boxes=row['regions']
        if t<split:
            for b in boxes:
                if b['label'] not in ('enemy','ally'): continue
                x,y=b['x'],b['y']
                positive.append(descriptor(image,(x,y,x+b['w'],y+b['h'])))
            for _ in range(20):
                x,y=int(rng.integers(0,w-24)),int(rng.integers(0,h-48))
                if all(x+24<=b['x'] or x>=b['x']+b['w'] or y+48<=b['y'] or y>=b['y']+b['h'] for b in boxes):
                    negative.append(descriptor(image,(x,y,x+24,y+48)))
            continue
        if not positive or not negative: raise ValueError('Missing appearance training examples')
        points=[]
        markers=list(proposals(image))
        body_boxes=people_first(image,positive,negative) if person_first else []
        if person_first:
            for x,y,bw,bh in body_boxes:
                if any(abs(mx-(x+bw/2))<=bw*.65 and y-bh*.35<=my<=y+bh*.25 for mx,my in markers):
                    points.append((x+bw/2,y+bh/3))
        for x,top in ([] if person_first else markers):
            scores=[]
            for height in (24,48,80):
                box=(x-height//4,top,x+height//4,top+height)
                if box[0]<0 or box[2]>w or box[3]>h: continue
                vector=descriptor(image,box)
                margin=np.max(np.dot(positive,vector))-np.max(np.dot(negative,vector))
                scores.append((margin,height))
            if scores and max(scores)[0]>.05:
                points.append((x,top+max(scores)[1]//3))
        verdict='miss' if any(b['label']=='enemy' for b in boxes) else 'correctAbstention'
        if len(points)==1:
            x,y=points[0]
            hits=[b['label'] for b in boxes if b['x']<=x<b['x']+b['w'] and b['y']<=y<b['y']+b['h']]
            verdict=hits[0] if len(hits)==1 else ('ambiguous' if hits else 'background')
        results.append({'time':t,'enemyPresent':any(b['label']=='enemy' for b in boxes),'verdict':verdict})
    return {'splitSeconds':split,'guardSeconds':2,'trainingPlayerBoxes':len(positive),'evaluationFrames':len(results),'enemyFrames':sum(r['enemyPresent'] for r in results),'counts':{v:sum(r['verdict']==v for r in results) for v in sorted({r['verdict'] for r in results})},'rows':results}

if __name__=='__main__':
    print(json.dumps(run(json.loads(Path(sys.argv[1]).read_text()),Path(sys.argv[2]),'--person-first' in sys.argv[3:]),indent=2))
