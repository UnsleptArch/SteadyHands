# PLAYTEST-SURGERIES: simulates a clumsy first-time human (real mouse/keyboard via Playwright) finishing each surgery.
# usage: python tests/playtest_surgeries.py [surgery ids comma list] [attempts]   env: PORT=8542 OUT=pt_out
# Only uses on-screen info a person has: banner text, visible dots/rings (read from the scene), the teal pointer marker.
import sys, os, json, math, random, time
from playwright.sync_api import sync_playwright

PORT = os.environ.get("PORT", "8542")
OUT = os.environ.get("OUT", "pt_out"); os.makedirs(OUT, exist_ok=True)
IDS = (sys.argv[1] if len(sys.argv) > 1 else "laceration,appendectomy").split(",")
ATTEMPTS = int(sys.argv[2]) if len(sys.argv) > 2 else 3
STEP_TIMEOUT = 75.0
BRIDGE_IDS = os.environ.get('BRIDGE', 'cholecystectomy,central_line,chest_tube').split(',')

SCAN = """() => {
 const e=game.engine; const out=[]; const g=e.scene.children.find(c=>c.name&&c.name.startsWith('surgery-')); if(!g) return null;
 const vis=o=>{for(let p=o;p;p=p.parent){if(!p.visible)return false;}return true;};
 g.traverse(o=>{ if(!o.isMesh||!vis(o)) return; const t=o.geometry&&o.geometry.type; const gp=o.geometry&&o.geometry.parameters||{};
   const v=o.getWorldPosition(new o.position.constructor());
   if(t==='CircleGeometry'||t==='RingGeometry') out.push({t:t[0],r:gp.radius||gp.innerRadius,c:o.material.color.getHexString(),x:v.x,y:v.y,z:v.z,op:o.material.opacity});
   else if(t==='BoxGeometry'&&gp.width===2&&gp.depth===0.7) out.push({t:'B',r:0,c:'dress',x:v.x,y:v.y,z:v.z,op:1});
   else if(t==='BufferGeometry'&&o.geometry.attributes.position.array.length===3600){const a=o.geometry.attributes.position.array,n=o.geometry.drawRange.count; const pts=[]; for(let i=0;i+17<n*3&&i+17<a.length;i+=18){pts.push([(a[i]+a[i+3]+a[i+6]+a[i+9]+a[i+12]+a[i+15])/6,(a[i+2]+a[i+5]+a[i+8]+a[i+11]+a[i+14]+a[i+17])/6]);} out.push({t:'G',pts:pts,y:v.y});}
 });
 return out;}"""
INSTALL = """() => { window.__log=[]; const L=(k,d)=>window.__log.push(Object.assign({k:k,t:performance.now()/1000},d));
 const root=document.querySelector('.sgb'); if(!root) return 'nobanner';
 new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes){ if(n.classList&&n.classList.contains('sgb-t')) L('toast',{kind:n.className.replace('sgb-t ',''),text:n.textContent}); }}).observe(root,{subtree:true,childList:true});
 setInterval(()=>{ const q=s=>{const e=root.querySelector(s);return e?e.textContent:null}; const b=root.querySelector('[data-k=bar]');
   L('vit',{hr:+(q('[data-k=hr]')||'0').replace(/\\D/g,''),stab:b?parseInt(b.style.width):null,step:q('.sgb-pill'),title:q('.sgb-title'),instr:q('.sgb-instr'),score:q('.sgb-score b'),sum:!!root.querySelector('.sgb-sum')}); },200);
 let f=0; const tick=()=>{f++;requestAnimationFrame(tick)}; requestAnimationFrame(tick); setInterval(()=>{L('fps',{fps:f});f=0},1000);
 return 'ok'; }"""
STATE = """() => { const e=game.engine, i=e.input; const c=e.camera; return {w:[i.world.x,i.world.y,i.world.z], down:i.pointer.down}; }"""
PROJ = """(a) => { const e=game.engine, c=e.camera, V=c.position.constructor; const r=document.querySelector('canvas').getBoundingClientRect();
  const v=new V(a[0],a[1],a[2]).project(c); return [r.left+(v.x+1)/2*r.width, r.top+(1-v.y)/2*r.height]; }"""


