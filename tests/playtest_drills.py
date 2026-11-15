"""Human-like playtest of the three drills with REAL mouse input.
Run on linux3: python tests/playtest_drills.py [--url http://localhost:8541/] [--attempts 3] [--only incision,suture,lap]
Simulated player: correlated Gaussian pointer noise (3-6 px), speed variation, reaction delay, overshoot,
occasional early release, occasional SHIFT. Closed-loop recovery (a human re-presses where the cut/needle stopped).
"""
import argparse, json, math, random, sys, time, pathlib
from playwright.sync_api import sync_playwright

ART = pathlib.Path(__file__).parent / "artifacts" / "playtest"
ARGS = ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist", "--enable-gpu"]

PROJ_JS = """
(a) => { const e = window.game.engine, V = e.camera.position.constructor;
  const r = e.renderer.domElement.getBoundingClientRect();
  return a.map(([x,y,z]) => { const v = new V(x,y,z).project(e.camera);
    return [r.left + (v.x+1)/2*r.width, r.top + (1-v.y)/2*r.height, v.z]; }); }
"""


class Sim:
    def __init__(self, page, rng, sigma):
        self.p, self.r, self.sigma = page, rng, sigma
        self.x = self.y = 0.0
        self.nx = self.ny = 0.0   # AR(1) noise state
        self.down = False
        self.shift = False
        self.framesync = False   # emulate a player on a machine where page frames, not wall-clock, pace the hand

    def noise(self):
        a = 0.6
        s = self.sigma * math.sqrt(1 - a * a)
        self.nx = a * self.nx + self.r.gauss(0, s)
        self.ny = a * self.ny + self.r.gauss(0, s)
        return self.nx, self.ny

    def put(self, x, y, noisy=True):
        nx, ny = self.noise() if noisy else (0, 0)
        self.p.mouse.move(x + nx, y + ny)

    def teleport(self, x, y):
        self.x, self.y = x, y
        self.p.mouse.move(x, y)

    def travel(self, pts, speed, vary=0.3, stop=None):
        """Move along pixel polyline pts at ~speed px/s with real-time stepping. stop() -> True aborts."""
        # arclength
        P = [(self.x, self.y)] + list(pts)
        seg = [math.dist(P[i], P[i + 1]) for i in range(len(P) - 1)]
        total = sum(seg)
        if total < 1: return
        s, t_prev = 0.0, time.time()
        ph = self.r.uniform(0, 6)
        k = 0
        while s < total:
            now = time.time(); dt = now - t_prev; t_prev = now
            if self.framesync:
                dt = min(0.1, self.p.evaluate("new Promise(r=>requestAnimationFrame(t=>{const d=t-(window.__lt||t);window.__lt=t;r(d/1000)}))"))
                dt = max(dt, 0.008)
            v = speed * (1 + vary * math.sin(ph + now * 1.7) + 0.15 * self.r.uniform(-1, 1))
            s = min(total, s + max(5, v) * dt)
            # locate
            acc = 0
            for i, L in enumerate(seg):
                if s <= acc + L or i == len(seg) - 1:
                    f = (s - acc) / L if L else 1
                    x = P[i][0] + (P[i + 1][0] - P[i][0]) * f
                    y = P[i][1] + (P[i + 1][1] - P[i][1]) * f
                    break
                acc += L
            self.x, self.y = x, y
            self.put(x, y)
            k += 1
            if stop and k % 3 == 0 and stop(): return
            if not self.framesync: time.sleep(0.012)

    def press(self):
        self.p.mouse.down(); self.down = True

    def release(self):
        self.p.mouse.up(); self.down = False

    def shift_on(self):
        if not self.shift: self.p.keyboard.down("Shift"); self.shift = True

    def shift_off(self):
        if self.shift: self.p.keyboard.up("Shift"); self.shift = False


def densify(pts, step=8):
    out = []
    for a, b in zip(pts, pts[1:]):
        n = max(1, int(math.dist(a, b) / step))
        for i in range(n): out.append((a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n))
    out.append(pts[-1]); return out


def proj(page, pts3):
    return [(a[0], a[1]) for a in page.evaluate(PROJ_JS, [list(p) for p in pts3])]


def state(page): return page.evaluate("window.game.state()")


def results_visible(page):
    return page.evaluate("""() => { const r = document.querySelector('.sh-results'); return !!r && !r.classList.contains('hidden'); }""")


