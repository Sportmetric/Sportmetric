#!/usr/bin/env python3
"""Product cut-out masks (for clips with no person): rembg isnet-general-use on every frame.

Writes WORKDIR/masks.npz (uint8, half resolution 540x960, one mask per frame of cut.mp4).
The model (~180 MB) is fetched once into ~/.u2net by rembg.

usage: product_masks.py WORKDIR [--model isnet-general-use]
"""
import argparse, os, sys, time
import cv2, numpy as np
from PIL import Image

ap = argparse.ArgumentParser(); ap.add_argument("workdir"); ap.add_argument("--model", default="isnet-general-use")
a = ap.parse_args()
from rembg import new_session, remove
s = new_session(a.model)
cap = cv2.VideoCapture(os.path.join(a.workdir, "cut.mp4"))
n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); masks = []; t0 = time.time()
while True:
    ok, f = cap.read()
    if not ok: break
    m = np.asarray(remove(Image.fromarray(cv2.cvtColor(f, cv2.COLOR_BGR2RGB)), session=s, only_mask=True))
    masks.append(cv2.resize(m, (540, 960), interpolation=cv2.INTER_AREA))
    if len(masks) % 20 == 0:
        print(f"{len(masks)}/{n}  {time.time() - t0:.0f}s", file=sys.stderr, flush=True)
np.savez_compressed(os.path.join(a.workdir, "masks.npz"), masks=np.stack(masks))
print(f"masks.npz: {len(masks)} frames")