class Human:
    def __init__(s, pg, rng, noise_px, speed):
        s.pg, s.rng, s.noise, s.speed = pg, rng, noise_px, speed
        s.mx, s.my = 640.0, 400.0
        s.down = False
        s.ph = [rng.uniform(0, 6.3) for _ in range(4)]
        s.t0 = time.time()
        s.stats = {"moves": 0}

    def wob(s):
        t = time.time() - s.t0
        a = s.noise * 0.8
        return (a * (math.sin(t * 5.3 + s.ph[0]) + 0.6 * math.sin(t * 11.1 + s.ph[1])),
                a * (math.sin(t * 4.7 + s.ph[2]) + 0.6 * math.sin(t * 9.3 + s.ph[3])))

    def _mv(s, x, y):
        wx, wy = s.wob()
        s.pg.mouse.move(x + wx, y + wy); s.mx, s.my = x, y

    def pause(s, a=0.12, b=0.3):  # reaction delay, hand keeps wobbling
        t_end = time.time() + s.rng.uniform(a, b)
        while time.time() < t_end:
            s._mv(s.mx, s.my); time.sleep(0.016)

    def move_px(s, tx, ty, dur=None, overshoot=True):
        sx, sy = s.mx, s.my; d = math.hypot(tx - sx, ty - sy)
        if dur is None: dur = (0.22 + d / 900.0) * s.speed * s.rng.uniform(0.85, 1.25)
        if overshoot and d > 120 and s.rng.random() < 0.55:
            k = s.rng.uniform(1.04, 1.1); ox, oy = sx + (tx - sx) * k, sy + (ty - sy) * k
            s._seg(sx, sy, ox, oy, dur * 0.8); s.pause(0.05, 0.15); s._seg(ox, oy, tx, ty, dur * 0.35)
        else:
            s._seg(sx, sy, tx, ty, dur)
        s.stats["moves"] += 1

    def _seg(s, x0, y0, x1, y1, dur):
        n = max(2, int(dur / 0.016)); t_start = time.time()
        for i in range(1, n + 1):
            u = i / n; e = u * u * (3 - 2 * u)
            s._mv(x0 + (x1 - x0) * e, y0 + (y1 - y0) * e)
            rem = t_start + dur * u - time.time()
            if rem > 0: time.sleep(rem)

    def w2s(s, x, z, y=None):
        if y is None: y = s.pg.evaluate(STATE)["w"][1]
        return s.pg.evaluate(PROJ, [x, y, z])

    def world(s):
        return s.pg.evaluate(STATE)["w"]

    def goto(s, x, z, y=None, fine=True, tol=0.03):
        """Move marker to world (x,z): aim by eye, then look at the teal marker and correct once or twice."""
        px, py = s.w2s(x, z, y)
        ax, ay = s.rng.gauss(0, s.noise * 0.6), s.rng.gauss(0, s.noise * 0.6)
        s.move_px(px + ax, py + ay)
        if fine:
            for _ in range(1 if s.rng.random() < 0.7 else 2):
                s.pause(0.15, 0.35)
                w = s.world()
                err = math.hypot(w[0] - x, w[2] - z)
                if err < tol: break
                cx, cy = s.w2s(w[0], w[2], w[1]); tx, ty = s.w2s(x, z, w[1])
                s.move_px(s.mx + (tx - cx), s.my + (ty - cy), dur=0.18 * s.speed, overshoot=False)

    def press(s):
        s.pg.mouse.down(); s.down = True
    def release(s):
        s.pg.mouse.up(); s.down = False

    def drag_world(s, pts, y=None, speed=1.0, tol_noise=True):
        """follow list of world (x,z) points while button held (already down)."""
        for (x, z) in pts:
            px, py = s.w2s(x, z, y)
            d = math.hypot(px - s.mx, py - s.my)
            s._seg(s.mx, s.my, px + s.rng.gauss(0, s.noise * 0.25), py + s.rng.gauss(0, s.noise * 0.25), max(0.03, d / (500.0 * speed / s.speed)))


def banner(pg):
    return pg.evaluate("() => { const r=document.querySelector('.sgb'); if(!r) return null; const q=s=>{const e=r.querySelector(s);return e?e.textContent:''}; return {pill:q('.sgb-pill'),title:q('.sgb-title'),instr:q('.sgb-instr'),score:q('.sgb-score b'),sum:!!r.querySelector('.sgb-sum')}; }")


