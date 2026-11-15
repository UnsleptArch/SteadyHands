import subprocess
FF=open("takes/ff.txt").read().strip()
st="FontName=Inter,FontSize=17,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&HA0000000,BorderStyle=4,Outline=1,Shadow=0,MarginV=8,Alignment=2"
vf=f"subtitles=subs.srt:fontsdir=/usr/share/fonts/TTF:force_style=\x27{st}\x27"
subprocess.run([FF,"-v","error","-y","-i","steady_hands_final.mp4","-vf",vf,"-c:v","libx264","-preset","veryfast","-crf","20","-pix_fmt","yuv420p","-c:a","copy","-movflags","+faststart","steady_hands_final_subs.mp4"],check=True)
subprocess.run([FF,"-v","error","-y","-ss","20","-i","steady_hands_final_subs.mp4","-frames:v","1","sub_check.png"],check=True)
