// SURGERY — step machine, scoring/combos, OSATS grading, camera tweening, instruments, and reusable step mechanics
// (trace an incision guide, drag handles, ordered click targets, suture bites, hold-to-inject, wipe, drag & drop).
// World units follow ART: 1 unit = 10 cm, so 1 mm = 0.01 units.
import * as THREE from 'three';
import { Ribbon, makeDot, makeRing, polyline, closestOnPolyline, disposeGroup, runBot } from '../levels/_common.js';
import { createBanner } from './banner.js';
import { createVitals } from './vitals.js';

export const MM = 0.01;
const TEAL = 0x3ec5b5;
const TOOL_SCALE = { scalpel: 0.5, driver: 0.42, grasper: 0.8, syringe: 0.7 };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ grading
const ITEMS = [
  ['tissue', 'Respect for tissue', 'tissueErrors'],
  ['time_motion', 'Time and motion', 'timeSec'],
  ['instrument', 'Instrument handling', 'missedActions'],
  ['flow', 'Flow of operation', 'instabilityPct'],
  ['precision', 'Precision', 'meanPrecisionMm'],
];
const GRADES = [
  { min: 4.5, label: 'A', text: 'Expert-like control' },
  { min: 3.5, label: 'B', text: 'Proficient' },
  { min: 2.5, label: 'C', text: 'Competent, keep practicing' },
  { min: 1.5, label: 'D', text: 'Developing' },
  { min: 0, label: 'E', text: 'Novice: slow down and try again' },
];
export function gradeSurgery(m, parTime) {
  const rules = {
    tissue: [0, 1, 2, 4],
    time_motion: [parTime, parTime * 1.3, parTime * 1.7, parTime * 2.3],
    instrument: [0, 1, 3, 5],
    flow: [12, 22, 35, 50],
    precision: [2, 3, 4.5, 6],
  };
  const items = {}, detail = [];
  let sum = 0;
  for (const [id, name, metric] of ITEMS) {
    const v = m[metric], t = rules[id];
    const s = v <= t[0] ? 5 : v <= t[1] ? 4 : v <= t[2] ? 3 : v <= t[3] ? 2 : 1;
    items[name] = s; detail.push({ id, name, score: s, metric, value: v }); sum += s;
  }
  const overall = Math.round((sum / ITEMS.length) * 10) / 10;
  const g = GRADES.find((x) => overall >= x.min);
  return { items, overall, letter: g.label, text: g.text, detail };
}

// ------------------------------------------------------------------ instruments
function makeTool(art, name) {
  const f = { scalpel: 'makeScalpel', grasper: 'makeGrasper', driver: 'makeNeedleDriver', forceps: 'makeGrasper' }[name];
  let mesh = null;
  try { if (f && typeof art[f] === 'function') { const r = art[f](); mesh = r && (r.isObject3D ? r : r.mesh); } } catch (e) { console.warn('[surgery] tool', name, e); }
  if (!mesh && name === 'syringe') {
    mesh = new THREE.Group();
    const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.25, 6), new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 0.9, roughness: 0.2 }));
    needle.rotation.x = Math.PI / 2; needle.position.z = 0.125; mesh.add(needle);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.012, 0.06, 10), new THREE.MeshStandardMaterial({ color: 0x3ec5b5, roughness: 0.5 }));
    hub.rotation.x = Math.PI / 2; hub.position.z = 0.27; mesh.add(hub);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.6, 16), new THREE.MeshStandardMaterial({ color: 0xe8f1f6, transparent: true, opacity: 0.55, roughness: 0.15 }));
    barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.6; mesh.add(barrel);
    const fluid = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.4, 12), new THREE.MeshStandardMaterial({ color: 0x9fd4ff, roughness: 0.3 }));
    fluid.rotation.x = Math.PI / 2; fluid.position.z = 0.52; mesh.add(fluid);
    const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 16), new THREE.MeshStandardMaterial({ color: 0x1d2127 }));
    plunger.rotation.x = Math.PI / 2; plunger.position.z = 0.95; mesh.add(plunger);
  }
  if (!mesh) {
    mesh = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xc8d0d8, metalness: 0.85, roughness: 0.3 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 10), m);
    shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.8; mesh.add(shaft);
  }
  return mesh;
}

// ------------------------------------------------------------------ the surgery runner
/**
 * cfg: {id, engine, art, group, steps:[{title, instr, cam:{pos,target}, plane, tool, start(S)->mech}], wideCam, parTime,
 *       monitor, summary:{title, sub}}
 * mech: {update(ev, dt) -> true when done, frac() -> 0..1, bot(bot) async, tip?: Vector3 (tool tip override), toolYaw?, toolOpen?, dispose?()}
 */
