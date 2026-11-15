# CORE free-camera test: API, keys, right-drag, raycast consistency after camera moves. GPU=egl on linux3.
import sys, os, json
from playwright.sync_api import sync_playwright
PORT = sys.argv[1] if len(sys.argv) > 1 else "8501"; OUT = sys.argv[2] if len(sys.argv) > 2 else "out/cam"
errs = []
CHECK = """(() => { const e = window.game.engine; const s = e.toScreen(e.input.worldRaw); return [s.x, s.y]; })()"""
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist", "--enable-gpu"])
    pg = b.new_page(viewport={"width": 1600, "height": 900}); pg.set_default_timeout(60000)
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.goto(f"http://localhost:{PORT}/"); pg.wait_for_function("window.game && window.game.ready")
    for lid in ["incision", "appendectomy"]:
        pg.evaluate(f"window.game.start('{lid}')"); pg.wait_for_timeout(800)
        pg.screenshot(path=f"{OUT}_{lid}_0.png")
        pg.evaluate("window.game.camera.orbitTo({yaw:0.6, pitch:0.25, dist:20}, 1.2)"); pg.wait_for_timeout(1800)
        print(lid, "after orbitTo", pg.evaluate("window.game.camera.get()"))
        pg.screenshot(path=f"{OUT}_{lid}_wide.png")
        pg.mouse.move(900, 500); pg.wait_for_timeout(300)
        print(lid, "raycast screen", pg.evaluate(CHECK), "mouse (900,500)")
        pg.evaluate("window.game.camera.reset(true)"); pg.wait_for_timeout(300)
        # keys
        pg.keyboard.down("KeyW"); pg.keyboard.down("KeyQ"); pg.wait_for_timeout(600); pg.keyboard.up("KeyW"); pg.keyboard.up("KeyQ")
        pg.wait_for_timeout(400); print(lid, "after W+Q", pg.evaluate("window.game.camera.get()"))
        # right-drag + wheel while held
        pg.mouse.move(800, 450); pg.mouse.down(button="right"); pg.mouse.move(1000, 380, steps=8)
        pg.mouse.wheel(0, 300); pg.wait_for_timeout(100); pg.mouse.up(button="right")
        pg.wait_for_timeout(500); print(lid, "after drag+wheel", pg.evaluate("window.game.camera.get()"))
        pg.mouse.move(700, 600); pg.wait_for_timeout(300)
        print(lid, "raycast screen", pg.evaluate(CHECK), "mouse (700,600)")
        pg.screenshot(path=f"{OUT}_{lid}_moved.png")
        pg.keyboard.press("KeyC"); pg.wait_for_timeout(800); print(lid, "after C", pg.evaluate("window.game.camera.get()"))
        pg.evaluate("window.game.menu()")
    b.close()
real = [e for e in errs if "Failed to load resource" not in e]
print("console errors:", len(real)); [print("  ", e[:300]) for e in real]
