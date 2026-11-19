import numpy as np
from PIL import Image
U="photos/"  # βάλε εδώ τις φωτογραφίες με τα ονόματα που χρησιμοποιούνται παρακάτω
def cut(src,name,crop=None,lo=150,hi=250):
    im=Image.open(U+src).convert("RGB")
    if crop: im=im.crop(crop)
    a=np.asarray(im).astype(float); L=a.mean(2,keepdims=True)
    t=np.clip((L-lo)/(hi-lo),0,1); t=t*t*(3-2*t); al=1-t
    rgb=np.where(al>0.01,(a-255*t)/np.maximum(al,0.01),0).clip(0,255)
    out=np.concatenate([rgb,al*255],2).astype("uint8")
    img=Image.fromarray(out,"RGBA"); bb=img.getchannel("A").point(lambda v:255 if v>8 else 0).getbbox()
    print(name,bb); img.save(name+".png")
cut("2ad725ce-image.jpg","front")            # lens at (86,268) before bbox
cut("87a08bfe-image.jpg","top")
cut("3fbc7eaa-image.jpg","temple")
cut("b8327103-image.jpg","volume",(0,215,1280,425))
cut("c9e2f565-image.jpg","side")
def logo(box,name):
    im=Image.open(U+"66243e80-image.png").convert("RGB").crop(box)
    a=np.asarray(im).astype(float); L=a.max(2,keepdims=True)
    al=np.clip((L-70)/(190-70),0,1)
    out=np.concatenate([a,al*255],2).astype("uint8"); Image.fromarray(out,"RGBA").save(name+".png")
logo((260,230,820,500),"logo"); logo((370,235,710,445),"mark")
for f,n,box in [("9a12a307-image.png","th1",(150,300,950,1100)),("9d967a84-image.jpg","th2",(300,500,1300,1500)),("b5769206-image.jpg","th3",(500,700,1500,1700)),("2ad725ce-image.jpg","th4",(250,0,1030,711))]:
    Image.open(U+f).convert("RGB").crop(box).resize((300,300)).save(n+".jpg")
