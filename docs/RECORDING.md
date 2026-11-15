# Recording the demo (RECBOT)

The demo video shows **real gameplay**: `scripts/demo_bot.py` drives the game only through Playwright
`page.mouse` / `page.keyboard` (OS-level input events). No game code is changed.

## How the bot knows where to go
Each level already contains an expert planner (its `autoplay()` script). At runtime the bot replaces
`engine.setBotPointer/setBotDown` (via `page.evaluate`) with a queue, so the engine never gets bot input. Each
planned world point is projected through the **live camera** onto the canvas (on the current work plane) and replayed
as real mouse moves; button presses become `mouse.down/up`, with SHIFT (steady hand) held while the button is down.
Human-looking motion: hops between targets are eased, slightly curved Bezier glides with a small overshoot and
micro-correction; strokes follow the planned path frame by frame. Menus are clicked the same way (glide + click).

## Visible cursor
Headless Chromium draws no OS cursor, so `?democursor=1` loads `src/ui/cursor.js` (a crosshair that turns red
while pressed). `record_demo.py` adds the param automatically.

## Run (on linux3, folder ~/sh-rec, port 8530)
```
rsync -az --delete --exclude .git --exclude tests/artifacts ./ unslept@linux3:sh-rec/
ssh -n unslept@linux3 'cd ~/sh-rec && (setsid nohup python3 -m http.server 8530 >/dev/null 2>&1 &)'
ssh -n unslept@linux3 'cd ~/sh-rec && uv run --no-project --with playwright --with imageio-ffmpeg python scripts/record_demo.py demo.mp4'
```
Options: `--only <id>` (single level), `--levels a,b,c`, `--results-secs 4`, `--no-video` (dry run, grades only),
`--url`. Chromium flags: `--use-gl=angle --use-angle=gl-egl --ignore-gpu-blocklist --enable-gpu` (shadows on).
Storyboard: title -> How to play -> incision -> suture -> lap -> appendectomy -> [cholecystectomy, central_line,
chest_tube when not placeholders] -> title. Page load is trimmed; output is H.264 30 fps; duration + grades printed.

## Final video pipeline (what was actually used, 2026-11-15)
Everything ran on linux3 in `~/sh-final`. The scripts are copied into `video/`.
1. **Takes:** `scripts/record_demo.py takes/<id>.mp4 --only <id>`, one per level (Vulkan + `?safe=1&democursor=1`, 1080p60). The laceration bot stalled and was left out.
2. **Voiceover:** phone recording, pulled over adb, then `ffmpeg -vn -ac 1` and transcribed with faster-whisper small.en (word timestamps, `video/tr.py`).
3. **`video/build.py`:** cuts retakes and spoken section names using the word times (`SEG`), adds 0.28 s gaps, then highpass, noise reduction, compressor, `atempo` (1.19×, to fit 3:00) and loudnorm to -16 LUFS. Writes `vo_final.wav` and `vo_meta.json` (section start times).
4. **`video/vbuild.py`:** fills each section with gameplay chunks inside a bordered frame, adds green JetBrains Mono section titles in the GT/Core Dumped style, a vignette and grain, an end card, and Masked Dedede quiet under the voice (not committed, for copyright).
5. **`video/subs.py`:** writes the SRT from the word timings, mapped through the cuts and tempo, with mishearings corrected to the script. **`video/burn.py`** burns it in with libass.
6. The Dr. Ozer name card and photo were drawn on with `drawbox`/`drawtext` plus an overlay (inline command; the photo itself is not committed).