export function createSurgery(cfg) {
  const { engine, art, group, steps, id } = cfg;
  const uiRoot = document.getElementById('ui') || document.body;
  const banner = createBanner(uiRoot);
  const vitals = createVitals({ banner, monitor: cfg.monitor });
  const cam = engine.camera;
  const camPos = cam.position.clone(), camTgt = new THREE.Vector3();
  const wantPos = V(...cfg.wideCam.pos), wantTgt = V(...cfg.wideCam.target);
  camPos.copy(wantPos).add(V(2, 3, 4)); camTgt.copy(wantTgt);

  // pointer marker (teal ring) + tools
  const marker = makeRing(0.035, 0.05, TEAL, 0, 0.9);
  marker.renderOrder = 10; marker.material.depthTest = false;
  group.add(marker);
  const tools = {};
  let tool = null, toolName = null;
  function setTool(name) {
    if (name === toolName) return;
    if (tool) tool.visible = false;
    toolName = name; tool = null;
    if (!name) return;
    if (!tools[name]) { tools[name] = makeTool(art, name); tools[name].rotation.order = 'YXZ'; tools[name].scale.multiplyScalar(TOOL_SCALE[name] || 1); group.add(tools[name]); }
    tool = tools[name]; tool.visible = true;
  }

  let lastReport = 0;
  const S = {
    engine, art, group, banner, vitals, MM,
    total: 0, time: 0, done: false,
    m: { tissueErrors: 0, missedActions: 0, retries: 0, precision: [], hesitations: 0 },
    combos: {},
    award(pts, label) {
      S.total += pts; banner.setScore(S.total);
      if (label) banner.praise(`${label} +${pts}`);
      vitals.good(0.01);
    },
    /** consecutive good actions of a kind -> "Perfect bite ×3" */
    comboHit(kind, label, base = 40) {
      const n = (S.combos[kind] = (S.combos[kind] || 0) + 1);
      if (n >= 2) { const pts = base * n; S.total += pts; banner.setScore(S.total); banner.combo(`${label} ×${n}  +${pts}`); }
      return n;
    },
    comboBreak(kind) { S.combos[kind] = 0; },
    error(sev, msg, kind = 'tissue') {
      if (kind === 'tissue') S.m.tissueErrors++; else S.m.missedActions++;
      const hot = vitals.error(sev);
      if (msg) banner.warn(msg);
      if (hot) setTimeout(() => { if (!S.done && !disposed) banner.warn('Patient HR rising — slow down'); }, 650);
      for (const k in S.combos) S.combos[k] = 0;
    },
    warn(msg) { banner.warn(msg); },
    info(msg) { banner.info(msg); },
    precision(mm) { S.m.precision.push(mm); },
    setInstr(s) { banner.setInstruction(s); },
  };

  let idx = -1, mech = null, introT = 1.6, transT = 0, prevDown = false, disposed = false, finishT = -1;
  const pending = new Set();
  const later = (fn, ms) => { const h = setTimeout(() => { pending.delete(h); if (!disposed) fn(); }, ms); pending.add(h); };
  const ev = { p: new THREE.Vector3(), down: false, pressed: false, released: false, input: null };
  banner.setStep(1, steps.length, 'Patient prepped', 'Patient is draped and anaesthetised. Stay steady, keep the vitals calm.');

  function enterStep(i) {
    idx = i;
    const st = steps[i];
    banner.setStep(i + 1, steps.length, st.title, st.instr);
    wantPos.set(...st.cam.pos); wantTgt.set(...st.cam.target);
    engine.setWorkPlane(st.plane);
    setTool(st.tool || null);
    mech = st.start(S);
  }

  function finish() {
    S.done = true; mech = null; setTool(null); marker.visible = false;
    wantPos.set(...cfg.wideCam.pos); wantTgt.set(...cfg.wideCam.target);
    vitals.calm();
    const v = vitals.state;
    const prec = S.m.precision.length ? S.m.precision.reduce((a, b) => a + b, 0) / S.m.precision.length : 0;
    const stabBonus = Math.round(v.minStability * 300);
    const timeBonus = Math.max(0, Math.round((cfg.parTime * 1.5 - S.time) * 5));
    S.total += stabBonus + timeBonus; banner.setScore(S.total);
    const metrics = {
      totalScore: S.total,
      timeSec: Math.round(S.time * 10) / 10,
      tissueErrors: S.m.tissueErrors,
      missedActions: S.m.missedActions,
      retries: S.m.retries,
      meanPrecisionMm: Math.round(prec * 10) / 10,
      instabilityPct: Math.round((1 - v.minStability) * 100),
      minStabilityPct: Math.round(v.minStability * 100),
      stepsCompleted: steps.length,
      accuracy: Math.max(0, Math.min(1, 1 - prec / 8)),
    };
    const grade = gradeSurgery(metrics, cfg.parTime);
    grade.totalScore = S.total;
    banner.praise(`Patient stability bonus +${stabBonus}`);
    if (timeBonus > 0) later(() => banner.praise(`Time bonus +${timeBonus}`), 500);
    later(() => banner.summary({ title: cfg.summary.title, sub: cfg.summary.sub, score: S.total, grade: grade.letter }), 1100);
    engine.emit('level:progress', { id, pct: 1, hint: cfg.summary.title, accuracy: metrics.accuracy });
    later(() => {
      controller._done = true;
      banner.clearSummary();
      banner.el.style.transition = 'opacity .4s'; banner.el.style.opacity = '0';
      engine.emit('level:score', { id, metrics, grade });
    }, 4200);
  }

  const controller = {
    _done: false,
    S,
    get stepIndex() { return idx; },
    get ready() { return !!mech && transT <= 0 && !S.done; },
    update(dt, input) {
      const k = 1 - Math.exp(-dt * 2.4);
      camPos.lerp(wantPos, k); camTgt.lerp(wantTgt, k);
      cam.position.copy(camPos); cam.lookAt(camTgt);
      vitals.update(dt);

      ev.input = input;
      ev.p.copy(input.world);
      ev.down = !!input.pointer.down;
      ev.pressed = ev.down && !prevDown; ev.released = !ev.down && prevDown;
      prevDown = ev.down;
      marker.position.set(ev.p.x, ev.p.y + 0.004, ev.p.z);

      if (S.done) return;
      if (introT > 0) { introT -= dt; if (introT <= 0) enterStep(0); return; }
      S.time += dt;
      if (transT > 0) { transT -= dt; if (transT <= 0) { if (idx + 1 < steps.length) enterStep(idx + 1); else finish(); } }
      else if (mech) {
        const done = mech.update(ev, dt);
        if (done) {
          if (mech.group && !mech.keep) mech.group.visible = false;
          S.award(100, `Step ${idx + 1} complete`);
          vitals.good(0.05);
          transT = 1.2;
        }
      }
      // instrument follows the tip
      if (tool) {
        const tip = (mech && mech.tip) || ev.p;
        tool.position.copy(tip);
        if (mech && mech.toolLook) tool.lookAt(mech.toolLook);
        else {
          const lift = ev.down ? 0 : 0.03;
          tool.position.y += lift;
          tool.rotation.set(-0.55, mech && mech.toolYaw !== undefined ? mech.toolYaw : 0.75, 0);
        }
        if (tool.setOpen) tool.setOpen(mech && mech.toolOpen !== undefined ? mech.toolOpen : (ev.down ? 0 : 0.5));
      }
      marker.visible = !(mech && mech.hideMarker);
      const now = performance.now();
      if (now - lastReport > 200) {
        lastReport = now;
        const frac = mech ? Math.max(0, Math.min(1, mech.frac())) : 0;
        engine.emit('level:progress', { id, pct: Math.min(0.99, (idx + (transT > 0 ? 1 : frac)) / steps.length), hint: steps[idx] ? steps[idx].instr : '' });
      }
    },
    /** For RECBOT / automation: world + screen positions of the current step's targets, in the order to act on them. */
    targets() {
      if (!mech || !mech.targets) return { step: idx + 1, title: steps[idx] ? steps[idx].title : '', ready: controller.ready, targets: [] };
      const list = mech.targets().map((t) => ({ ...t, p: { x: t.p.x, y: t.p.y, z: t.p.z }, screen: engine.toScreen(t.p) }));
      return { step: idx + 1, title: steps[idx].title, ready: controller.ready, plane: steps[idx].plane, mirrored: !!mech.mirrored, targets: list };
    },
    metrics() {
      return { totalScore: S.total, timeSec: Math.round(S.time * 10) / 10, tissueErrors: S.m.tissueErrors, missedActions: S.m.missedActions };
    },
    dispose() {
      disposed = true;
      for (const h of pending) clearTimeout(h);
      if (mech && mech.dispose) try { mech.dispose(); } catch {}
      banner.dispose();
      disposeGroup(group);
    },
    async autoplay() {
      return runBot(engine, controller, async (bot) => {
        await bot.start(ev.p.clone());
        for (let i = 0; i < steps.length; i++) {
          while (!(idx === i && controller.ready)) { await bot.wait(0.05); if (S.done) return; }
          await bot.wait(0.35);
          await mech.bot(bot, S);
          bot.down(false);
          while (idx === i && !S.done && transT <= 0) await bot.wait(0.05);
        }
      });
    },
  };
  return controller;
}

