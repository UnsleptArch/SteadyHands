// CORE — engine: renderer, camera, OR scene, input (pointer -> work plane, tremor, steady), level lifecycle, events.
import * as THREE from 'three';
import { buildRoom, makeEnvironment } from './room.js';
import { stubLevel } from './stub.js';

export const LEVEL_IDS = ['incision', 'suture', 'lap'];
export const SURGERY_IDS = ['appendectomy', 'laceration'];
const levelPath = (id) => (SURGERY_IDS.includes(id) ? `../surgeries/${id}.js` : `../levels/${id}.js`);
const DEFAULT_MM = 0.01; // ART convention: 1 unit = 10 cm

// Smooth 1D noise: sum of incommensurate sines with random phases (cheap, deterministic per session).
function makeNoise(seed) {
  const f = [1.7, 3.1, 5.3, 8.9, 13.7];
  const a = [0.45, 0.28, 0.15, 0.08, 0.04];
  const p = f.map((_, i) => (Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453) % 6.283);
  return (t) => f.reduce((s, fi, i) => s + a[i] * Math.sin(t * fi + p[i]), 0);
}

export function createEngine(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07090c);
  scene.fog = new THREE.Fog(0x07090c, 14, 40);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 120);
  const camHome = { pos: new THREE.Vector3(0, 6.0, 4.9), target: new THREE.Vector3(0, 0, 0) };
  const CAM_DEFAULT = { pos: camHome.pos.clone(), target: camHome.target.clone() };
  camera.position.copy(camHome.pos);
  camera.lookAt(camHome.target);

  const clock = new THREE.Clock();
  const events = new EventTarget();
  const art = opts.art || {};
  const room = buildRoom(scene, art);
  if (!scene.environment) { try { scene.environment = makeEnvironment(renderer); } catch (err) { console.warn('[core] env map failed', err); } }

  // ---------- input ----------
  const input = {
    pointer: { x: 0, y: 0, ndcX: 0, ndcY: 0, down: false },
    keys: new Set(),
    steady: false,
    focus: 1,
    world: new THREE.Vector3(),
    worldRaw: new THREE.Vector3(),
    tremor: { x: 0, z: 0 },
    tremorAmp: 0,
  };
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  let botPointer = null;
  let botDown = null;

  function setPointer(e) {
    const r = canvas.getBoundingClientRect();
    input.pointer.x = e.clientX - r.left;
    input.pointer.y = e.clientY - r.top;
    input.pointer.ndcX = (input.pointer.x / r.width) * 2 - 1;
    input.pointer.ndcY = -(input.pointer.y / r.height) * 2 + 1;
  }
  canvas.addEventListener('pointermove', setPointer);
  canvas.addEventListener('pointerdown', (e) => {
    setPointer(e);
    if (e.button === 0) input.pointer.down = true;
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  });
  window.addEventListener('pointerup', (e) => { if (e.button === 0) input.pointer.down = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    input.keys.add(e.code);
    if (e.code === 'Space' && engine.currentLevel) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); input.pointer.down = false; });

  // Tremor model, shared by all drills. Amplitudes in MILLIMETRES, converted with engine.MM (world units per mm).
  const nx = makeNoise(Math.random() * 100), nz = makeNoise(Math.random() * 100 + 50);
  const TREMOR = { normal: 1.6, steady: 0.3, drain: 0.28, regen: 0.14 };

  function updateInput(dt, t) {
    const wantSteady = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    if (wantSteady && input.focus > 0) {
      input.focus = Math.max(0, input.focus - TREMOR.drain * dt);
      input.steady = input.focus > 0;
    } else {
      input.steady = false;
      input.focus = Math.min(1, input.focus + TREMOR.regen * dt);
    }
    const target = input.steady ? TREMOR.steady : TREMOR.normal;
    input.tremorAmp += (target - input.tremorAmp) * Math.min(1, dt * 8);
    const amp = engine.botNoTremor && botPointer ? 0 : input.tremorAmp * engine.tremorScale * engine.MM;
    input.tremorMm = input.tremorAmp * engine.tremorScale;
    input.tremor.x = nx(t * 1.9) * amp;
    input.tremor.z = nz(t * 1.9) * amp;

    if (botPointer) {
      input.worldRaw.copy(botPointer);
      // keep screen-space pointer coherent for UI that reads it
      const p = botPointer.clone().project(camera);
      input.pointer.ndcX = p.x; input.pointer.ndcY = p.y;
    } else {
      ndc.set(input.pointer.ndcX, input.pointer.ndcY);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(plane, hit)) input.worldRaw.copy(hit);
    }
    if (botDown !== null) input.pointer.down = botDown;
    input.world.set(input.worldRaw.x + input.tremor.x, input.worldRaw.y, input.worldRaw.z + input.tremor.z);
  }

  // ---------- engine object ----------
  const tickFns = new Set();
  const engine = {
    THREE, scene, camera, renderer, clock, input, events, art, room, raycaster,
    MM: DEFAULT_MM,
    LEVEL_IDS, SURGERY_IDS,
    levels: {},          // id -> level module (meta: id,title,brief) once loaded
    currentLevel: null,  // {id, title, module, controller}
    paused: false,
    tremorScale: 1,
    botNoTremor: false,
    status: { level: null, progress: 0, hint: '', metrics: null, grade: null, done: false, error: null },
    onTick(fn) { tickFns.add(fn); return () => tickFns.delete(fn); },
    emit(type, detail = {}) { events.dispatchEvent(new CustomEvent(type, { detail })); },
    on(type, fn) { const h = (e) => fn(e.detail, e); events.addEventListener(type, h); return () => events.removeEventListener(type, h); },
    setWorkPlane(y) { plane.constant = -y; },
    setBotPointer(v) { botPointer = v ? v.clone() : null; },
    setBotDown(b) { botDown = b === null || b === undefined ? null : !!b; if (botDown === null) input.pointer.down = false; },
    setPaused(b) { engine.paused = !!b; engine.emit('pause', { paused: engine.paused }); },
    setCameraHome(pos, target) { if (pos) camHome.pos.copy(pos); if (target) camHome.target.copy(target); engine.resetCamera(); },
    resetCamera() { camera.position.copy(camHome.pos); camera.lookAt(camHome.target); },
    /** project a world point to screen pixels (for UI overlays) */
    toScreen(v) {
      const p = v.clone().project(camera); const r = canvas.getBoundingClientRect();
      return { x: (p.x + 1) / 2 * r.width, y: (1 - p.y) / 2 * r.height };
    },
    loadLevel, unloadLevel, getLevelModule,
  };

  events.addEventListener('level:progress', (e) => {
    const d = e.detail || {};
    if (typeof d.pct === 'number') engine.status.progress = d.pct;
    if (d.hint !== undefined) engine.status.hint = d.hint;
  });
  events.addEventListener('level:score', (e) => {
    const d = e.detail || {};
    engine.status.metrics = d.metrics || null;
    engine.status.grade = d.grade || null;
    engine.status.done = true;
    engine.status.progress = Math.max(engine.status.progress, 1);
  });

  // ---------- levels ----------
  async function getLevelModule(id) {
    if (engine.levels[id]) return engine.levels[id];
    let mod;
    try {
      mod = (await import(levelPath(id))).default;
      if (!mod || typeof mod.setup !== 'function') throw new Error(`level ${id} has no setup()`);
    } catch (err) {
      console.warn(`[core] level "${id}" unavailable, using stub:`, err.message);
      return stubLevel(id); // not cached: retried on next load
    }
    engine.levels[id] = mod;
    return mod;
  }

  let loadToken = 0;
  async function loadLevel(id) {
    const token = ++loadToken;
    unloadLevel();
    const mod = await getLevelModule(id);
    if (token !== loadToken) return null;
    plane.constant = 0;
    camHome.pos.copy(CAM_DEFAULT.pos); camHome.target.copy(CAM_DEFAULT.target); engine.resetCamera();
    engine.tremorScale = 1;
    // drills in src/levels are authored at 1 unit = 1 cm; ART/surgeries at 1 unit = 10 cm
    engine.MM = typeof mod.MM === 'number' ? mod.MM : (LEVEL_IDS.includes(id) ? 0.1 : DEFAULT_MM);
    engine.botNoTremor = false;
    botPointer = null; botDown = null;
    input.focus = 1;
    Object.assign(engine.status, { level: id, progress: 0, hint: '', metrics: null, grade: null, done: false, error: null });
    const before = new Set(scene.children);
    let controller;
    try {
      controller = mod.setup(engine, art) || {};
    } catch (err) {
      console.error(`[core] level ${id} setup failed`, err);
      engine.status.error = String(err && err.message || err);
      showError(`Level "${id}" failed to start: ${engine.status.error}`);
      const stub = stubLevel(id);
      controller = stub.setup(engine, art);
    }
    const added = scene.children.filter((c) => !before.has(c) && c !== room.group);
    engine.currentLevel = { id, title: mod.title || id, module: mod, controller, added };
    engine.paused = false;
    clock.getDelta();
    engine.emit('level:start', { id });
    return engine.currentLevel;
  }

  function unloadLevel() {
    const cur = engine.currentLevel;
    if (!cur) return;
    engine.currentLevel = null;
    try { cur.controller && cur.controller.dispose && cur.controller.dispose(); } catch (err) { console.error('[core] dispose failed', err); }
    // safety net: remove objects the level added during setup
    for (const o of cur.added) if (o.parent) o.parent.remove(o);
    botPointer = null; botDown = null; input.pointer.down = false;
    plane.constant = 0;
    camHome.pos.copy(CAM_DEFAULT.pos); camHome.target.copy(CAM_DEFAULT.target); engine.resetCamera();
    engine.status.level = null;
    engine.emit('level:end', { id: cur.id });
  }

  // ---------- loop ----------
  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let errCount = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    updateInput(engine.paused ? 0 : dt, t);
    const cur = engine.currentLevel;
    if (cur && !engine.paused && cur.controller && cur.controller.update) {
      try { cur.controller.update(dt, input); }
      catch (err) {
        if (errCount++ < 3) { console.error('[core] level update error', err); showError(`Level error: ${err.message}`); }
      }
    }
    room.update && room.update(dt, t);
    for (const fn of tickFns) { try { fn(dt, t, input); } catch (err) { if (errCount++ < 3) console.error(err); } }
    renderer.render(scene, camera);
  });

  return engine;
}

export function showError(msg) {
  let el = document.getElementById('core-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'core-error';
    el.style.cssText = 'position:fixed;left:12px;bottom:12px;max-width:560px;z-index:9999;background:#2a1215;color:#ffd7d7;' +
      'border:1px solid #7a2a32;border-radius:6px;padding:8px 12px;font:13px/1.4 Inter,system-ui,sans-serif;white-space:pre-wrap;cursor:pointer';
    el.title = 'click to dismiss';
    el.onclick = () => el.remove();
    document.body.appendChild(el);
  }
  el.textContent = msg;
}
