#!/usr/bin/env python3
"""Track two anchor points (e.g. the two ends of a glasses frame) through cut.mp4.

Features are tracked with pyramidal Lucas-Kanade inside the product mask (masks.npz if present),
a RANSAC similarity transform is fitted frame to frame and applied to the two anchors. This is
robust on matte black frames where the anchors themselves have little texture.

Writes WORKDIR/measure_track.json : {"<frame>": [x0, y0, x1, y1], ...}

usage: track_points.py WORKDIR --frame 0 --p0 180,1200 --p1 828,1160 [--until 130] [--back 0]
"""
import argparse, json, os
import cv2, numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("workdir"); ap.add_argument("--frame", type=int, default=0)
ap.add_argument("--p0", required=True); ap.add_argument("--p1", required=True)
ap.add_argument("--until", type=int, default=10**9); ap.add_argument("--debug", action="store_true")
a = ap.parse_args()

cap = cv2.VideoCapture(os.path.join(a.workdir, "cut.mp4"))
mp = os.path.join(a.workdir, "masks.npz")
masks = np.load(mp)["masks"] if os.path.exists(mp) else None
frames = []
while True:
    ok, f = cap.read()
    if not ok: break
    frames.append(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY))
H, W = frames[0].shape
pts = np.array([[float(v) for v in a.p0.split(",")], [float(v) for v in a.p1.split(",")]], np.float32)


def feat_mask(k, anchors):
    m = np.zeros((H, W), np.uint8)
    if masks is not None:
        m = cv2.resize(masks[k], (W, H)); m = (m > 100).astype(np.uint8) * 255
        m = cv2.dilate(m, np.ones((25, 25), np.uint8))
    else:
        m[:] = 255
    return m


out = {str(a.frame): pts.flatten().round(1).tolist()}
cur = pts.copy()
lk = dict(winSize=(31, 31), maxLevel=4, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))
last = min(a.until, len(frames) - 1)
for k in range(a.frame, last):
    g0, g1 = frames[k], frames[k + 1]
    f0 = cv2.goodFeaturesToTrack(g0, 600, 0.01, 8, mask=feat_mask(k, cur))
    if f0 is None or len(f0) < 8: break
    f1, st, _ = cv2.calcOpticalFlowPyrLK(g0, g1, f0, None, **lk)
    b, st2, _ = cv2.calcOpticalFlowPyrLK(g1, g0, f1, None, **lk)   # forward-backward check
    good = (st.ravel() == 1) & (st2.ravel() == 1) & (np.linalg.norm(b - f0, axis=2).ravel() < 1.0)
    if good.sum() < 8: break
    # weight features near the anchors more by fitting on the nearest half
    p0g, p1g = f0[good].reshape(-1, 2), f1[good].reshape(-1, 2)
    d = np.min(np.linalg.norm(p0g[:, None] - cur[None], axis=2), axis=1)
    near = d <= np.percentile(d, 60)
    M, inl = cv2.estimateAffinePartial2D(p0g[near], p1g[near], method=cv2.RANSAC, ransacReprojThreshold=2.0)
    if M is None: break
    cur = (cur @ M[:, :2].T + M[:, 2]).astype(np.float32)
    out[str(k + 1)] = cur.flatten().round(1).tolist()
    if not ((0 <= cur[:, 0]).all() and (cur[:, 0] < W).all()): pass  # keep: line can leave the frame

json.dump(out, open(os.path.join(a.workdir, "measure_track.json"), "w"))
print(f"tracked frames {a.frame}..{max(int(k) for k in out)}")
if a.debug:
    for k in list(out)[::15]:
        img = cv2.cvtColor(frames[int(k)], cv2.COLOR_GRAY2BGR); p = out[k]
        cv2.circle(img, (int(p[0]), int(p[1])), 14, (0, 0, 255), 4); cv2.circle(img, (int(p[2]), int(p[3])), 14, (0, 255, 0), 4)
        cv2.imwrite(os.path.join(a.workdir, f"trk_{int(k):03d}.jpg"), cv2.resize(img, (270, 480)))
