import json, wave, numpy as np
from faster_whisper import WhisperModel
w=wave.open("vo16.wav"); a=np.frombuffer(w.readframes(w.getnframes()),np.int16).astype(np.float32)/32768
m=WhisperModel("small.en",device="cpu",compute_type="int8",cpu_threads=16)
segs,_=m.transcribe(a,word_timestamps=True,vad_filter=False,beam_size=1)
words=[]
for s in segs:
    for x in s.words: words.append([round(x.start,2),round(x.end,2),x.word.strip()])
json.dump(words,open("vo_words.json","w"))
print(len(words))
