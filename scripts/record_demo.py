"""Record the Steady Hands demo video with the real-input demo bot (scripts/demo_bot.py).

  uv run --no-project --with playwright --with imageio-ffmpeg python scripts/record_demo.py out.mp4 [--url URL]
        [--only incision] [--levels incision,suture,...] [--no-video]

Storyboard: title (2 s) -> How to play (4 s) -> drills incision/suture/lap (results 4 s each) -> appendectomy ->
[cholecystectomy, central_line, chest_tube if not placeholders] -> back to title. Page load is trimmed.
"""
import argparse
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from demo_bot import DemoBot  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

# linux3: the AMD iGPU (gl-egl, shadows on) renders surgeries at ~5 fps -> unusable for a real-time bot.
# Default = RTX via ANGLE/Vulkan with ?safe=1 (no shadow maps; 60 fps everywhere). --gpu egl for the shadowed look.
GPU = {"vk": ["--use-angle=vulkan", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-features=Vulkan"],
       "egl": ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist", "--enable-gpu"]}
DEFAULT = ["incision", "suture", "lap", "appendectomy", "cholecystectomy", "central_line", "chest_tube"]


def is_ready(pg, lid):
    return pg.evaluate("""async (id) => { try { const m = await window.game.engine.getLevelModule(id);
        if (!m) return false; const b = (m.default || m).brief || ''; return !/coming soon/i.test(b); }
        catch (e) { return false; } }""", lid)


def visible(pg, sel):
    return pg.locator(sel).locator("visible=true").first


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--url", default="http://localhost:8530/")
    ap.add_argument("--only")
    ap.add_argument("--levels")
    ap.add_argument("--results-secs", type=float, default=4.0)
    ap.add_argument("--no-video", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--gpu", choices=list(GPU), default="vk")
    a = ap.parse_args()
    levels = [a.only] if a.only else (a.levels.split(",") if a.levels else DEFAULT)
    url = a.url + ("&" if "?" in a.url else "?") + "democursor=1" + ("&safe=1" if a.gpu == "vk" else "")
    tmp = pathlib.Path(tempfile.mkdtemp())
    report = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=GPU[a.gpu] + ["--hide-scrollbars"])
        kw = {} if a.no_video else {"record_video_dir": str(tmp), "record_video_size": {"width": 1920, "height": 1080}}
        ctx = b.new_context(viewport={"width": 1920, "height": 1080}, **kw)
        pg = ctx.new_page()
        pg.on("console", lambda m: m.type == "error" and print("  [console]", m.text[:160]))
        t_start = time.time()
        pg.goto(url, wait_until="load")
        pg.wait_for_function("window.game && window.game.ready", timeout=60000)
        pg.wait_for_timeout(400)
        t_ready = time.time() - t_start
        bot = DemoBot(pg, verbose=a.verbose)
        bot.install()  # before any level setup, so work-plane changes are seen
        pg.mouse.move(bot.x, bot.y)
        full = not a.only
        if full:  # title + how to play
            bot.hover(760, 420, 0.8)
            bot.hover(1150, 470, 0.9)
            bot.click_el(visible(pg, "[data-act=how]"))
            pg.wait_for_timeout(300)
            bot.hover(700, 500, 1.6)
            bot.hover(1200, 640, 1.6)
            bot.click_el(visible(pg, "[data-act=back]"))
            pg.wait_for_timeout(700)
        for lid in levels:
            if not is_ready(pg, lid):
                print(f"{lid}: placeholder/not ready -> skipped")
                continue
            card = visible(pg, f".sh-card[data-id={lid}]")
            if card.count() == 0:
                print(f"{lid}: no card on title -> starting via API")
                pg.evaluate("(id) => window.game.start(id)", lid)
            else:
                bot.click_el(card)
            pg.wait_for_function("""(id) => { const L = window.game.engine.currentLevel;
                return L && L.id === id && L.controller; }""", arg=lid, timeout=30000)
            pg.wait_for_timeout(900)
            r = bot.play_current()
            r["id"] = lid
            report.append(r)
            print(f"{lid}: grade {r['letter']} ({r['overall']}) in {r['secs']} s  metrics={json.dumps(r['metrics'])[:220]}")
            pg.wait_for_timeout(int(a.results_secs * 1000))
            if full:
                btn = visible(pg, "[data-a=menu]")
                if btn.count():
                    bot.click_el(btn)
                else:
                    pg.evaluate("window.game.menu()")
                pg.wait_for_timeout(900)
        if full:
            bot.hover(960, 420, 1.5)
        vid = None if a.no_video else pg.video
        ctx.close()
        path = vid.path() if vid else None
        b.close()
    if path:
        import imageio_ffmpeg
        ff = imageio_ffmpeg.get_ffmpeg_exe()
        trim = max(0.0, t_ready - 0.2)
        subprocess.run([ff, "-y", "-ss", f"{trim:.2f}", "-i", str(path), "-r", "30", "-c:v", "libx264",
                        "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                        a.out], check=True, capture_output=True)
        r = subprocess.run([ff, "-i", a.out], capture_output=True, text=True).stderr
        dur = [ln.strip() for ln in r.splitlines() if "Duration" in ln]
        print(dur[0].split(",")[0] if dur else "", f"| size {pathlib.Path(a.out).stat().st_size / 1e6:.1f} MB"
              f" | trimmed {trim:.1f}s lead-in")
    print("GRADES:", ", ".join(f"{r['id']}={r['letter']}" for r in report))
    shutil.rmtree(tmp, ignore_errors=True)


main()
