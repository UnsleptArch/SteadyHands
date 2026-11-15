import json,re
W=json.load(open("vo_words.json"))
src=open("build.py").read()
ns={}; exec(src.split("GAP=0.28")[0].replace("FF=open(\"takes/ff.txt\").read().strip()",""),ns)
SEG=ns["SEG"]; GAP=0.28; M=json.load(open("vo_meta.json")); tempo=M["tempo"]
out=[];off=0
for a,b,_ in SEG:
    a-=0.06;b+=0.18
    for s,e,x in W:
        if s>=a and e<=b+0.05: out.append([(off+s-a)/tempo,(off+e-a)/tempo,x])
    off+=b-a+GAP
txt=" ".join(x for _,_,x in out)
FIX=[("Passive, Chem Board Certified","pass to become board-certified"),("Keyhole Skills Exam, Surgeons Must","keyhole-skills exam surgeons must"),("OSATs","OSATS"),("time in motion","time and motion"),("instruments handling","instrument handling"),("Keyhole Surgery, the tools pivot","keyhole surgery, the tool pivots"),("caterers","cadavers"),("placing structures","placing sutures"),("OSAT -S style report and sourced facts in trivia mode. Teaches the what?","OSATS-style report and a sourced fact, and a trivia mode teaches the why."),("3 .js","three.js"),("soft -walk","soft-lock"),("re -hand","re-ran"),("Envat Ozash","Enver Ozer"),("hands -on","hands-on"),("mid -event","mid-event"),("first -time","first-time"),("pre -med","pre-med"),("10 times","Ten times"),("a static file","static files")]
for a,b in FIX: txt=txt.replace(a,b)
toks=txt.split(); assert len(toks)>0
# re-time: distribute fixed tokens over original word timeline proportionally
n0=len(out); times=[(out[min(n0-1,int(i*n0/len(toks)))][0],out[min(n0-1,int((i+1)*n0/len(toks))-1)][1]) for i in range(len(toks))]
cues=[];cur=[];
for i,t in enumerate(toks):
    cur.append(i)
    if len(" ".join(toks[j] for j in cur))>42 or t[-1] in ".?!" or i==len(toks)-1:
        cues.append(cur);cur=[]
def ts(x): h=int(x//3600);m=int(x%3600//60);s=x%60; return f"{h:02}:{m:02}:{s:06.3f}".replace(".",",")
L=[]
for k,c in enumerate(cues):
    st=times[c[0]][0]; en=max(times[c[-1]][1], st+0.6)
    if k+1<len(cues): en=min(en+0.25,times[cues[k+1][0]][0])
    line=" ".join(toks[j] for j in c)
    L.append(f"{k+1}\n{ts(st)} --> {ts(en)}\n{line}\n")
open("subs.srt","w").write("\n".join(L)); print(len(L)); print("\n".join(L[:6]))