// ------------------------------------------------------------------ bot helpers
export async function botClick(bot, p, speed = 0.9, hold = 0.12) {
  await bot.moveTo(p, speed); await bot.wait(0.12); bot.down(true); await bot.wait(hold); bot.down(false); await bot.wait(0.15);
}

// ------------------------------------------------------------------ mechanic: trace an incision guide
/** pts: Vector3[] (on surface y). Press on the green dot, hold and follow the dashed marker line to the end ring. */
export function traceGuide(S, { pts, y, tolMm = 4, onCut, onDone }) {
  const g = new THREE.Group(); S.group.add(g);
  const pl = polyline(pts.map((p) => p.clone().setY(y)));
  const L = pl.length;
  const guide = new Ribbon(200, y + 0.002, new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
  const purple = new THREE.Color(0x5a3aa0);
  const N = 40;
  for (let i = 0; i < N; i += 2) {
    const a = sampleAt(pl, (i / N) * L), b = sampleAt(pl, ((i + 1) / N) * L);
    guide.seg(a, b, 0.013, 0.013, purple);
  }
  g.add(guide.mesh);
  const groove = new Ribbon(3000, y + 0.004, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  g.add(groove.mesh);
  const start = makeDot(0.04, 0x2fbf71, y + 0.005); start.position.x = pts[0].x; start.position.z = pts[0].z;
  const startRing = makeRing(0.06, 0.075, 0x2fbf71, y + 0.005, 0.8); startRing.position.copy(start.position);
  const endRing = makeRing(0.045, 0.06, 0x5a3aa0, y + 0.005, 0.9); endRing.position.set(pts[pts.length - 1].x, y + 0.005, pts[pts.length - 1].z);
  g.add(start, startRing, endRing);
  const dark = new THREE.Color(0x3a1f26), off = new THREE.Color(0x9a3a40);
  const st = { cutting: false, started: false, sMax: 0, last: null, devSum: 0, devN: 0, armed: true, quarter: 0, qSum: 0, qN: 0, done: false, lifted: 0 };
  const tip = new THREE.Vector3();
  const dir = pts[pts.length - 1].clone().sub(pts[0]);
  const mech = {
    frac: () => st.sMax / L,
    update(ev, dt) {
      tip.copy(ev.p).setY(y);
      const c = closestOnPolyline(pl, tip);
      const dev = c.dist / MM;
      const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 220);
      startRing.material.opacity = st.started ? 0 : pulse;
      endRing.material.opacity = st.sMax > L * 0.75 ? pulse : 0.6;
      if (ev.pressed && !st.cutting) {
        const nearStart = tip.distanceTo(pl.points[0]) < 0.09;
        const nearResume = st.started && c.dist < 0.08 && Math.abs(c.s - st.sMax) < 0.2;
        if ((!st.started && nearStart) || nearResume) {
          st.cutting = true; st.started = true; st.last = null;
          S.setInstr('Keep the blade on the purple line, steady pace to the end ring');
        } else if (!st.started) S.setInstr('Start on the green dot');
      }
      if (st.cutting && !ev.down) {
        st.cutting = false; st.last = null; st.lifted++;
        if (!st.done) { S.m.hesitations++; S.setInstr('Blade lifted: press again where your cut ended'); }
      }
      if (st.cutting) {
        if (!st.last || tip.distanceTo(st.last) > 0.006) {
          if (st.last) groove.seg(st.last, tip, 0.01, 0.01, dev > tolMm ? off : dark);
          st.last = (st.last || new THREE.Vector3()).copy(tip);
          if (onCut) onCut(tip);
        }
        st.devSum += dev; st.devN++; st.qSum += dev; st.qN++;
        // tolerant progress: hitches / quick flicks may jump ahead along the line (no soft-lock)
        if (c.dist < 0.06 && c.s <= st.sMax + 0.35) st.sMax = Math.max(st.sMax, c.s);
        if (st.sMax > L * 0.6 && tip.distanceTo(pl.points[pl.points.length - 1]) < 0.05) st.sMax = L;
        if (dev > tolMm && st.armed) { st.armed = false; S.error(0.6, 'Off the guide — steer back to the line'); }
        else if (dev < tolMm * 0.6) st.armed = true;
        const q = Math.floor((st.sMax / L) * 4);
        if (q > st.quarter && q < 4) {
          const mean = st.qSum / Math.max(1, st.qN);
          if (mean < 2) S.comboHit('cut', 'Steady hand', 30); else S.comboBreak('cut');
          st.quarter = q; st.qSum = 0; st.qN = 0;
        }
        if (st.sMax >= L - 0.03) {
          st.done = true; st.cutting = false;
          const mean = st.devSum / Math.max(1, st.devN);
          S.precision(mean);
          if (mean < 1.5) S.award(150, 'Clean cut!'); else if (mean < 2.5) S.award(100, 'Good incision'); else S.award(60, 'Incision made');
          if (onDone) onDone();
          return true;
        }
      }
      return false;
    },
    async bot(bot) {
      const p0 = pl.points[0];
      await bot.moveTo(p0.clone(), 0.9);
      await bot.wait(0.25); bot.down(true); await bot.wait(0.15);
      const rest = pl.points.slice(1).map((p) => p.clone());
      rest.push(rest[rest.length - 1].clone().add(rest[rest.length - 1].clone().sub(pl.points[pl.points.length - 2]).setLength(0.02)));
      await bot.path(rest, 0.28);
      await bot.wait(0.1); bot.down(false);
    },
    dispose() { g.traverse((o) => o.geometry && o.geometry.dispose()); },
    group: g, groove,
    targets: () => [{ label: 'press-start', p: pl.points[0].clone() }, ...pl.points.filter((_, k) => k % 4 === 0).slice(1).map((p) => ({ label: 'path', p: p.clone() })), { label: 'end', p: pl.points[pl.points.length - 1].clone() }],
  };
  return mech;
}
function sampleAt(pl, s) {
  for (let i = 0; i < pl.points.length - 1; i++) {
    if (pl.cum[i + 1] >= s) { const t = (s - pl.cum[i]) / Math.max(1e-9, pl.cum[i + 1] - pl.cum[i]); return pl.points[i].clone().lerp(pl.points[i + 1], t); }
  }
  return pl.points[pl.points.length - 1].clone();
}

// ------------------------------------------------------------------ mechanic: drag handles to targets
/** handles: [{obj, from:Vector3, to:Vector3}] — grab a handle and pull it to its target ring. onChange(ts[]). */
export function dragHandles(S, { handles, y, onChange, grabR = 0.16 }) {
  const g = new THREE.Group(); S.group.add(g);
  const ts = handles.map(() => 0), locked = handles.map(() => false), overWarned = handles.map(() => false);
  const rings = handles.map((h) => { const r = makeRing(0.07, 0.09, TEAL, y + 0.006, 0.9); r.position.set(h.to.x, y + 0.006, h.to.z); g.add(r); return r; });
  const grips = handles.map((h) => { const r = makeRing(0.05, 0.068, 0xffffff, y + 0.008, 0.85); g.add(r); return r; });
  let held = -1;
  const tmp = new THREE.Vector3();
  const place = () => handles.forEach((h, i) => {
    h.obj.position.lerpVectors(h.from, h.to, ts[i]);
    grips[i].position.set(h.obj.position.x, y + 0.008, h.obj.position.z);
  });
  place();
  const mech = {
    frac: () => ts.reduce((a, b) => a + Math.min(1, b), 0) / ts.length,
    update(ev) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 230);
      rings.forEach((r, i) => { r.material.opacity = locked[i] ? 0 : 0.35 + 0.5 * pulse; });
      grips.forEach((r, i) => { r.visible = !locked[i]; });
      if (ev.pressed && held < 0) {
        let best = -1, bd = grabR;
        handles.forEach((h, i) => { if (locked[i]) return; const d = Math.hypot(ev.p.x - h.obj.position.x, ev.p.z - h.obj.position.z); if (d < bd) { bd = d; best = i; } });
        if (best >= 0) held = best;
        else { S.m.missedActions++; S.setInstr('Grab a white handle ring, then pull it to the teal target'); }
      }
      if (held >= 0) {
        const h = handles[held];
        const ax = tmp.subVectors(h.to, h.from); const L2 = ax.lengthSq();
        const t = ((ev.p.x - h.from.x) * ax.x + (ev.p.z - h.from.z) * ax.z) / L2;
        ts[held] = Math.max(0, Math.min(1.3, t));
        if (ts[held] > 1.18 && !overWarned[held]) { overWarned[held] = true; S.error(0.5, 'Gentle — over-retracting'); }
        if (!ev.down) {
          if (ts[held] >= 0.82) {
            ts[held] = 1; locked[held] = true;
            if (!overWarned[held]) { S.award(80, 'Good exposure'); S.comboHit('retract', 'Smooth retraction', 30); }
            else S.info('Retractor set');
          } else { S.m.retries++; S.setInstr('Pull the handle all the way to the teal ring'); }
          held = -1;
        }
        place(); if (onChange) onChange(ts);
      }
      return locked.every(Boolean);
    },
    group: g,
    targets: () => handles.flatMap((h, i) => (locked[i] ? [] : [{ label: `handle${i + 1}-grab`, p: h.obj.position.clone().setY(y) }, { label: `handle${i + 1}-drop`, p: h.to.clone().setY(y) }])),
    async bot(bot) {
      for (let i = 0; i < handles.length; i++) {
        const h = handles[i];
        await bot.moveTo(h.obj.position.clone().setY(y), 0.9);
        await bot.wait(0.15); bot.down(true); await bot.wait(0.12);
        await bot.moveTo(h.to.clone().setY(y), 0.45);
        await bot.wait(0.15); bot.down(false); await bot.wait(0.3);
      }
    },
    dispose() {},
  };
  return mech;
}