def scan(pg): return pg.evaluate(SCAN) or []
def pick(items, t=None, c=None, r=None, tolr=0.004):
    o = []
    for i in items:
        if t and i["t"] != t: continue
        if c and i["c"] != c: continue
        if r is not None and abs(i.get("r", 0) - r) > tolr: continue
        o.append(i)
    return o


# ---------------------------------------------------------------- generic step actor driven by controller.targets()
TARGETS = "() => { const c=game.engine.currentLevel&&game.engine.currentLevel.controller; return c&&c.targets?c.targets():null; }"


def tg(pg): return pg.evaluate(TARGETS)


def dwell(H, sec):
    t_end = time.time() + sec
    while time.time() < t_end: H._mv(H.mx, H.my); time.sleep(0.016)


def act(H, pg, rng, T, use_shift):
    L = [t["label"] for t in T["targets"]]
    if not L: return False
    P = lambda t: (t["p"]["x"], t["p"]["z"])
    f = L[0]
    if f == "rub":
        xs = [t["p"]["x"] for t in T["targets"]]; zs = [t["p"]["z"] for t in T["targets"]]
        x0, x1, z0, z1 = min(xs) - 0.05, max(xs) + 0.05, min(zs) - 0.05, max(zs) + 0.05
        H.goto(x0, z0, fine=False); H.press(); H.pause(0.05, 0.1)
        rows = max(3, int((z1 - z0) / 0.17) + 1)
        for r in range(rows):
            z = z0 + (z1 - z0) * r / max(1, rows - 1); xa, xb = (x0, x1) if r % 2 == 0 else (x1, x0)
            H.drag_world([(xa, z), (xb, z + rng.uniform(-0.04, 0.04))], speed=1.3)
        H.release(); H.pause(0.3, 0.6)
    elif f == "press-and-hold":
        t = min(T["targets"], key=lambda q: q["p"]["x"]); hs = t.get("holdSec", 1.0)
        H.goto(*P(t)); H.press()
        early = rng.random() < 0.12
        dwell(H, 0.45 if early else hs + rng.uniform(0.15, 0.45)); H.release(); H.pause(0.3, 0.6)
    elif f.endswith("-press") and "stitch" in f:
        a, b = T["targets"][0], T["targets"][1]
        H.goto(*P(a)); H.press(); H.pause(0.08, 0.2)
        sloppy = rng.random() < 0.15
        H.drag_world([((P(a)[0] + P(b)[0]) / 2, (P(a)[1] + P(b)[1]) / 2), (P(b)[0] + (0.12 if sloppy else 0), P(b)[1])], speed=0.9); H.pause(0.08, 0.2)
        w = H.world()
        if not sloppy and math.hypot(w[0] - P(b)[0], w[2] - P(b)[1]) > 0.05:
            cx, cy = H.w2s(w[0], w[2], w[1]); tx, ty = H.w2s(*P(b), w[1]); H._seg(H.mx, H.my, H.mx + tx - cx, H.my + ty - cy, 0.2)
        H.release(); H.pause(0.5, 0.9)
    elif f == "drag-from":
        a, b = T["targets"][0], T["targets"][1]
        H.goto(*P(a), fine=False); H.press(); H.pause(0.1, 0.25); H.drag_world([P(b)], speed=0.8); H.pause(0.15, 0.3); H.release(); H.pause(0.8, 1.2)
    elif f == "press-start":
        pts = [P(t) for t in T["targets"][1:]]
        H.goto(*P(T["targets"][0]))
        H.press(); H.pause(0.08, 0.18)
        ex = (pts[-1][0] + (pts[-1][0] - pts[-2][0]) * 0.5, pts[-1][1] + (pts[-1][1] - pts[-2][1]) * 0.5) if len(pts) > 1 else pts[-1]
        if rng.random() < 0.4 and len(pts) > 6:  # drifts off the line for a moment (warning zone)
            k = rng.randint(2, len(pts) - 3); n = H.noise
            H.drag_world(pts[:k], speed=0.5); H.drag_world([(pts[k][0], pts[k][1] + rng.choice([-1, 1]) * 0.07)], speed=0.5); pts = pts[k:]
        H.drag_world(pts + [ex], speed=0.55 * rng.uniform(0.8, 1.3)); H.pause(0.05, 0.1); H.release(); H.pause(0.7, 1.0)
    elif f.startswith("handle") and f.endswith("-grab"):
        a, b = T["targets"][0], T["targets"][1]
        H.goto(*P(a)); H.press(); H.pause(0.1, 0.2)
        fr = rng.choice([0.9, 1.0, 1.0, 1.05, 1.2]); ax, az = P(a); bx, bz = P(b)
        H.drag_world([(ax + (bx - ax) * 0.5, az + (bz - az) * 0.5), (ax + (bx - ax) * fr, az + (bz - az) * fr)], speed=0.7)
        H.pause(0.1, 0.25); H.release(); H.pause(0.6, 1.0)
    elif f.startswith("click"):
        if rng.random() < 0.1: H.goto(P(T["targets"][0])[0] + 0.12, P(T["targets"][0])[1], fine=False); H.press(); time.sleep(0.1); H.release(); H.pause(0.4, 0.7)
        H.goto(*P(T["targets"][0])); H.pause(0.1, 0.25); H.press(); time.sleep(rng.uniform(0.07, 0.15)); H.release(); H.pause(0.5, 0.9)
    elif f == "hand-press-and-hold":
        t = T["targets"][0]; hx, hz = P(t)
        # first-timer: mirrored controls -> goes the wrong way first, notices, corrects
        H.goto(hx + rng.choice([-1, 1]) * 0.5, hz + rng.choice([-1, 1]) * 0.3, fine=False); H.pause(0.5, 1.0)
        H.goto(hx, hz); H.pause(0.2, 0.4); H.press(); dwell(H, t.get("holdSec", 0.8) + 0.7); H.release(); H.pause(0.8, 1.2)
    else:
        print("  UNKNOWN target label", f, flush=True); return False
    return True



