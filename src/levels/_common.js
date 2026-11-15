// LEVELS — shared helpers for the three drills (geometry, scoring, OSATS grading, bot driving).
// World units: 1 unit = 1 cm (engine.MM = 0.1 units per mm).
import * as THREE from 'three';

export const MM = 0.1;

// ---------------------------------------------------------------- OSATS rubric
// Built-in defaults mirror content/osats.json; the JSON (if it loads) overrides them.
const DEFAULT_OSATS = {
  items: [
    { id: 'tissue', name: 'Respect for tissue' },
    { id: 'time_motion', name: 'Time and motion' },
    { id: 'instrument', name: 'Instrument handling' },
    { id: 'flow', name: 'Flow of operation' },
    { id: 'precision', name: 'Precision' },
  ],
  grades: [
    { min: 4.5, label: 'A', text: 'Expert-like control' },
    { min: 3.5, label: 'B', text: 'Proficient' },
    { min: 2.5, label: 'C', text: 'Competent, keep practicing' },
    { min: 1.5, label: 'D', text: 'Developing' },
    { min: 0, label: 'E', text: 'Novice: slow down and try again' },
  ],
  mapping: {
    incision: {
      tissue: { metric: 'depthVariability', t5: 0.3, t4: 0.5, t3: 0.8, t2: 1.2 },
      time_motion: { metric: 'timeSec', t5: 20, t4: 28, t3: 40, t2: 60 },
      instrument: { metric: 'offLineEvents', t5: 0, t4: 1, t3: 3, t2: 5 },
      flow: { metric: 'pauses', t5: 0, t4: 1, t3: 2, t2: 4 },
      precision: { metric: 'meanDeviationMm', t5: 0.8, t4: 1.2, t3: 2.0, t2: 3.0 },
    },
    suture: {
      tissue: { metric: 'traumaEvents', t5: 0, t4: 1, t3: 2, t2: 4 },
      time_motion: { metric: 'timeSec', t5: 40, t4: 55, t3: 80, t2: 120 },
      instrument: { metric: 'needleOffCurveMm', t5: 0.5, t4: 1.0, t3: 1.8, t2: 3.0 },
      flow: { metric: 'retries', t5: 0, t4: 1, t3: 2, t2: 4 },
      precision: { metric: 'meanTargetErrorMm', t5: 1.0, t4: 1.5, t3: 2.5, t2: 4.0 },
    },
    lap: {
      tissue: { metric: 'vesselTouches', t5: 0, t4: 1, t3: 2, t2: 4 },
      time_motion: { metric: 'pathLengthRatio', t5: 1.4, t4: 1.8, t3: 2.5, t2: 3.5 },
      instrument: { metric: 'drops', t5: 0, t4: 1, t3: 2, t2: 3 },
      flow: { metric: 'timeSec', t5: 60, t4: 80, t3: 110, t2: 160 },
      precision: { metric: 'missedGrasps', t5: 1, t4: 2, t3: 4, t2: 6 },
    },
  },
};

let OSATS = DEFAULT_OSATS;
const osatsReady = fetch(new URL('../../content/osats.json', import.meta.url))
  .then((r) => (r.ok ? r.json() : null))
  .then((j) => { if (j && j.mapping && j.items) OSATS = { ...DEFAULT_OSATS, ...j }; })
  .catch(() => {});
export { osatsReady };

function score15(v, r) {
  if (v <= r.t5) return 5;
  if (v <= r.t4) return 4;
  if (v <= r.t3) return 3;
  if (v <= r.t2) return 2;
  return 1;
}

/** OSATS-style grade: {items:{"Respect for tissue":4,...}, overall, letter, text, detail:[...]} */
export function gradeDrill(drill, metrics) {
  const map = (OSATS.mapping && OSATS.mapping[drill]) || DEFAULT_OSATS.mapping[drill];
  const items = {};
  const detail = [];
  let sum = 0, n = 0;
  for (const it of OSATS.items) {
    const rule = map[it.id];
    if (!rule) continue;
    const v = metrics[rule.metric];
    if (typeof v !== 'number') continue;
    const s = score15(v, rule);
    items[it.name] = s;
    detail.push({ id: it.id, name: it.name, score: s, metric: rule.metric, value: v, anchor: it.anchors ? it.anchors[s] : undefined });
    sum += s; n++;
  }
  const overall = n ? Math.round((sum / n) * 10) / 10 : 1;
  const g = OSATS.grades.find((x) => overall >= x.min) || OSATS.grades[OSATS.grades.length - 1];
  return { items, overall, letter: g.label, text: g.text, detail };
}