// ------------------------------------------------------------------ mechanic: ordered click targets
/** targets: Vector3[]; click them in order. onHit(i, errMm). */
export function clickTargets(S, { targets, y, radius = 0.05, onHit, label = 'Clip placed', comboLabel = 'Perfect clip', wrongMsg = 'Wrong order — follow the numbers' }) {
  const g = new THREE.Group(); S.group.add(g);
  const rings = targets.map((p, i) => {
    const r = makeRing(radius * 0.75, radius, i === 0 ? TEAL : 0xffffff, y + 0.006, 0.85); r.position.set(p.x, y + 0.006, p.z);
    r.material.depthTest = false; r.renderOrder = 9; g.add(r);
    const lab = numberSprite(i + 1); lab.position.set(p.x, y + 0.09, p.z); g.add(lab);
    return r;
  });
  let next = 0;
  const mech = {
    frac: () => next / targets.length,
    update(ev) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200);
      rings.forEach((r, i) => { r.visible = i >= next; r.material.color.setHex(i === next ? TEAL : 0xffffff); r.material.opacity = i === next ? 0.5 + 0.5 * pulse : 0.6; });
      g.children.forEach((c) => { if (c.isSprite) c.visible = c.userData.n > next; });
      if (ev.pressed) {
        const d = Math.hypot(ev.p.x - targets[next].x, ev.p.z - targets[next].z);
        const wrong = targets.findIndex((p, i) => i > next && Math.hypot(ev.p.x - p.x, ev.p.z - p.z) < radius);
        if (d < radius) {
          const err = d / MM;
          S.precision(err);
          if (err < 2) { S.award(120, label + ' — perfect'); S.comboHit('click', comboLabel, 50); }
          else { S.award(80, label); S.comboBreak('click'); }
          if (onHit) onHit(next, err);
          next++;
        } else if (wrong >= 0) S.error(0.4, wrongMsg, 'miss');
        else { S.m.missedActions++; S.comboBreak('click'); S.warn('Missed — aim inside the ring'); }
      }
      return next >= targets.length;
    },
    async bot(bot) { for (const p of targets) { await botClick(bot, p.clone().setY(y), 0.7); await bot.wait(0.25); } },
    dispose() {},
    group: g,
    targets: () => targets.slice(next).map((p, k) => ({ label: `click${next + k + 1}`, p: p.clone().setY(y) })),
  };
  return mech;
}

