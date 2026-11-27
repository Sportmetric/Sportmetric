import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
U="/root/.claude/uploads/c27c4adf-86ab-57b8-b80e-0d04b848b115/"
sheet=Image.open(U+"2cc5452c-image.jpg").convert("RGB")
def lines(box,name,scale=3,thr=(235,120)):
    im=sheet.crop(box); im=im.resize((im.width*scale,im.height*scale),Image.LANCZOS)
    L=np.asarray(im.convert("L")).astype(float)
    a=np.clip((thr[0]-L)/(thr[0]-thr[1]),0,1)
    out=np.zeros((L.shape[0],L.shape[1],4),np.uint8); out[...,:3]=255; out[...,3]=(a*255).astype(np.uint8)
    Image.fromarray(out,"RGBA").save(name)
lines((875,125,1245,262),"bp_front.png")
lines((875,285,1245,410),"bp_side.png")
lines((1005,450,1250,815),"bp_top.png")
def crop(box,name,scale=1):
    im=sheet.crop(box)
    if scale!=1: im=im.resize((int(im.width*scale),int(im.height*scale)),Image.LANCZOS)
    im=im.filter(ImageFilter.UnsharpMask(2,80,2)); im.save(name,quality=95)
crop((25,607,1010,830),"exploded.jpg",2)
crop((40,395,221,546),"d1.jpg",3);crop((228,395,433,546),"d2.jpg",3);crop((440,395,636,546),"d3.jpg",3);crop((642,395,836,546),"d4.jpg",3)
crop((20,95,850,390),"hero.jpg",1.6)
# wordmark white
w=Image.open(U+"dcf7625c-image.jpg").convert("L"); a=np.clip((200-np.asarray(w).astype(float))/150,0,1)
img=np.zeros((w.height,w.width,4),np.uint8); img[...,:3]=255; img[...,3]=(a*255).astype(np.uint8)
im=Image.fromarray(img,"RGBA"); im=im.crop(im.getchannel("A").point(lambda v:255 if v>20 else 0).getbbox()); im.save("wordmark.png"); print("wm",im.size)
Image.open(U+"68343c4a-image.jpg").convert("RGB").save("manual.jpg",quality=95)
# app icon crop from manual (800x1600)
Image.open(U+"68343c4a-image.jpg").convert("RGB").crop((250,510,555,815)).resize((610,610),Image.LANCZOS).save("appicon.jpg",quality=95)