# ---------------------------------------------------------------- bridge: follow the game's own reference ("autoplay") pointer path with a human hand
# The reference bot's ideal pointer trajectory is intercepted (it no longer drives the game) and a noisy, lagging human
# hand reproduces it through REAL mouse events. Proves the step is solvable by pointer alone; tremor stays at human level.
BRIDGE = """() => { const e=game.engine; window.__want={p:null,down:false};
 e.setBotPointer=v=>{ window.__want.p=v?[v.x,v.y,v.z]:null; }; e.setBotDown=b=>{ window.__want.down=!!b; };
 Object.defineProperty(e,'tremorScale',{get:()=>1,set:()=>{},configurable:true});
 const c=e.currentLevel.controller; window.__botdone=false; c.autoplay().then(()=>{window.__botdone=true;}); return 'ok'; }"""


def follow(H, pg, secs, stop_cond, lag=0.15):
    from collections import deque
    q = deque(); t_end = time.time() + secs; last_poll = 0
    while time.time() < t_end:
        w = pg.evaluate("window.__want")
        q.append((time.time(), w))
        while len(q) > 1 and q[1][0] <= time.time() - lag: q.popleft()
        w = q[0][1]
        if w["p"]:
            px, py = pg.evaluate(PROJ, w["p"])
            H._mv(px, py)
        if bool(w["down"]) != H.down:
            H.press() if w["down"] else H.release()
        time.sleep(0.012)
        if stop_cond(): return True
    return False


# ---------------------------------------------------------------- central_line with REAL clicks / wheel / keys (bridge cannot test these)
FIND_CL = """() => { const e=game.engine; const g=e.scene.children.find(c=>c.name&&c.name.startsWith('surgery-')); let probe=null, band=null;
  g.traverse(o=>{ if(o.rotation&&o.rotation.order==='YZX'&&o.isGroup&&!probe) probe=o; if(o.isMesh&&o.geometry.type==='PlaneGeometry'&&o.geometry.parameters.width===0.14&&o.geometry.parameters.height===0.62) band=o; });
  const wp=o=>o.getWorldPosition(new o.position.constructor()).toArray(); return {probe:wp(probe), band:wp(band)}; }"""