def read_results(page):
    return page.evaluate("""() => { const r = document.querySelector('.sh-results');
      const t = r.querySelector('.sh-letter .big'), o = r.querySelector('.sh-letter .l');
      const rows = [...r.querySelectorAll('.sh-table tr')].map(x => x.innerText.replace(/\\s+/g,' ').trim());
      return { letter: t && t.innerText, overall: o && o.innerText, rows }; }""")


def hud_text(page):
    return page.evaluate("""() => ({ name: document.querySelector('#shName')?.innerText, obj: document.querySelector('#shObj')?.innerText,
      hint: document.querySelector('#shHint')?.innerText, pct: document.querySelector('#shPct')?.innerText })""")


def start_from_menu(page, did):
    """Real click on the title-screen card."""
    page.wait_for_selector(f".sh-card[data-id={did}]", state="visible", timeout=10000)
    page.click(f".sh-card[data-id={did}]")
    page.wait_for_function("window.game.engine.currentLevel && window.game.engine.currentLevel.id === '%s'" % did, timeout=15000)
    page.wait_for_timeout(1200)


def plane_y(page, w, h):
    page.mouse.move(w / 2, h / 2); page.wait_for_timeout(200)
    return page.evaluate("window.game.engine.input.worldRaw.y")


def px_per_mm(page, y, cx=0.0, cz=0.0):
    a, b = proj(page, [(cx, y, cz), (cx + 1.0, y, cz)])  # 1 unit = 1 cm
    return math.dist(a, b) / 10.0