function numberSprite(n) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(11,15,19,.85)'; x.beginPath(); x.arc(32, 32, 28, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#3EC5B5'; x.lineWidth = 4; x.stroke();
  x.fillStyle = '#fff'; x.font = '700 34px Inter, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), 32, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(0.09, 0.09, 1); s.renderOrder = 12; s.userData.n = n;
  return s;
}

// ------------------------------------------------------------------ mechanic: interrupted suture bites
/** pairs: [{entry, exit}] Vector3 on surface. Press on the entry dot, drag across the wound, release on the exit dot. */
export function sutureBites(S, { pairs, y, radius = 0.07, onStitch, color = 0x3346b8, arc = 0.06 }) {
  const g = new THREE.Group(); S.group.add(g);
  const dots = pairs.map((p) => {
    const a = makeDot(0.022, TEAL, y + 0.006); a.position.set(p.entry.x, y + 0.006, p.entry.z);
    const ar = makeRing(0.032, 0.042, TEAL, y + 0.006, 0.9); ar.position.copy(a.position);
    const b = makeDot(0.022, 0x8a6ad8, y + 0.006); b.position.set(p.exit.x, y + 0.006, p.exit.z);
    g.add(a, ar, b); return { a, ar, b };
  });
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color, dashSize: 0.02, gapSize: 0.012, depthTest: false }));
  line.renderOrder = 11; line.visible = false; g.add(line);
  const threadMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  let i = 0, active = false, entryErr = 0;
  const mech = {
    group: g, keep: true,
    targets: () => pairs.slice(i).flatMap((p, k) => [{ label: `stitch${i + k + 1}-press`, p: p.entry.clone() }, { label: `stitch${i + k + 1}-release`, p: p.exit.clone() }]),
    frac: () => i / pairs.length,
    update(ev) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 210);
      dots.forEach((d, k) => { d.ar.visible = k === i && !active; d.ar.material.opacity = 0.4 + 0.6 * pulse; d.a.visible = d.b.visible = k >= i; });
      if (i >= pairs.length) return true;
      const p = pairs[i];
      if (ev.pressed && !active) {
        const d = Math.hypot(ev.p.x - p.entry.x, ev.p.z - p.entry.z);
        if (d < radius) { active = true; entryErr = d / MM; S.setInstr('Drag across the wound and release on the purple exit dot'); }
        else { S.m.missedActions++; S.warn('Start the bite on the teal entry dot'); }
      }
      if (active) {
        line.visible = true;
        const pos = lineGeo.attributes.position;
        pos.setXYZ(0, p.entry.x, y + 0.01, p.entry.z); pos.setXYZ(1, ev.p.x, y + 0.01, ev.p.z); pos.needsUpdate = true;
        line.computeLineDistances();
        if (!ev.down) {
          active = false; line.visible = false;
          const d = Math.hypot(ev.p.x - p.exit.x, ev.p.z - p.exit.z);
          if (d < radius) {
            const err = (entryErr + d / MM) / 2;
            S.precision(err);
            addStitch(p);
            if (err < 2.5) { S.award(120, 'Perfect bite'); S.comboHit('bite', 'Perfect bite', 50); }
            else { S.award(80, 'Stitch tied'); S.comboBreak('bite'); }
            if (onStitch) onStitch(i, err);
            i++;
            S.setInstr(i < pairs.length ? `Stitch ${i + 1} of ${pairs.length}: press on the teal entry dot` : 'Wound closed');
            if (i >= pairs.length) dots.forEach((d) => { d.a.visible = d.b.visible = d.ar.visible = false; });
          } else { S.m.retries++; S.error(0.3, 'Bite missed the exit mark — try again', 'miss'); }
        }
      }
      return i >= pairs.length;
    },
    async bot(bot) {
      for (const p of pairs) {
        await bot.moveTo(p.entry.clone().setY(y), 0.8);
        await bot.wait(0.15); bot.down(true); await bot.wait(0.12);
        await bot.moveTo(p.exit.clone().setY(y), 0.32);
        await bot.wait(0.12); bot.down(false); await bot.wait(0.45);
      }
    },
    dispose() {},
  };
  function addStitch(p) {
    const mid = p.entry.clone().lerp(p.exit, 0.5); mid.y = y + arc;
    const a = p.entry.clone().setY(y + 0.008), b = p.exit.clone().setY(y + 0.008);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 16, 0.008, 6), threadMat);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), threadMat); knot.position.copy(b).add(new THREE.Vector3(0, 0.01, 0));
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.07, 5), threadMat);
    tail.position.copy(knot.position).add(new THREE.Vector3(0.025, 0.005, 0.02)); tail.rotation.set(1.2, 0.4, 0.9);
    g.add(tube, knot, tail);
  }
  return mech;
}

