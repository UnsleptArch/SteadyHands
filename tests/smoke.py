"""Smoke test: uv run --with playwright python tests/smoke.py --url http://localhost:8405/"""
import argparse, sys, time, pathlib
from playwright.sync_api import sync_playwright

DRILLS = ["incision", "suture", "lap"]
ART = pathlib.Path(__file__).parent / "artifacts"
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist", "--enable-gpu-rasterization"]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8405/")
    ap.add_argument("--timeout", type=float, default=90, help="seconds per drill for bot to score")
    a = ap.parse_args()
    ART.mkdir(exist_ok=True)
    errors, results = [], {}
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        pg = b.new_page(viewport={"width": 1280, "height": 720})
        pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        pg.on("requestfailed", lambda r: errors.append(f"requestfailed: {r.url}"))
        try:
            pg.goto(a.url, wait_until="load", timeout=30000)
            pg.wait_for_function("window.game && window.game.ready", timeout=30000)
            pg.screenshot(path=str(ART / "00_title.png"))
            load = "PASS"
        except Exception as e:
            load = f"FAIL {str(e).splitlines()[0]}"
        results["load"] = load
        if load == "PASS":
            for d in DRILLS:
                try:
                    pg.evaluate(f"window.game.start('{d}')")
                    pg.wait_for_timeout(1000)
                    pg.screenshot(path=str(ART / f"{d}_1_start.png"))
                    pg.evaluate(f"window.game.bot('{d}')")
                    t0, scored, shot = time.time(), False, False
                    while time.time() - t0 < a.timeout:
                        pg.wait_for_timeout(1000)
                        st = pg.evaluate("window.game.state()") or {}
                        if not shot and time.time() - t0 > 4:
                            pg.screenshot(path=str(ART / f"{d}_2_mid.png")); shot = True
                        m = st.get("metrics") or {}
                        if st.get("scored") or st.get("grade") or m.get("score") is not None or st.get("done"):
                            scored = True; break
                    pg.wait_for_timeout(800)
                    pg.screenshot(path=str(ART / f"{d}_3_end.png"))
                    results[d] = "PASS" if scored else f"FAIL no score in {a.timeout:.0f}s state={pg.evaluate('window.game.state()')}"
                except Exception as e:
                    results[d] = f"FAIL {str(e).splitlines()[0]}"
                    try: pg.screenshot(path=str(ART / f"{d}_err.png"))
                    except Exception: pass
        b.close()
    print("\n| step | result |\n|---|---|")
    for k, v in results.items(): print(f"| {k} | {v} |")
    print(f"| console/page errors | {'PASS' if not errors else 'FAIL (%d)' % len(errors)} |")
    for e in dict.fromkeys(errors): print("  ", e)
    ok = not errors and all(v == "PASS" for v in results.values())
    print("OVERALL", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)

main()
