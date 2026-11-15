import json, subprocess, os
FF=open("takes/ff.txt").read().strip()
W=json.load(open("vo_words.json"))
def wend(t): # end of word starting nearest t
    return min(W,key=lambda w:abs(w[0]-t))[1]
def wstart(word,after):
    for s,e,x in W:
        if s>=after and x.lower().startswith(word.lower()): return s
st=wstart
SEG=[(2.4,15.2,"problem"),(16.88,32.4,"questions"),(33.3,wend(52.66),None),
 (st("Steady",55),63.7,"game"),(65.6,68.6,None),(70.4,77.2,None),(78.0,87.4,None),(88.3,94.5,None),(95.3,108.6,None),
 (st("That",110.3),131.9,"breadth"),(132.7,139.0,None),(140.0,146.1,None),
 (st("Plenty",151.5),178.2,"broke"),(178.9,186.7,None),(189.1,194.3,None),
 (208.12,wend(224.12),"expert"),(232.36,237.5,None),
 (239.3,wend(242.44),"who"),(243.98,256.0,None)]
GAP=0.28
# audio cut
parts=[];labels=[];t=0
for i,(a,b,lab) in enumerate(SEG):
    a-=0.06;b+=0.18
    if lab: labels.append((lab,t))
    parts.append(f"[0:a]atrim={a:.2f}:{b:.2f},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st={b-a-0.03:.2f}:d=0.03[s{i}]")
    t+=b-a+GAP
n=len(SEG)
fc=";".join(parts)+";"+";".join(f"[s{i}]apad=pad_dur={GAP}[p{i}]" for i in range(n))+";"+"".join(f"[p{i}]" for i in range(n))+f"concat=n={n}:v=0:a=1[cat]"
raw=t
TARGET=176.0
tempo=max(1.0,min(1.2,raw/TARGET))
fc+=f";[cat]highpass=f=80,lowpass=f=13000,afftdn=nf=-25,acompressor=threshold=-20dB:ratio=3:attack=5:release=80,atempo={tempo:.4f},loudnorm=I=-16:TP=-1.5:LRA=9[vo]"
subprocess.run([FF,"-v","error","-y","-i","vo_raw.wav","-filter_complex",fc,"-map","[vo]","-ar","48000","vo_final.wav"],check=True)
VO=raw/tempo
labels=[(l,s/tempo) for l,s in labels]
json.dump({"raw":raw,"tempo":tempo,"vo":VO,"labels":labels},open("vo_meta.json","w"))
print("raw",round(raw,1),"tempo",round(tempo,3),"vo",round(VO,1),labels)