// ------------------------------------------------------------------ mechanic: press-and-hold targets (injection)
export function holdTargets(S, { targets, y, radius = 0.06, holdT = 0.8, onDone, label = 'Injected' }) {
  const g = new THREE.Group(); S.group.add(g);
  const items = targets.map((p) => {
    const dot = makeDot(0.018, 0xffffff, y + 0.006); dot.position.set(p.x, y + 0.006, p.z);
    const ring = makeRing(0.04, 0.05, TEAL, y + 0.006, 0.9); ring.position.copy(dot.position);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(0.075, 32), new THREE.MeshBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0, depthWrite: false }));
    fill.rotation.x = -Math.PI / 2; fill.position.set(p.x, y + 0.004, p.z); fill.scale.setScalar(0.01);
    g.add(fill, dot, ring);
    return { p, dot, ring, fill, t: 0, done: false };
  });
  let cur = -1;
  const mech = {
    group: g, keep: true,
    targets: () => items.filter((it) => !it.done).map((it) => ({ label: 'press-and-hold', p: it.p.clone(), holdSec: holdT })),
    frac: () => items.filter((it) => it.done).length / items.length,
    update(ev, dt) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 210);
      for (const it of items) it.ring.material.opacity = it.done ? 0 : 0.4 + 0.6 * pulse;
      if (ev.pressed) {
        cur = items.findIndex((it) => !it.done && Math.hypot(ev.p.x - it.p.x, ev.p.z - it.p.z) < radius);
        if (cur < 0) { S.m.missedActions++; S.warn('Inject inside a teal ring'); }
        else S.setInstr('Hold steady while the anaesthetic goes in…');
      }
      if (cur >= 0) {
        const it = items[cur];
        const drift = Math.hypot(ev.p.x - it.p.x, ev.p.z - it.p.z);
        if (ev.down && drift < radius * 1.4) {
          it.t += dt;
          const k = Math.min(1, it.t / holdT);
          it.fill.scale.setScalar(0.2 + k); it.fill.material.opacity = 0.45 * k;
          if (k >= 1) {
            it.done = true; cur = -1;
            S.precision(drift / MM);
            S.award(70, label); S.comboHit('inject', 'Smooth injection', 30);
            S.setInstr(items.every((x) => x.done) ? 'Area numb' : 'Next teal ring: press and hold');
          }
        } else {
          if (ev.down) S.error(0.4, 'Needle moved — hold still while injecting');
          else { S.m.retries++; S.warn('Released too early — hold until the ring fills'); }
          S.comboBreak('inject'); cur = -1;
        }
      }
      if (items.every((it) => it.done)) { if (onDone) onDone(); return true; }
      return false;
    },
    async bot(bot) {
      for (const it of items) {
        await bot.moveTo(it.p.clone().setY(y), 0.8); await bot.wait(0.12);
        bot.down(true); await bot.wait(holdT + 0.25); bot.down(false); await bot.wait(0.3);
      }
    },
    dispose() {},
  };
  return mech;
}

