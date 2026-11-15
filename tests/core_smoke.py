# CORE smoke test. Needs `python3 -m http.server PORT` at repo root.
# usage: uv run --with playwright python tests/core_smoke.py [PORT] [OUT_PREFIX]   (BOTS=1 also runs window.game.bot per level)
import sys, os, json
from playwright.sync_api import sync_playwright
PORT = sys.argv[1] if len(sys.argv) > 1 else "8401"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/sh_shot"
IDS = os.environ.get("IDS", "incision,suture,lap,appendectomy,laceration").split(",")
errs = []
cur = ["boot"]
with sync_playwright() as p:
    gpu = ["--use-angle=vulkan", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-features=Vulkan"]
    sw = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    b = p.chromium.launch(args=gpu if os.environ.get("GPU") else sw)
    pg = b.new_page(viewport={"width": int(os.environ.get("W", 1280)), "height": int(os.environ.get("H", 720))})
    pg.set_default_timeout(90000)
    pg.on("console", lambda m: m.type == "error" and errs.append(f"[{cur[0]}] " + m.text))
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.goto(f"http://localhost:{PORT}/")
    pg.wait_for_function("window.game && window.game.ready", timeout=60000)
    pg.screenshot(path=f"{OUT}_menu.png")
    cur[0] = "menu"
    pg.click("[data-act=how]"); pg.wait_for_timeout(400)
    pg.screenshot(path=f"{OUT}_how.png", full_page=True)
    pg.evaluate("window.game.menu()")
    for lid in IDS:
        cur[0] = lid
        st = pg.evaluate(f"window.game.start('{lid}')")
        stub = pg.evaluate(f"!!(window.game.engine.currentLevel && window.game.engine.currentLevel.module.stub)")
        print(f"{lid}: started level={st['level']} stub={stub} error={st.get('error')}")
        pg.mouse.move(640, 380); pg.mouse.down(); pg.mouse.move(700, 390, steps=5); pg.mouse.up()
        pg.wait_for_timeout(1500)
        pg.screenshot(path=f"{OUT}_{lid}.png")
        if os.environ.get("BOTS"):
            r = pg.evaluate(f"Promise.race([window.game.bot('{lid}'), new Promise(r=>setTimeout(()=>r('TIMEOUT'),240000))])")
            print(f"{lid}: bot ->", json.dumps(r)[:300])
            pg.screenshot(path=f"{OUT}_{lid}_done.png")
        pg.evaluate("window.game.menu()")
    b.close()
real = [e for e in errs if "Failed to load resource" not in e]
print("console errors:", len(real)); [print("  ", e[:300]) for e in real]
sys.exit(1 if real else 0)
