"""Steady Hands demo bot: plays levels with REAL mouse/keyboard input (Playwright page.mouse / page.keyboard).

How it knows where to go: each level already plans an expert trajectory (its autoplay script). We run that planner
but intercept engine.setBotPointer/setBotDown at runtime (page.evaluate, no game-code change), so the engine never
receives bot input. Instead every planned world point is projected through the live camera onto the canvas and
replayed here as genuine OS-level mouse events; the level reacts to the real pointer exactly as for a human.
Motion is human-like: long hops are eased Bezier glides with a small overshoot + micro-correction, strokes follow
the planned path frame by frame, and SHIFT (steady hand) is held only while the button is down.
"""
import math
import random
import time

HOOK_JS = r"""
(() => {
  const g = window.game, E = g.engine;
  if (E.__demo) return true;
  const q = []; let planeY = 0, down = false;
  const wp = E.setWorkPlane.bind(E), ll = E.loadLevel.bind(E);
  E.setWorkPlane = (y) => { planeY = y; return wp(y); };
  E.loadLevel = (...a) => { planeY = 0; return ll(...a); };
  E.setBotPointer = (v) => {
    if (!v) return;
    const p = { x: v.x, z: v.z }, last = q[q.length - 1];
    if (!down && last && last[0] === 'm') last[1] = p; else q.push(['m', p]);
  };
  E.setBotDown = (b) => { const d = !!b; if (d !== down) { down = d; q.push([d ? 'd' : 'u']); } };
  let frames = 0; const tick = () => { frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  E.__demo = {
    frames: () => [frames, performance.now()],
    drain() {
      const r = E.renderer.domElement.getBoundingClientRect(), out = [];
      E.camera.updateMatrixWorld();
      for (const o of q.splice(0)) {
        if (o[0] !== 'm') { out.push([o[0]]); continue; }
        const v = new E.THREE.Vector3(o[1].x, planeY, o[1].z).project(E.camera);
        out.push(['m', r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]);
      }
      return out;
    },
  };
  return true;
})()
"""