// ------------------------------------------------------------------ mechanic: wipe (clean the field)
/** specks: Vector3[] — hold and rub the gauze over them until they fade. */
export function wipe(S, { specks, y, radius = 0.12, rate = 2.2, gauze }) {
  const g = new THREE.Group(); S.group.add(g);
  const items = specks.map((p, i) => {
    const m = makeDot(0.012 + (i % 3) * 0.006, i % 2 ? 0x6b5a48 : 0x7d7468, y + 0.005, 0.95); m.position.set(p.x, y + 0.005, p.z);
    m.material.transparent = true; g.add(m); return { p, m, dirt: 1 };
  });
  const last = new THREE.Vector3(); let has = false, mark = 0;
  const left = () => items.filter((it) => it.dirt > 0).length;
  const mech = {
    targets: () => items.filter((it) => it.dirt > 0).map((it) => ({ label: 'rub', p: it.p.clone() })),
    hideMarker: true,
    frac: () => 1 - left() / items.length,
    update(ev, dt) {
      if (gauze) { gauze.position.set(ev.p.x, y + (ev.down ? 0.012 : 0.05), ev.p.z); }
      if (ev.down) {
        const moved = has ? Math.hypot(ev.p.x - last.x, ev.p.z - last.z) : 0;
        if (moved > 0.0005) {
          for (const it of items) {
            if (it.dirt <= 0) continue;
            if (Math.hypot(ev.p.x - it.p.x, ev.p.z - it.p.z) < radius) {
              it.dirt -= moved * rate * 10; it.m.material.opacity = Math.max(0, it.dirt) * 0.95;
              if (it.dirt <= 0) it.m.visible = false;
            }
          }
        }
        last.copy(ev.p); has = true;
      } else has = false;
      const f = mech.frac();
      const q = Math.floor(f * 3);
      if (q > mark && f < 1) { mark = q; S.award(40, q === 1 ? 'Nice and clean' : 'Sparkling'); S.comboHit('wipe', 'Clean sweep', 20); }
      return left() === 0;
    },
    async bot(bot) {
      const c = specks.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / specks.length).setY(y);
      let mx = 0, mz = 0; for (const p of specks) { mx = Math.max(mx, Math.abs(p.x - c.x)); mz = Math.max(mz, Math.abs(p.z - c.z)); }
      await bot.moveTo(V(c.x - mx, y, c.z - mz), 0.9); bot.down(true);
      for (let pass = 0; pass < 3 && left() > 0; pass++) {
        const rows = 5;
        for (let r = 0; r <= rows && left() > 0; r++) {
          const z = c.z - mz + (2 * mz * r) / rows;
          await bot.moveTo(V(c.x + (r % 2 ? -mx : mx), y, z), 1.4, false);
        }
        for (const it of items) if (it.dirt > 0) { await bot.moveTo(it.p.clone().setY(y).add(V(0.05, 0, 0)), 1.0, false); await bot.moveTo(it.p.clone().setY(y).add(V(-0.05, 0, 0.02)), 0.8, false); }
      }
      bot.down(false);
    },
    dispose() {},
  };
  return mech;
}