// ---------------------------------------------------------------- scene helpers
export function setCamera(engine, pos, target) {
  engine.camera.position.set(pos[0], pos[1], pos[2]);
  engine.camera.lookAt(target[0], target[1], target[2]);
}

/** Call an ART factory if present; returns {mesh,...} or null. */
export function fromArt(art, name, ...args) {
  try {
    const f = art && art[name];
    if (typeof f !== 'function') return null;
    const r = f(...args);
    if (!r) return null;
    if (r.isObject3D) return { mesh: r };
    return r.mesh && r.mesh.isObject3D ? r : null;
  } catch (e) {
    console.warn('[levels] art.' + name + ' failed', e);
    return null;
  }
}

/** Uniformly scale + translate obj so its bbox is `width` wide in x, centred on (x,z), with its top at topY. */
export function fitTo(obj, { width, topY, x = 0, z = 0 }) {
  obj.updateMatrixWorld(true);
  let b = new THREE.Box3().setFromObject(obj);
  const sx = b.max.x - b.min.x;
  if (sx > 1e-6) obj.scale.multiplyScalar(width / sx);
  obj.updateMatrixWorld(true);
  b = new THREE.Box3().setFromObject(obj);
  obj.position.x += x - (b.min.x + b.max.x) / 2;
  obj.position.z += z - (b.min.z + b.max.z) / 2;
  obj.position.y += topY - b.max.y;
  obj.updateMatrixWorld(true);
  return obj;
}

export function addLightsIfNeeded(scene, group) {
  let has = false;
  scene.traverse((o) => { if (o.isLight) has = true; });
  if (has) return;
  group.add(new THREE.HemisphereLight(0xdfe8ff, 0x20242a, 0.9));
  const d = new THREE.DirectionalLight(0xffffff, 1.6);
  d.position.set(4, 20, 8);
  group.add(d);
}

export function disposeGroup(group) {
  if (group.parent) group.parent.remove(group);
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose && m.dispose());
  });
}

/** Flat disc lying on a surface (target dots). */
export function makeDot(radius, color, y, opacity = 1) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 32),
    new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.renderOrder = 3;
  return m;
}

export function makeRing(r0, r1, color, y, opacity = 1) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(r0, r1, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.renderOrder = 3;
  return m;
}

// ---------------------------------------------------------------- polylines
export function polyline(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + points[i].distanceTo(points[i - 1]));
  return { points, cum, length: cum[cum.length - 1] };
}

/** Closest point on polyline in xz. Returns {dist, s (arc length), i}. */
export function closestOnPolyline(pl, p) {
  const pts = pl.points;
  let best = Infinity, bs = 0, bi = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const abx = b.x - a.x, abz = b.z - a.z;
    const L2 = abx * abx + abz * abz || 1e-9;
    let t = ((p.x - a.x) * abx + (p.z - a.z) * abz) / L2;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + abx * t, cz = a.z + abz * t;
    const d = Math.hypot(p.x - cx, p.z - cz);
    if (d < best) { best = d; bs = pl.cum[i] + Math.sqrt(L2) * t; bi = i; }
  }
  return { dist: best, s: bs, i: bi };
}

