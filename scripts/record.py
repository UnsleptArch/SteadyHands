"""uv run --with playwright --with imageio-ffmpeg python scripts/record.py out.mp4 [--url URL]"""
import argparse, pathlib, shutil, subprocess, tempfile, time
from playwright.sync_api import sync_playwright
import imageio_ffmpeg

ARGS = ["--use-gl=angle", "--enable-gpu-rasterization", "--ignore-gpu-blocklist",
        "--enable-unsafe-swiftshader", "--hide-scrollbars"]

def wait_score(pg, timeout=90):
    t0 = time.time()
    while time.time() - t0 < timeout:
        pg.wait_for_timeout(500)
        st = pg.evaluate("window.game.state()") or {}
        m = st.get("metrics") or {}
        if st.get("scored") or st.get("grade") or st.get("done") or m.get("score") is not None:
            return True
    return False

def clickish(pg, text):
    try: pg.get_by_text(text, exact=False).first.click(timeout=1500)
    except Exception: pass

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out"); ap.add_argument("--url", default="http://localhost:8405/")
    a = ap.parse_args()
    tmp = pathlib.Path(tempfile.mkdtemp())
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        ctx = b.new_context(viewport={"width": 1920, "height": 1080},
                            record_video_dir=str(tmp), record_video_size={"width": 1920, "height": 1080})
        pg = ctx.new_page()
        t_start = time.time()
        pg.goto(a.url, wait_until="load")
        pg.wait_for_function("window.game && window.game.ready", timeout=60000)
        t_ready = time.time() - t_start   # lead-in to trim
        pg.wait_for_timeout(3000)                      # title screen
        clickish(pg, "How to play"); pg.wait_for_timeout(4000)   # mechanics panel
        pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
        for d in ["incision", "suture", "lap"]:
            pg.evaluate(f"window.game.start('{d}')"); pg.wait_for_timeout(2500)
            pg.evaluate(f"window.game.bot('{d}')")
            ok = wait_score(pg)
            print(d, "scored" if ok else "NO SCORE")
            pg.wait_for_timeout(5000)                  # results card
        try: pg.evaluate("window.game.menu()")
        except Exception: pass
        pg.wait_for_timeout(3000)                      # close on title
        vid = pg.video; ctx.close(); path = vid.path(); b.close()
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    trim = max(0.0, t_ready - 0.3)
    subprocess.run([ff, "-y", "-ss", f"{trim:.2f}", "-i", str(path), "-r", "30", "-c:v", "libx264",
                    "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                    a.out], check=True, capture_output=True)
    r = subprocess.run([ff, "-i", a.out], capture_output=True, text=True).stderr
    dur = [l.strip() for l in r.splitlines() if "Duration" in l]
    print(dur[0] if dur else "", f"| size {pathlib.Path(a.out).stat().st_size/1e6:.1f} MB | trimmed {trim:.1f}s lead-in")
    shutil.rmtree(tmp, ignore_errors=True)

main()