// ------------------------------------------------------------------ mechanic: drag an object onto a target
export function dragDrop(S, { obj, target, y, radius = 0.12, label = 'Placed', onDone }) {
  const g = new THREE.Group(); S.group.add(g);
  const ring = makeRing(0.11, 0.13, TEAL, y + 0.006, 0.9); ring.position.set(target.x, y + 0.006, target.z); g.add(ring);
  const home = obj.position.clone();
  let held = false, done = false;
  const mech = {
    group: g,
    targets: () => (done ? [] : [{ label: 'drag-from', p: obj.position.clone() }, { label: 'drop-on', p: target.clone() }]),
    hideMarker: false,
    frac: () => (done ? 1 : held ? 0.5 : 0),
    update(ev) {
      ring.material.opacity = 0.4 + 0.5 * (0.5 + 0.5 * Math.sin(performance.now() / 220));
      if (done) return true;
      if (ev.pressed && Math.hypot(ev.p.x - obj.position.x, ev.p.z - obj.position.z) < 0.22) held = true;
      else if (ev.pressed) { S.m.missedActions++; S.warn('Pick up the dressing first'); }
      if (held) {
        obj.position.set(ev.p.x, Math.max(home.y, y + 0.06), ev.p.z);
        if (!ev.down) {
          held = false;
          const d = Math.hypot(ev.p.x - target.x, ev.p.z - target.z);
          if (d < radius) {
            done = true; ring.visible = false;
            obj.position.set(target.x, y + 0.012, target.z);
            S.precision(d / MM);
            S.award(d / MM < 3 ? 150 : 100, d / MM < 3 ? 'Perfectly dressed' : label);
            if (onDone) onDone();
          } else { S.m.retries++; S.warn('Cover the whole wound — drop it on the ring'); }
        }
      }
      return done;
    },
    async bot(bot) {
      await bot.moveTo(obj.position.clone().setY(y), 0.9); await bot.wait(0.15); bot.down(true); await bot.wait(0.15);
      await bot.moveTo(target.clone().setY(y), 0.6); await bot.wait(0.2); bot.down(false); await bot.wait(0.2);
    },
    dispose() {},
  };
  return mech;
}