/** Flat ribbon strip that grows segment-by-segment (cut groove, marker line). */
export class Ribbon {
  constructor(maxSegs, y, material) {
    this.max = maxSegs;
    this.y = y;
    this.n = 0;
    this.pos = new Float32Array(maxSegs * 6 * 3);
    this.col = new Float32Array(maxSegs * 6 * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geo, material || new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }
  /** add a quad from a to b, half widths wa/wb, color c (THREE.Color) */
  seg(a, b, wa, wb, c, c2 = c) {
    if (this.n >= this.max) return;
    const dx = b.x - a.x, dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1e-6;
    const nx = -dz / L, nz = dx / L;
    const y = this.y;
    const v = [
      [a.x + nx * wa, y, a.z + nz * wa, c], [a.x - nx * wa, y, a.z - nz * wa, c], [b.x + nx * wb, y, b.z + nz * wb, c2],
      [a.x - nx * wa, y, a.z - nz * wa, c], [b.x - nx * wb, y, b.z - nz * wb, c2], [b.x + nx * wb, y, b.z + nz * wb, c2],
    ];
    let o = this.n * 18;
    for (const q of v) {
      this.pos[o] = q[0]; this.pos[o + 1] = q[1]; this.pos[o + 2] = q[2];
      this.col[o] = q[3].r; this.col[o + 1] = q[3].g; this.col[o + 2] = q[3].b;
      o += 3;
    }
    this.n++;
    this.geo.setDrawRange(0, this.n * 6);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- progress / events
export function makeReporter(engine, id) {
  let lastPct = -1, lastHint = null, lastT = 0;
  return function report(pct, hint, extra = {}, force = false) {
    const now = performance.now();
    if (!force && Math.abs(pct - lastPct) < 0.01 && hint === lastHint && now - lastT < 250) return;
    lastPct = pct; lastHint = hint; lastT = now;
    engine.emit('level:progress', { id, pct: Math.max(0, Math.min(1, pct)), hint, ...extra });
  };
}

export function steadyOf(input) {
  return 'steady' in input ? !!input.steady : input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
}

// ---------------------------------------------------------------- bot driver
/** Drives engine.setBotPointer/Down along waypoints at a given speed, frame-synced and pause-aware. */
export function makeBot(engine, controller) {
  const alive = () => engine.currentLevel && engine.currentLevel.controller === controller;
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const cur = new THREE.Vector3();
  let started = false;
  const bot = {
    alive,
    pos: cur,
    async start(p) {
      cur.copy(p);
      started = true;
      engine.setBotPointer(cur);
      engine.setBotDown(false);
      await frame();
    },
    down(b) { engine.setBotDown(!!b); },
    /** move to p at `speed` cm/s (optionally easing in/out at ends) */
    async moveTo(p, speed, ease = true) {
      if (!started) return bot.start(p);
      const from = cur.clone();
      const D = from.distanceTo(p);
      const T = Math.max(0.05, D / speed);
      let t = 0, last = performance.now();
      while (t < T) {
        await frame();
        if (!alive()) throw new Error('bot aborted');
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (engine.paused) continue;
        t += dt;
        let u = Math.min(1, t / T);
        if (ease) u = u * u * (3 - 2 * u);
        cur.lerpVectors(from, p, u);
        engine.setBotPointer(cur);
      }
    },
    async path(pts, speed) {
      // constant-speed traverse of a polyline starting from the current position
      const all = [cur.clone(), ...pts.map((p) => p.clone())];
      const pl = polyline(all);
      let s = 0, last = performance.now(), i = 0;
      while (s < pl.length) {
        await frame();
        if (!alive()) throw new Error('bot aborted');
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (engine.paused) continue;
        s = Math.min(pl.length, s + speed * dt);
        while (i < all.length - 2 && pl.cum[i + 1] < s) i++;
        const segL = pl.cum[i + 1] - pl.cum[i] || 1e-9;
        cur.lerpVectors(all[i], all[i + 1], (s - pl.cum[i]) / segL);
        engine.setBotPointer(cur);
      }
    },
    async wait(s) {
      let t = 0, last = performance.now();
      while (t < s) {
        await frame();
        if (!alive()) throw new Error('bot aborted');
        const now = performance.now();
        if (!engine.paused) t += Math.min(0.05, (now - last) / 1000);
        last = now;
      }
    },
    end() {
      engine.setBotDown(null);
      engine.setBotPointer(null);
    },
  };
  return bot;
}

/** Wrap an async bot script: holds SHIFT-steady for the bot, cleans up, resolves with metrics. */
export async function runBot(engine, controller, script) {
  const bot = makeBot(engine, controller);
  const prevScale = engine.tremorScale;
  engine.tremorScale = 0.3; // the bot has an expert's steady hands (tremor still present, just small)
  try {
    await script(bot);
    // wait for the level to finish scoring
    for (let i = 0; i < 300 && !controller._done && bot.alive(); i++) await bot.wait(0.02);
  } catch (e) {
    if (!/aborted/.test(e.message)) console.error('[levels] bot error', e);
  } finally {
    engine.tremorScale = prevScale;
    if (bot.alive()) bot.end();
  }
  return controller.metrics();
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const r1 = (v) => Math.round(v * 10) / 10;
export const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- patient surgical field
/**
 * Builds the drill's work surface ON THE PATIENT: ART mannequin (true scale, x10) + drape with a window over the
 * abdomen, and a 100 mm tissue field flush in that window. Falls back to a bare pad when ART is missing.
 * Returns {pad, padTop, toLocal(x,z)->[lx,lz] (pad-local for incisionDecal), scale, dispose()}.
 */
export function buildPatientField(engine, art, group, { padW = 10 } = {}) {
  const ART = 10; // ART 1 unit = 10 cm; levels use 1 unit = 1 cm
  const hidden = [];
  if (typeof art.makeSurgicalField === 'function') {
    // LOOK's photoreal prepped-skin window with OR drapes around it (pad API compatible with incisionDecal)
    try {
      const f = art.makeSurgicalField({ w: 6, h: 4 });
      const pad = f.mesh;
      const w = pad.userData.width - 0.12;
      const scale = padW / w;
      pad.scale.setScalar(scale);
      group.add(pad);
      return { pad, padTop: pad.userData.surfaceY * scale, toLocal: (x, z) => [x / scale, z / scale], scale, dispose() {} };
    } catch (e) { console.warn('[levels] makeSurgicalField failed', e); }
  }
  // the CORE room's own table would cut through the patient: hide its meshes (keep its lights)
  if (engine.room && engine.room.group && typeof art.makeDummy === 'function') {
    engine.room.group.traverse((o) => { if (o.isMesh && o.visible) { o.visible = false; hidden.push(o); } });
  }
  let skinY = 0;
  const dummy = fromArt(art, 'makeDummy');
  if (dummy) {
    const d = dummy.mesh;
    d.scale.setScalar(ART);
    const ab = d.userData.abdomen || new THREE.Vector3(-0.5, 1.8, 0);
    d.position.set(-ab.x * ART, -ab.y * ART, -ab.z * ART); // abdomen skin centre -> world origin
    group.add(d);
  }
  // tissue field
  let pad = null, padTop, toLocal, scale = 1;
  const p = fromArt(art, 'makeTissuePad', { drape: false });
  if (p && p.mesh.userData && p.mesh.userData.width) {
    pad = p.mesh;
    scale = padW / pad.userData.width;
    pad.scale.setScalar(scale);
    pad.position.y = skinY;
    group.add(pad);
    padTop = skinY + pad.userData.surfaceY * scale;
    toLocal = (x, z) => [x / scale, z / scale];
  } else {
    pad = new THREE.Mesh(new THREE.BoxGeometry(padW, 0.6, padW * 0.66), new THREE.MeshStandardMaterial({ color: 0xe2b4a8, roughness: 0.6 }));
    pad.position.y = skinY + 0.3;
    group.add(pad);
    padTop = skinY + 0.6;
    toLocal = (x, z) => [x, z];
  }
  // drape with a window slightly smaller than the field, so the drape edge overlaps it
  if (dummy) {
    const padD = pad.userData && pad.userData.depth ? pad.userData.depth * scale : padW * 0.66;
    const dr = fromArt(art, 'makeDrapeWithWindow', 6, 5, (padW - 0.8) / ART, (padD - 0.8) / ART);
    if (dr) {
      dr.mesh.scale.setScalar(ART);
      dr.mesh.position.set(0, padTop - 0.12 * ART + 0.35, 0); // drape rim sits just above the field surface
      if (dr.prep) dr.prep.visible = false;
      if (dr.cavity) dr.cavity.visible = false;
      group.add(dr.mesh);
    }
  }
  return {
    pad, padTop, toLocal, scale,
    dispose() { for (const o of hidden) o.visible = true; },
  };
}