# ------------------------------------------------------------------ drills
def play_incision(page, sim, rng, vp, log, tmax=60):
    y = plane_y(page, *vp)
    curve = []
    for i in range(0, 161, 4):
        x = -3.6 + 7.2 * i / 160
        curve.append((x, y, 0.95 * math.sin(x * 0.85) - 0.15 * math.sin(x * 2.1)))
    px = proj(page, curve)
    ppm = px_per_mm(page, y)
    log["px_per_mm"] = round(ppm, 2)
    dense = densify(px, 6)
    onscreen = all(0 <= p[0] <= vp[0] and 0 <= p[1] <= vp[1] for p in px)
    log["targets_onscreen"] = onscreen
    speed = rng.uniform(22, 38) * ppm            # mm/s a person tends to move
    early = rng.random() < 0.5
    use_shift = rng.random() < 0.5
    sim.teleport(vp[0] * 0.3, vp[1] * 0.8)
    time.sleep(rng.uniform(0.6, 1.4))            # reaction: read the instructions
    sim.travel([dense[0]], 500, vary=0.1)
    time.sleep(0.25)
    sim.press()
    t0 = time.time()
    cut_at = int(len(dense) * rng.uniform(0.6, 0.85)) if early else len(dense)
    if use_shift: sim.shift_on()
    stuck = None
    sim.travel(dense[1:cut_at], speed, stop=lambda: results_visible(page))
    if early and not results_visible(page):
        sim.release(); log.setdefault("events", []).append("released early at %d%%" % (100 * cut_at // len(dense)))
        time.sleep(rng.uniform(0.5, 1.2))
        sim.travel([dense[cut_at - 1]], 300, vary=0.1)
        sim.press()
        sim.travel(dense[cut_at:], speed, stop=lambda: results_visible(page))
    if not results_visible(page):
        # overshoot slightly past the end then settle
        e = dense[-1]; before = dense[-3]
        d = (e[0] - before[0], e[1] - before[1]); n = math.hypot(*d) or 1
        sim.travel([(e[0] + d[0] / n * 12, e[1] + d[1] / n * 12)], speed * 0.5)
    for _ in range(40):
        if results_visible(page): break
        time.sleep(0.1)
    sim.release(); sim.shift_off()
    if not results_visible(page):
        s = state(page)
        log["stuck"] = "no score after full path; hint=%r progress=%s metrics=%s" % (s.get("hint"), s.get("progress"), s.get("metrics"))
    return time.time() - t0


def play_suture(page, sim, rng, vp, log, tmax=120):
    y = plane_y(page, *vp)
    R = 0.6; PAIRS = [-2.1, -0.7, 0.7, 2.1]
    ppm = px_per_mm(page, y); log["px_per_mm"] = round(ppm, 2)
    entries = proj(page, [(-R, y, z) for z in PAIRS]); exits = proj(page, [(R, y, z) for z in PAIRS])
    log["targets_onscreen"] = all(0 <= p[0] <= vp[0] and 0 <= p[1] <= vp[1] for p in entries + exits)
    speed = rng.uniform(70, 110) * ppm / 3.0 * 3   # px/s ~ 7-11 cm/s... slow drive
    speed = rng.uniform(25, 45) * ppm
    sim.teleport(vp[0] * 0.2, vp[1] * 0.8)
    time.sleep(rng.uniform(0.6, 1.4))
    use_shift = rng.random() < 0.5
    t0 = time.time(); bites = 0; retries = 0
    for i, z in enumerate(PAIRS):
        for attempt in range(6):
            if results_visible(page): break
            cam_y = y
            c = (z,)
            # arc in world: centre = entry + R*DIR, tip at phi: c - R cos(phi) X - R sin(phi) Y
            arc3 = []
            for k in range(0, 65, 2):
                phi = math.pi * k / 64
                arc3.append((-R + R - R * math.cos(phi), y - R * math.sin(phi), z))
            arc = proj(page, arc3)
            start = arc[0]
            sim.travel([start], 450, vary=0.1)
            time.sleep(rng.uniform(0.15, 0.4))
            sim.press()
            if use_shift: sim.shift_on()
            rel_early = rng.random() < 0.12 and attempt == 0
            end_i = int(len(arc) * rng.uniform(0.5, 0.8)) if rel_early else len(arc)
            sim.travel(densify(arc[1:end_i], 6), speed, stop=lambda: False)
            if not rel_early:
                e = arc[-1]; sim.travel([(e[0] + 10, e[1])], speed * 0.5)
            if not rel_early:
                # a human keeps holding until the needle visibly exits (needle advances limited per frame)
                tw = time.time()
                while time.time() - tw < 1.2 and page.evaluate("window.game.engine.currentLevel.controller.metrics().bites") == bites:
                    time.sleep(0.05)
            sim.release(); sim.shift_off()
            time.sleep(0.9)  # pull-through animation
            st = page.evaluate("(() => { const c = window.game.engine.currentLevel.controller; return c.metrics(); })()") if not results_visible(page) else None
            if results_visible(page): break
            if st and st["bites"] > bites:
                bites = st["bites"]; break
            retries += 1; log.setdefault("events", []).append(f"bite {i+1} retry (attempt {attempt+1}) hint={state(page).get('hint')!r}")
        if results_visible(page): break
    for _ in range(40):
        if results_visible(page): break
        time.sleep(0.1)
    if not results_visible(page):
        s = state(page); log["stuck"] = "no score; bites=%d hint=%r metrics=%s" % (bites, s.get("hint"), s.get("metrics"))
    return time.time() - t0


def play_lap(page, sim, rng, vp, log, tmax=240):
    y = plane_y(page, *vp)
    log["plane_y"] = round(y, 2)
    LEFT = [(-7, -3.6), (-8.2, 0.4), (-7, 4.2)]; RIGHT = [(7, -3.6), (8.2, 0.4), (7, 4.2)]
    GATES = [(-2.5, 4.9), (2.5, -4.9)]
    hand = lambda t: (0 - (t[0] - 0) / 0.85, y, 0 - (t[1] - 0) / 0.85)
    ppm = px_per_mm(page, y); log["px_per_mm"] = round(ppm, 2)
    hands_px = proj(page, [hand(p) for p in LEFT + RIGHT])
    log["targets_onscreen"] = all(0 <= p[0] <= vp[0] and 0 <= p[1] <= vp[1] for p in hands_px)
    log["hand_px_range"] = [[round(min(p[i] for p in hands_px)), round(max(p[i] for p in hands_px))] for i in (0, 1)]
    # the 3D tip positions (scene) are what the player sees; check those are on screen too
    tips_px = proj(page, [(p[0], 2.6, p[1]) for p in LEFT + RIGHT])
    log["tips_onscreen"] = all(0 <= p[0] <= vp[0] and 0 <= p[1] <= vp[1] for p in tips_px)

    def route(a, b):
        lo, hi = min(a[0], b[0]), max(a[0], b[0])
        g = sorted([g for g in GATES if lo < g[0] < hi], key=lambda g: g[0] if a[0] < b[0] else -g[0])
        return g + [b]

    def tip_now():
        w = page.evaluate("(() => { const w = window.game.engine.input.world; return [w.x, w.z]; })()")
        return (-(w[0]) * 0.85, -(w[1]) * 0.85)

    speed = rng.uniform(80, 140) * ppm * 0.4 / 0.85 * 2.5
    speed = rng.uniform(50, 80) * ppm          # px/s of the mouse
    sim.teleport(vp[0] * 0.5, vp[1] * 0.5)
    time.sleep(rng.uniform(0.8, 1.6))
    use_shift = rng.random() < 0.4
    t0 = time.time(); cur = (0.0, 0.0)
    for i in range(3):
        if results_visible(page): break
        for attempt in range(5):
            L = LEFT[i]; Rr = RIGHT[i]
            if use_shift: sim.shift_on()
            seg = route(cur, L)
            wp = [proj(page, [hand(p)])[0] for p in seg]
            sim.travel(densify(wp, 10), speed)
            # closed-loop fine adjust: nudge the mouse until the tip is within grasp radius
            for _ in range(25):
                tx, tz = tip_now()
                ex, ez = L[0] - tx, L[1] - tz
                if math.hypot(ex, ez) < 0.35: break
                # tip moves opposite to hand and 0.85x: to move tip by (ex,ez) move hand by (-ex,-ez)/0.85
                hx, hz = proj(page, [(hand(L)[0], y, hand(L)[2])])[0]
                sim.travel([(hx, hz)], 120 * ppm / 5, vary=0.1)
            time.sleep(rng.uniform(0.2, 0.5))
            sim.press()
            time.sleep(0.25)
            carried = state(page)
            seg = route(L, Rr)
            wp = [proj(page, [hand(p)])[0] for p in seg]
            drop_early = rng.random() < 0.1 and attempt == 0
            if drop_early:
                sim.travel(densify(wp[:-1] or wp, 10), speed)
                sim.release(); log.setdefault("events", []).append(f"bead {i+1} released early (dropped)")
                time.sleep(0.6); break  # a dropped bead can't be recovered? checked below
            sim.travel(densify(wp, 10), speed)
            for _ in range(25):
                tx, tz = tip_now()
                if math.hypot(Rr[0] - tx, Rr[1] - tz) < 0.35: break
                hx, hz = proj(page, [(hand(Rr)[0], y, hand(Rr)[2])])[0]
                sim.travel([(hx, hz)], 120 * ppm / 5, vary=0.1)
            time.sleep(rng.uniform(0.2, 0.4))
            sim.release(); sim.shift_off()
            time.sleep(0.5)
            cur = Rr
            break
        if time.time() - t0 > tmax: break
    for _ in range(30):
        if results_visible(page): break
        time.sleep(0.1)
    if not results_visible(page):
        s = state(page); log["stuck"] = "no score; hint=%r metrics=%s" % (s.get("hint"), s.get("metrics"))
    return time.time() - t0


PLAY = {"incision": play_incision, "suture": play_suture, "lap": play_lap}


def check_pause_and_buttons(page, results, vp):
    out = {}
    start_from_menu(page, "incision")
    page.keyboard.press("Escape"); page.wait_for_timeout(300)
    out["esc_pause_shown"] = page.evaluate("!document.querySelector('.sh-pause').classList.contains('hidden')")
    out["engine_paused"] = page.evaluate("window.game.engine.paused")
    page.keyboard.press("Escape"); page.wait_for_timeout(300)
    out["esc_resume"] = page.evaluate("document.querySelector('.sh-pause').classList.contains('hidden') && !window.game.engine.paused")
    page.keyboard.press("p"); page.wait_for_timeout(300)
    out["p_pause_shown"] = page.evaluate("!document.querySelector('.sh-pause').classList.contains('hidden')")
    page.click(".sh-pause [data-a=resume]"); page.wait_for_timeout(300)
    out["resume_btn"] = page.evaluate("document.querySelector('.sh-pause').classList.contains('hidden') && !window.game.engine.paused")
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    page.click(".sh-pause [data-a=retry]"); page.wait_for_timeout(1500)
    out["pause_restart"] = page.evaluate("!document.querySelector('.sh-hud').classList.contains('hidden') && document.querySelector('.sh-pause').classList.contains('hidden') && !window.game.engine.paused")
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    page.click(".sh-pause [data-a=menu]"); page.wait_for_timeout(600)
    out["pause_menu"] = page.evaluate("!document.querySelector('.sh-title').classList.contains('hidden')")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8541/")
    ap.add_argument("--attempts", type=int, default=3)
    ap.add_argument("--only", default="incision,suture,lap")
    ap.add_argument("--framesync", action="store_true")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--w", type=int, default=1280); ap.add_argument("--h", type=int, default=720)
    a = ap.parse_args()
    ART.mkdir(parents=True, exist_ok=True)
    vp = (a.w, a.h)
    rng = random.Random(a.seed)
    summary = {}
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        pg = b.new_page(viewport={"width": a.w, "height": a.h})
        pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        pg.goto(a.url, wait_until="load", timeout=30000)
        pg.wait_for_function("window.game && window.game.ready", timeout=30000)
        pg.screenshot(path=str(ART / "title.png"))
        pg.click("[data-act=how]"); pg.wait_for_timeout(300)
        pg.screenshot(path=str(ART / "how.png"))
        summary["how_text"] = pg.evaluate("document.querySelector('.sh-how').innerText.slice(0,1500)")
        pg.click(".sh-how [data-act=back]"); pg.wait_for_timeout(300)
        for did in a.only.split(","):
            res = []
            for n in range(a.attempts):
                log = {"drill": did, "attempt": n + 1}
                try:
                    if not pg.evaluate("!document.querySelector('.sh-title').classList.contains('hidden')"):
                        pg.evaluate("window.game.menu()")
                        pg.wait_for_timeout(400)
                    start_from_menu(pg, did)
                    log["hud_start"] = hud_text(pg)
                    log["fps_idle"] = pg.evaluate("new Promise(r=>{let n=0,t=performance.now();(function f(){n++;performance.now()-t>1500?r(Math.round(n/1.5)):requestAnimationFrame(f)})()})")
                    pg.screenshot(path=str(ART / f"{did}_{n+1}_start.png"))
                    sigma = rng.uniform(3, 6)
                    sim = Sim(pg, rng, sigma); sim.framesync = a.framesync; log["sigma_px"] = round(sigma, 1)
                    t = PLAY[did](pg, sim, rng, vp, log)
                    log["play_time_s"] = round(t, 1)
                    pg.screenshot(path=str(ART / f"{did}_{n+1}_end.png"))
                    if results_visible(pg):
                        log["completed"] = True; log["results"] = read_results(pg)
                    else:
                        log["completed"] = False
                except Exception as e:
                    log["completed"] = False; log["framesync"] = a.framesync; log["exception"] = str(e).splitlines()[0]
                    try: pg.screenshot(path=str(ART / f"{did}_{n+1}_err.png"))
                    except Exception: pass
                    try: sim.release(); sim.shift_off()
                    except Exception: pass
                res.append(log)
                print(json.dumps(log, default=str), flush=True)
            summary[did] = res
        # buttons: last drill's results (if visible) -> Retry/Next/Menu
        try:
            btn = {}
            pg.evaluate("window.game.menu()"); pg.wait_for_timeout(300)
            start_from_menu(pg, "incision")
            pg.evaluate("window.game.bot('incision')")
            pg.wait_for_function("document.querySelector('.sh-results') && !document.querySelector('.sh-results').classList.contains('hidden')", timeout=90000)
            pg.click(".sh-results [data-a=retry]"); pg.wait_for_timeout(1200)
            btn["retry"] = pg.evaluate("window.game.engine.currentLevel.id")
            pg.evaluate("window.game.bot('incision')")
            pg.wait_for_function("document.querySelector('.sh-results') && !document.querySelector('.sh-results').classList.contains('hidden')", timeout=90000)
            pg.click(".sh-results [data-a=next]"); pg.wait_for_timeout(1500)
            btn["next"] = pg.evaluate("window.game.engine.currentLevel.id")
            pg.evaluate("window.game.bot('suture')")
            pg.wait_for_function("document.querySelector('.sh-results') && !document.querySelector('.sh-results').classList.contains('hidden')", timeout=120000)
            pg.click(".sh-results [data-a=menu]"); pg.wait_for_timeout(600)
            btn["menu_title_visible"] = pg.evaluate("!document.querySelector('.sh-title').classList.contains('hidden')")
            summary["buttons"] = btn
        except Exception as e:
            summary["buttons"] = {"error": str(e).splitlines()[0]}
        try:
            pg.evaluate("window.game.menu()"); pg.wait_for_timeout(300)
            summary["pause"] = check_pause_and_buttons(pg, None, vp)
        except Exception as e:
            summary["pause"] = {"error": str(e).splitlines()[0]}
        b.close()
    summary["errors"] = list(dict.fromkeys(errors))[:10]
    print("SUMMARY", json.dumps({k: v for k, v in summary.items() if k != "how_text"}, default=str, indent=1))
    (ART / "summary.json").write_text(json.dumps(summary, default=str, indent=1))


if __name__ == "__main__":
    main()