class DemoBot:
    def __init__(self, page, steady=True, seed=7, verbose=False):
        self.verbose = verbose
        self.pg = page
        self.x, self.y = 960.0, 600.0
        self.down = False
        self._t_down = 0.0
        self.steady = steady
        self.rnd = random.Random(seed)

    # ------------------------------------------------------------ low-level human motion
    def _mv(self, x, y):
        self.x, self.y = x, y
        self.pg.mouse.move(x, y)

    def glide(self, tx, ty, speed=1700.0, overshoot=True):
        """Eased, slightly curved hop with a tiny overshoot and correction (no teleports)."""
        x0, y0 = self.x, self.y
        dx, dy = tx - x0, ty - y0
        d = math.hypot(dx, dy)
        if d < 2:
            self._mv(tx, ty)
            return
        T = min(0.85, max(0.16, 0.12 + d / speed))
        bend = self.rnd.uniform(-0.12, 0.12) * d
        nx, ny = -dy / d, dx / d
        cx, cy = x0 + dx * 0.5 + nx * bend, y0 + dy * 0.5 + ny * bend
        os_ = min(9.0, d * 0.035) if overshoot and d > 60 else 0.0
        ex, ey = tx + dx / d * os_, ty + dy / d * os_
        t0 = time.perf_counter()
        while True:  # time-based, so a slow frame never stretches the hop
            u = min(1.0, (time.perf_counter() - t0) / T)
            e = u * u * u * (u * (u * 6 - 15) + 10)  # smootherstep
            a, b, c = (1 - e) ** 2, 2 * (1 - e) * e, e * e
            self._mv(a * x0 + b * cx + c * ex, a * y0 + b * cy + c * ey)
            if u >= 1:
                break
            time.sleep(0.008)
        if os_:
            for k in range(1, 5):  # micro-correction back onto the target
                w = k / 4
                self._mv(ex + (tx - ex) * w + self.rnd.uniform(-0.4, 0.4), ey + (ty - ey) * w + self.rnd.uniform(-0.4, 0.4))
                time.sleep(0.016)
            self._mv(tx, ty)

    @staticmethod
    def _pace(t0, target):
        dt = target - (time.perf_counter() - t0)
        if dt > 0:
            time.sleep(dt)

    def hover(self, x, y, secs=0.6):
        """Idle drift: small natural wander around a point."""
        self.glide(x, y)
        t_end = time.time() + secs
        while time.time() < t_end:
            self._mv(x + self.rnd.uniform(-1.2, 1.2), y + self.rnd.uniform(-1.0, 1.0))
            time.sleep(0.05)
        self._mv(x, y)

    def click_el(self, locator, dwell=0.25):
        locator.scroll_into_view_if_needed(timeout=3000)
        bb = locator.bounding_box()
        x = bb["x"] + bb["width"] * self.rnd.uniform(0.42, 0.58)
        y = bb["y"] + bb["height"] * self.rnd.uniform(0.42, 0.58)
        self.glide(x, y)
        time.sleep(dwell)
        self.pg.mouse.down()
        time.sleep(0.09)
        self.pg.mouse.up()

    # ------------------------------------------------------------ level play
    def install(self):
        self.pg.evaluate(HOOK_JS)

    def _press(self, on):
        if on == self.down:
            return
        self.down = on
        if not on:  # a click must last a few frames or the game loop never sees the button down
            held = time.perf_counter() - self._t_down
            if held < 0.09:
                time.sleep(0.09 - held)
        else:
            self._t_down = time.perf_counter()
        if on:
            if self.steady:
                self.pg.keyboard.down("Shift")
            self.pg.mouse.down()
        else:
            self.pg.mouse.up()
            if self.steady:
                self.pg.keyboard.up("Shift")

    def play_current(self, timeout=240):
        """Run the current level's expert planner and replay it with real input until scored."""
        self.install()
        # CORE free camera: make sure the level's own camera is in effect (projections use the live camera anyway)
        self.pg.evaluate("() => { const c = window.game.camera; if (c && typeof c.reset === 'function') try { c.reset(); } catch (e) {} }")
        self.pg.evaluate("""() => { window.__demoDone = false;
          const c = window.game.engine.currentLevel && window.game.engine.currentLevel.controller;
          Promise.resolve(c && c.autoplay ? c.autoplay() : null).catch(e => console.error(e))
            .finally(() => { window.__demoDone = true; }); }""")
        f0 = self.pg.evaluate("window.game.engine.__demo.frames()")
        t0 = time.time()
        done = False
        t_log = t0
        while time.time() - t0 < timeout:
            ops, done, st = self.pg.evaluate(
                "[window.game.engine.__demo.drain(), window.__demoDone, window.game.state()]")
            # while pressed, thin dense stroke points (keep >= 5 px spacing + the last one) so input never lags
            thin, last_xy = [], (self.x, self.y)
            for k, op in enumerate(ops):
                if op[0] == "m" and k + 1 < len(ops) and ops[k + 1][0] == "m" \
                        and math.hypot(op[1] - last_xy[0], op[2] - last_xy[1]) < 5:
                    continue
                if op[0] == "m":
                    last_xy = (op[1], op[2])
                thin.append(op)
            for op in thin:
                if op[0] == "m":
                    x, y = op[1], op[2]
                    if not self.down and math.hypot(x - self.x, y - self.y) > 30:
                        self.glide(x, y)
                    else:
                        self._mv(x, y)
                elif op[0] == "d":
                    self._press(True)
                else:
                    self._press(False)
            if self.verbose and time.time() - t_log > 5:
                t_log = time.time()
                print(f"   t={t_log - t0:5.1f}s pct={st.get('progress')} hint={str(st.get('hint'))[:70]!r}", flush=True)
            if st and (st.get("grade") or st.get("error")) and done:
                break
            if done and time.time() - t0 > 2 and not ops:
                # planner finished; give scoring a moment
                for _ in range(40):
                    st = self.pg.evaluate("window.game.state()")
                    if st.get("grade"):
                        break
                    time.sleep(0.1)
                break
            time.sleep(0.004)
        self._press(False)
        st = self.pg.evaluate("window.game.state()") or {}
        f1 = self.pg.evaluate("window.game.engine.__demo.frames()")
        fps = round((f1[0] - f0[0]) / max(1e-3, (f1[1] - f0[1]) / 1000), 1)
        g = st.get("grade") or {}
        return {"letter": g.get("letter") if isinstance(g, dict) else g,
                "overall": g.get("overall") if isinstance(g, dict) else None,
                "metrics": st.get("metrics"), "secs": round(time.time() - t0, 1), "fps": fps, "error": st.get("error")}