TXT = "(k) => { const e=document.querySelector('.cvl-us [data-k='+k+']'); return e?e.textContent:''; }"
VEIN_PX = """() => { const c=document.querySelector('.cvl-us canvas'); const x=c.getContext('2d'); const W=c.width,H=c.height; const d=x.getImageData(0,0,W,H).data;
  const dark=new Uint8Array(W*H); for(let i=0;i<W*H;i++){ dark[i]=(d[i*4]+d[i*4+1]+d[i*4+2])/3<22?1:0; }
  const seen=new Uint8Array(W*H); const blobs=[];
  for(let y=0;y<H;y+=2)for(let xx=0;xx<W;xx+=2){ const i=y*W+xx; if(!dark[i]||seen[i]) continue; let st=[i],n=0,sx=0,sy=0; seen[i]=1;
    while(st.length){ const j=st.pop(); n++; sx+=j%W; sy+=(j/W|0); for(const k of [j+1,j-1,j+W,j-W]){ if(k>=0&&k<W*H&&dark[k]&&!seen[k]){seen[k]=1;st.push(k);} } }
    if(n>400) blobs.push({n:n,x:sx/n,y:sy/n}); }
  blobs.sort((a,b)=>b.n-a.n); const r=c.getBoundingClientRect(); return {blobs:blobs.slice(0,4), rect:[r.left,r.top,r.width,r.height,W,H]}; }"""


def cl_wait_step(pg, n, secs=20):
    t0 = time.time()
    while time.time() - t0 < secs:
        b = banner(pg)
        if b and b["pill"].startswith(f"{n}/") and not b["sum"]: return True
        pg.wait_for_timeout(150)
    return False


def cl_step_is(pg, n):
    b = banner(pg); return bool(b) and b["pill"].startswith(f"{n}/")


def num(txt):
    import re
    m = re.search(r"-?\d+(\.\d+)?", txt or ""); return float(m.group()) if m else None


