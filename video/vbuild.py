import json, subprocess, sys
FF=open("takes/ff.txt").read().strip(); FONT=sys.argv[1]
M=json.load(open("vo_meta.json")); VO=M["vo"]; END=3.5; T=VO+END
L={"incision":12.7,"suture":18.3,"lap":34.8,"appendectomy":44.0,"central_line":49.7,"cholecystectomy":102.0,"chest_tube":58.3}
SRC={"problem":[("appendectomy",0.5)],"questions":[("lap",3),("incision",1)],
 "game":[("incision",1),("suture",2),("lap",8),("appendectomy",14),("central_line",8),("cholecystectomy",25),("chest_tube",10)],
 "breadth":[("chest_tube",6),("central_line",20)],"broke":[("appendectomy",20),("incision",2),("cholecystectomy",50)],
 "expert":[("suture",1),("lap",15),("suture",9)],"who":[("central_line",30),("cholecystectomy",70),("chest_tube",30)]}
TITLE={"problem":"THE PROBLEM_","questions":"THE QUESTIONS_","game":"THE GAME_","breadth":"BREADTH_","broke":"WHAT BROKE_","expert":"EXPERT FEEDBACK_","who":"WHO IT HELPS_"}
labs=M["labels"]+[("end",VO)]
names=list(L); idx={n:i for i,n in enumerate(names)}
chunks=[]
for k,(lab,s) in enumerate(labs[:-1]):
    e=labs[k+1][1]; srcs=SRC[lab]; ptr={i:p for i,(c,p) in enumerate(srcs)}; t=s; j=0
    per=max(4.0,(e-s)/len(srcs)) if lab!="game" else (e-s)/len(srcs)
    while t<e-0.05:
        c,_=srcs[j%len(srcs)]; d=min(per,e-t); a=ptr[j%len(srcs)]
        if a+d>L[c]-0.3: a=max(0.5,L[c]-0.3-d)
        chunks.append((c,a,min(d,L[c]-0.6),lab)); ptr[j%len(srcs)]=a+d; t+=chunks[-1][2]; j+=1
inputs=[];fc=[]
for (c,a,d,lab) in chunks: inputs+=["-ss",f"{a:.2f}","-t",f"{d:.2f}","-i",f"takes/{c}.mp4"]
inputs+=["-i","vo_final.wav","-stream_loop","-1","-i","/home/unslept/game-theory-urandom/video/dedede.wav"]
nV=len(chunks)
for i,(c,a,d,lab) in enumerate(chunks):
    fc.append(f"[{i}:v]setpts=PTS-STARTPTS,fps=30,scale=1600:900,pad=1920:1080:160:110:color=black,drawbox=x=158:y=108:w=1604:h=904:color=0x2b2e35:t=2[c{i}]")
tot=sum(c[2] for c in chunks)
fc.append(f"color=black:s=1920x1080:r=30:d={END}[endc]")
fc.append("".join(f"[c{i}]" for i in range(len(chunks)))+f"[endc]concat=n={len(chunks)+1}:v=1:a=0[base]")
dt=[]
for lab,s in M["labels"]:
    e=[x[1] for x in labs if x[1]>s][0]
    dt.append(f"drawtext=fontfile={FONT}:text=\x27{TITLE[lab]}\x27:x=160:y=40:fontsize=40:fontcolor=0x7CFC9A:enable=\x27between(t,{s:.2f},{e:.2f})\x27:alpha=\x27min(1,(t-{s:.2f})/0.4)\x27")
dt.append(f"drawtext=fontfile={FONT}:text=\x27steady_hands\x27:x=1760-tw:y=48:fontsize=26:fontcolor=0x858c99:enable=\x27lt(t,{tot:.2f})\x27")
dt.append(f"drawtext=fontfile={FONT}:text=\x27STEADY HANDS_\x27:x=(w-tw)/2:y=470:fontsize=96:fontcolor=0x7CFC9A:enable=\x27gte(t,{tot:.2f})\x27")
dt.append(f"drawtext=fontfile={FONT}:text=\x27practice on pixels, not patients.\x27:x=(w-tw)/2:y=600:fontsize=40:fontcolor=0xEBEDF2:enable=\x27gte(t,{tot+0.6:.2f})\x27")
fc.append("[base]"+",".join(dt)+",vignette=PI/5,noise=alls=3:allf=t,format=yuv420p[v]")
fc.append(f"[{nV+1}:a]atrim=0:{T:.2f},asetpts=PTS-STARTPTS,volume=\x27if(lt(t,{VO:.2f}),0.075,0.28)\x27:eval=frame,afade=t=in:d=1.5,afade=t=out:st={T-2:.2f}:d=2[mu]")
fc.append(f"[{nV}:a]apad[vo2];[vo2][mu]amix=inputs=2:duration=longest:normalize=0,atrim=0:{T:.2f}[au]")
open("fc.txt","w").write(";".join(fc))
cmd=[FF,"-v","error","-stats","-y"]+inputs+["-/filter_complex","fc.txt","-map","[v]","-map","[au]","-t",f"{T:.2f}","-c:v","libx264","-preset","veryfast","-crf","20","-pix_fmt","yuv420p","-c:a","aac","-b:a","192k","-movflags","+faststart","steady_hands_final.mp4"]
subprocess.run(cmd,check=True); print("T",T,"chunks",len(chunks),"tot",tot)
