# CORE smoke test: serves nothing itself; expects http.server on PORT (default 8401).
import sys, json
from playwright.sync_api import sync_playwright
PORT = sys.argv[1] if len(sys.argv) > 1 else "8401"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/sh_shot"
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    pg = b.new_page(viewport={"width": 1280, "height": 800})
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.goto(f"http://localhost:{PORT}/")
    pg.wait_for_function("window.game && window.game.ready", timeout=30000)
    pg.screenshot(path=f"{OUT}_menu.png")
    for lid in ["incision", "suture", "lap"]:
        print(lid, "start", json.dumps(pg.evaluate(f"window.game.start('{lid}')"))[:200])
        pg.mouse.move(640, 420); pg.mouse.down(); pg.mouse.move(700, 430, steps=10); pg.mouse.up()
        pg.wait_for_timeout(500)
        pg.screenshot(path=f"{OUT}_{lid}.png")
        try:
            r = pg.evaluate(f"Promise.race([window.game.bot('{lid}'), new Promise(r=>setTimeout(()=>r('TIMEOUT'),150000))])")
            print(lid, "bot", json.dumps(r)[:300])
        except Exception as e:
            print(lid, "bot EXC", e)
        pg.screenshot(path=f"{OUT}_{lid}_done.png")
        pg.evaluate("window.game.menu()")
    b.close()
real = [e for e in errs if "404" not in e and "Failed to load resource" not in e]
print("console errors:", len(real)); [print("  ", e[:300]) for e in real]
print("(404s ignored:", len(errs) - len(real), ")")