def play_cl(H, pg, rng, rec, sid, attempt):
    step_t = {}
    def mark(n): step_t[n] = time.time()
    # step 1 -------------------------------------------------
    cl_wait_step(pg, 1); pg.wait_for_timeout(int(rng.uniform(2500, 4000))); mark(1)
    for i in range(4):  # tick checklist in order with real clicks
        bb = pg.evaluate("(i)=>{const b=document.querySelectorAll('.cvl-ck button')[i].getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]}", i)
        H.move_px(bb[0] + rng.uniform(-30, 30), bb[1] + rng.uniform(-6, 6)); H.pause(0.15, 0.3); H.press(); time.sleep(0.09); H.release(); H.pause(0.3, 0.6)
    pg.wait_for_timeout(1000)
    o = pg.evaluate(FIND_CL)
    H.goto(o["probe"][0], o["probe"][2], y=o["probe"][1], fine=False); H.press(); H.pause(0.1, 0.2)
    H.drag_world([(o["band"][0], o["band"][2])], y=o["probe"][1], speed=0.8); H.pause(0.15, 0.3); H.release(); H.pause(0.3, 0.5)
    for _ in range(40):  # scroll to rotate until label reads within +-10 deg
        tag = pg.evaluate(TXT, "tag"); d = num(tag.replace("Probe", "")) if "Probe" in tag else None
        if d is not None and abs(d) <= 7: break
        pg.mouse.wheel(0, -100 if (d is None or d > 0) else 100); pg.wait_for_timeout(120)
    pg.wait_for_timeout(1500)
    # step 2 -------------------------------------------------
    if not cl_wait_step(pg, 2, 8): return "step1 did not complete (probe on band + 0 deg). tag=" + pg.evaluate(TXT, "tag") + " instr=" + banner(pg)["instr"]
    mark(2); pg.wait_for_timeout(int(rng.uniform(2500, 4000)))
    H.pause(0.2, 0.4); H.press(); dwell(H, 1.5); H.release(); H.pause(0.3, 0.6)
    v = pg.evaluate(VEIN_PX)
    if not v["blobs"]: return "no dark vessel blobs found in ultrasound canvas"
    big = v["blobs"][0]  # vein = larger oval
    L, T, Wd, Ht, cw, ch = v["rect"]
    H.move_px(L + big["x"] / cw * Wd, T + big["y"] / ch * Ht); H.pause(0.2, 0.4); H.press(); time.sleep(0.08); H.release()
    pg.wait_for_timeout(1500)
    # step 3 -------------------------------------------------
    if not cl_wait_step(pg, 3, 8): return "step2 not completed after clicking the largest dark oval: blobs=%s banner=%s" % (v["blobs"], banner(pg)["instr"])
    mark(3); pg.wait_for_timeout(int(rng.uniform(2500, 4000)))
    o = pg.evaluate(FIND_CL)
    H.goto(o["probe"][0] - 0.13, o["band"][2] + 0.06, y=o["probe"][1], fine=True)
    for _ in range(30):
        ang = num(pg.evaluate(TXT, "ang").replace("NEEDLE", "")) if "NEEDLE" in pg.evaluate(TXT, "ang") else None
        if ang is None or abs(ang - 45) <= 6: break
        pg.mouse.wheel(0, -100 if ang < 45 else 100); pg.wait_for_timeout(100)
    H.pause(0.3, 0.6); H.press(); t0 = time.time(); key = None; last_tag = ""; flips = 0
    while time.time() - t0 < 45 and cl_step_is(pg, 3):
        tag = pg.evaluate(TXT, "tag")
        print("   needle:", pg.evaluate(TXT, "ang"), tag, flush=True)
        if "out of plane" in tag or "Aim" in tag and False:
            key = key or "d"
            pg.keyboard.down(key.upper()); dwell(H, 0.25); pg.keyboard.up(key.upper()); H.pause(0.15, 0.3)
            tag2 = pg.evaluate(TXT, "tag")
            if "out of plane" in tag2: flips += 1; key = "a" if key == "d" else "d"
        else: dwell(H, 0.2)
        if (banner(pg)["instr"] or "").startswith("Withdraw"):
            H.release(); pg.keyboard.down("Space"); dwell(H, 1.5); pg.keyboard.up("Space"); H.press()
    H.release(); pg.wait_for_timeout(1500)
    # step 4 -------------------------------------------------
    if not cl_wait_step(pg, 4, 8): return "step3 (needle) not completed in 45 s; tag=%s instr=%s" % (pg.evaluate(TXT, "tag"), banner(pg)["instr"])
    mark(4); pg.wait_for_timeout(int(rng.uniform(2500, 4000)))
    pg.keyboard.down("Shift"); H.press(); H.pause(0.2, 0.3)
    w0 = H.world(); z = w0[2]; pressed_e = False; t0 = time.time()
    while time.time() - t0 < 40 and cl_step_is(pg, 4):
        g = num(pg.evaluate(TXT, "gval")) or 0
        if g >= 10 and not pressed_e: pg.keyboard.press("e"); pressed_e = True; dwell(H, 1.0); continue
        if g < 14: z += 0.02
        elif g > 17.5: z -= 0.01
        px, py = H.w2s(w0[0], z, w0[1]); H._seg(H.mx, H.my, px, py, 0.18)
        dwell(H, 0.05)
    H.release(); pg.keyboard.up("Shift"); pg.wait_for_timeout(1500)
    # step 5 -------------------------------------------------
    if not cl_wait_step(pg, 5, 8): return "step4 (guidewire) not completed; gauge=%s instr=%s" % (pg.evaluate(TXT, "gval"), banner(pg)["instr"])
    mark(5); pg.wait_for_timeout(int(rng.uniform(2500, 4000)))
    w0 = H.world(); H.press(); z = w0[2]
    for _ in range(40):
        g = num(pg.evaluate(TXT, "gval")) or 0
        if g >= 17: break
        z += 0.03; px, py = H.w2s(w0[0], z, w0[1]); H._seg(H.mx, H.my, px, py, 0.15)
    H.release(); H.pause(0.4, 0.7)
    for _ in range(60):
        g = num(pg.evaluate(TXT, "gval")) or 0
        if 14.8 <= g <= 16.5: break
        pg.mouse.wheel(0, -300 if g < 14.8 else 100); pg.wait_for_timeout(110)
    H.pause(0.3, 0.5); H.press(); time.sleep(0.08); H.release(); H.pause(0.5, 0.8)
    w0 = H.world(); H.press(); z = w0[2]
    for _ in range(100):  # keep dragging up (wire clamps at 0 cm) until the flush button appears
        if pg.evaluate("()=>{const b=document.querySelector('.cvl-us [data-k=btn]');return !!(b&&b.offsetParent)}"): break
        z -= 0.02; px, py = H.w2s(w0[0], z, w0[1]); H._seg(H.mx, max(20, py), px, max(20, py), 0.12) if False else H._seg(H.mx, H.my, px, py, 0.12)
        if py < 40: z = w0[2]; H.release(); H.pause(0.2, 0.3); H.goto(w0[0], w0[2], fine=False); H.press()
    H.release(); H.pause(0.5, 0.8)
    bb = pg.evaluate("()=>{const b=document.querySelector('.cvl-us [data-k=btn]'); if(!b||!b.offsetParent) return null; const r=b.getBoundingClientRect(); return [r.left+r.width/2,r.top+r.height/2,r.bottom]}")
    if not bb: return "flush button not shown after wire out. instr=" + banner(pg)["instr"]
    pg.screenshot(path=f"{OUT}/{sid}_a{attempt+1}_s5_flush.png")
    if bb[2] > 720: rec.setdefault("notes", []).append(f"flush button bottom at y={bb[2]:.0f} > viewport 720 (clipped)")
    H.move_px(bb[0], min(bb[1], 712)); H.pause(0.2, 0.3); H.press(); time.sleep(0.08); H.release()
    return None

def play(pg, sid, attempt, seed, results):
    rng = random.Random(seed)
    noise = rng.uniform(3, 6); speed = rng.uniform(1.2, 2.0)
    use_shift = attempt >= 1
    print(f"\n=== {sid} attempt {attempt+1} seed={seed} noise={noise:.1f}px speed={speed:.2f} shift={use_shift}")
    pg.evaluate("window.game.menu()"); pg.wait_for_timeout(500)
    pg.click(f"button.sh-card.surg[data-id={sid}]")
    pg.wait_for_selector(".sgb", timeout=30000)
    print(" install:", pg.evaluate(INSTALL))
    pg.mouse.move(640, 420)
    H = Human(pg, rng, noise, speed)
    pg.wait_for_timeout(2600)  # intro
    rec = {"surgery": sid, "attempt": attempt + 1, "noise_px": round(noise, 1), "speed": round(speed, 2), "shift": use_shift, "steps": [], "softlock": None}
    t_start = time.time()
    nsteps = int(banner(pg)["pill"].split("/")[1])
    if sid == "central_line" and os.environ.get("REAL_CL", "1") == "1":
        err = play_cl(H, pg, rng, rec, sid, attempt)
        if err: rec["softlock"] = err; pg.screenshot(path=f"{OUT}/{sid}_a{attempt+1}_SOFTLOCK.png"); print("  CL stop:", err, flush=True)
        nsteps = 0
    elif sid in BRIDGE_IDS:
        print("  bridge mode (follow reference pointer path), steps:", nsteps, flush=True)
        pg.evaluate(BRIDGE)
        res_up = lambda: pg.evaluate("() => !!document.querySelector('.sh-panel.results') && !document.querySelector('.sh-panel.results').closest('.hidden')")
        last_pill, last_t = None, time.time()
        def stop():
            nonlocal last_pill, last_t
            b = banner(pg)
            pill = b["pill"] if b else "gone"
            if pill != last_pill:
                if last_pill is not None:
                    rec["steps"].append({"i": last_pill, "title": last_title[0], "sec": round(time.time() - last_t, 1)})
                    pg.screenshot(path=f"{OUT}/{sid}_a{attempt+1}_s{last_pill.split('/')[0]}_end.png")
                last_pill, last_t = pill, time.time(); last_title[0] = b["title"] if b else ""
                pg.screenshot(path=f"{OUT}/{sid}_a{attempt+1}_s{pill.split('/')[0]}_start.png")
            if time.time() - last_t > STEP_TIMEOUT:
                rec["softlock"] = f"step {pill} '{b['title'] if b else ''}' stuck >{STEP_TIMEOUT:.0f}s; banner='{b['instr'] if b else ''}'"
                pg.screenshot(path=f"{OUT}/{sid}_a{attempt+1}_SOFTLOCK.png"); return True
            return res_up()
        last_title = [""]
        follow(H, pg, 420, stop)
        if last_pill: rec["steps"].append({"i": last_pill, "title": last_title[0], "sec": round(time.time() - last_t, 1)})
        nsteps = 0
    for si in range(nsteps):
        t0 = time.time()
        while time.time() - t0 < 15:
            b = banner(pg)
            if b and b["pill"].startswith(f"{si+1}/"): break
            pg.wait_for_timeout(100)
        b = banner(pg)
        pg.wait_for_timeout(int(rng.uniform(2500, 4500)))  # camera tween + a person reads the banner
        pg.screenshot(path=f"{OUT}/{sid}_a{attempt+1}_s{si+1}_start.png")
        st = {"i": si + 1, "title": b["title"] if b else None, "instr": b["instr"] if b else None, "tries": 0}
        ts = time.time(); adv = False
        while time.time() - ts < STEP_TIMEOUT:
            T = tg(pg)
            b2 = banner(pg)
            if not b2 or not b2["pill"].startswith(f"{si+1}/") or b2["sum"]: adv = True; break
            if not T or not T["targets"] or T["step"] != si + 1 or not T["ready"]: pg.wait_for_timeout(250); continue
            st["tries"] += 1
            sh = use_shift and T["targets"][0]["label"] in ("press-start", "press-and-hold") or (use_shift and "stitch" in T["targets"][0]["label"])
            if sh: pg.keyboard.down("Shift")
            try: ok = act(H, pg, rng, T, use_shift)
            finally:
                if sh: pg.keyboard.up("Shift")
            if not ok: break
            pg.wait_for_timeout(400)
        st["sec"] = round(time.time() - ts, 1)
        b2 = banner(pg)
        pg.screenshot(path=f"{OUT}/{sid}_a{attempt+1}_s{si+1}_end.png")
        rec["steps"].append(st)
        if not adv and si + 1 < nsteps:
            rec["softlock"] = f"step {si+1} ({st['title']}) not completed after {st['sec']}s; banner='{b2['instr'] if b2 else None}'"
            pg.screenshot(path=f"{OUT}/{sid}_a{attempt+1}_SOFTLOCK.png"); break
    # wait for results card
    t0 = time.time()
    res = None
    while time.time() - t0 < 14:
        res = pg.evaluate("() => { const r=document.querySelector('.sh-panel.results'); if(!r||r.closest('.hidden')) return null; return {letter:r.querySelector('.big').textContent, overall:r.querySelector('.l').textContent, metrics:r.querySelector('.sh-table').innerText, grade:[...r.querySelectorAll('.sh-grow')].map(x=>x.innerText.replace(/\\n/g,' '))}; }")
        if res: break
        pg.wait_for_timeout(300)
    rec["wall_sec"] = round(time.time() - t_start, 1)
    rec["result"] = res
    if res: pg.screenshot(path=f"{OUT}/{sid}_a{attempt+1}_results.png")
    log = pg.evaluate("window.__log || []")
    toasts = [l for l in log if l["k"] == "toast"]
    vit = [l for l in log if l["k"] == "vit"]
    fp = [l["fps"] for l in log if l["k"] == "fps"]
    rec["fps_avg"] = round(sum(fp) / max(1, len(fp)), 1); rec["fps_min"] = min(fp) if fp else None
    rec["toasts"] = [(round(l["t"], 1), l["kind"], l["text"]) for l in toasts]
    if vit:
        hrs = [v["hr"] for v in vit if v["hr"]]; stabs = [v["stab"] for v in vit if v["stab"] is not None]
        rec["hr_max"] = max(hrs); rec["hr_min"] = min(hrs); rec["stab_min"] = min(stabs)
        rec["hr_series"] = [(round(v["t"], 1), v["hr"], v["stab"]) for v in vit][::5]
    results.append(rec)
    print(json.dumps({k: v for k, v in rec.items() if k not in ("hr_series", "toasts")}, indent=1))
    print(" warn toasts:", [t[2] for t in rec["toasts"] if t[1] == "warn"])
    return rec


def main():
    results = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-angle=vulkan", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-features=Vulkan"] if os.environ.get("GL", "vk") == "vk" else ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist", "--enable-gpu"])
        pg = b.new_page(viewport={"width": 1280, "height": 720})
        pg.set_default_timeout(60000)
        errs = []
        pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" and "Failed to load" not in m.text else None)
        pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)[:200]))
        pg.goto(f"http://localhost:{PORT}/?safe=1"); pg.wait_for_function("window.game && window.game.ready", timeout=60000)
        for sid in IDS:
            for a in range(ATTEMPTS):
                try: play(pg, sid, a, 1000 + 17 * a + len(sid), results)
                except Exception as e:
                    print("EXC", sid, a, repr(e)[:300]); pg.screenshot(path=f"{OUT}/{sid}_a{a+1}_EXC.png")
        print("console errors:", errs[:10])
        b.close()
    json.dump(results, open(f"{OUT}/results.json", "w"), indent=1)


main()
