// CORE — free camera: a user OFFSET (orbit / pan / zoom) layered on top of whatever pose the level sets.
// Levels keep full control of the base framing. Each frame (just before render) we check whether the level/tick code
// moved the camera since we last applied the offset; if so that pose becomes the new base. Then base + offset -> final.
// Raycasts in the next frame's input update therefore use the final (visible) camera.
import * as THREE from 'three';

const PITCH_MIN = 0.14, PITCH_MAX = 1.45;           // elevation of camera above the target (rad) — never under the table
const ZOOM_MIN = Math.log(0.4), ZOOM_MAX = Math.log(3.2); // distance multiplier vs. level framing
const PAN_MAX = 1.6;                                // pan, in multiples of the base view distance
const KEY_CONFLICT = new Set(['central_line']);     // levels that use Q/E/WASD themselves

const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

export function createFreeCam(engine) {
  const { camera, input } = engine;
  const tgt = { yaw: 0, pitch: 0, zoom: 0, px: 0, pz: 0 };
  const cur = { yaw: 0, pitch: 0, zoom: 0, px: 0, pz: 0 };
  const base = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), target: new THREE.Vector3(), dist: 1, el: 0.8, az: 0, valid: false };
  const finalPos = new THREE.Vector3(), finalQuat = new THREE.Quaternion();
  let applied = false, rightDown = false, lastX = 0, lastY = 0, tween = null;
  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3();

  const enabled = () => !!engine.currentLevel && !engine.paused && engine.freeCam !== false;
  const keysAllowed = () => {
    if (!enabled()) return false;
    const cl = engine.currentLevel;
    if (cl.module && cl.module.cameraKeys === false) return false;
    if (KEY_CONFLICT.has(cl.id) && !(cl.module && cl.module.cameraKeys === true)) return false;
    const a = document.activeElement;
    return !(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable));
  };
  const isCanvas = (el) => el === engine.renderer.domElement;

  // ---- mouse: right-drag orbit, wheel zoom only while right button held ----
  window.addEventListener('pointerdown', (e) => {
    if (e.button !== 2 || !enabled() || !isCanvas(e.target)) return;
    rightDown = true; lastX = e.clientX; lastY = e.clientY;
  }, true);
  window.addEventListener('pointermove', (e) => {
    if (!rightDown) return;
    if (!(e.buttons & 2)) { rightDown = false; return; }
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    tgt.yaw -= dx * 0.006;
    tgt.pitch += dy * 0.005;
    tween = null;
  }, true);
  window.addEventListener('pointerup', (e) => { if (e.button === 2) rightDown = false; }, true);
  window.addEventListener('blur', () => { rightDown = false; });
  window.addEventListener('contextmenu', (e) => { if (engine.currentLevel && isCanvas(e.target)) e.preventDefault(); });
  window.addEventListener('wheel', (e) => {
    if (!rightDown || !enabled()) return; // plain wheel belongs to the level
    e.preventDefault();
    e.stopImmediatePropagation();
    tgt.zoom += Math.sign(e.deltaY) * 0.12;
    tween = null;
  }, { capture: true, passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyC' && keysAllowed() && !e.ctrlKey && !e.metaKey) api.reset();
  });

  function clampTargets() {
    // pitch offset is clamped so absolute elevation stays in range
    tgt.pitch = THREE.MathUtils.clamp(tgt.pitch, PITCH_MIN - base.el, PITCH_MAX - base.el);
    // ART-scale scenes (1 unit = 10 cm): allow zooming out to ~2.4 m so the whole OR is visible
    // loose clamp here; the absolute distance limit is applied in update() (base framing can change over time)
    tgt.zoom = THREE.MathUtils.clamp(tgt.zoom, ZOOM_MIN, Math.log(40));
    tgt.px = THREE.MathUtils.clamp(tgt.px, -PAN_MAX, PAN_MAX);
    tgt.pz = THREE.MathUtils.clamp(tgt.pz, -PAN_MAX, PAN_MAX);
  }

  function captureBase() {
    base.pos.copy(camera.position);
    base.quat.copy(camera.quaternion);
    camera.getWorldDirection(fwd);
    // look-at target: where the view axis meets the work plane (fallback: a point ahead at the camera's height scale)
    const planeY = engine.workPlaneY ? engine.workPlaneY() : 0;
    let d = fwd.y < -0.05 ? (planeY - base.pos.y) / fwd.y : 0;
    if (!(d > 0) || d > 1e4) d = Math.max(1e-3, base.pos.length());
    base.dist = d;
    base.target.copy(base.pos).addScaledVector(fwd, d);
    tmp.copy(base.pos).sub(base.target).divideScalar(d);
    base.el = Math.asin(THREE.MathUtils.clamp(tmp.y, -1, 1));
    base.az = Math.atan2(tmp.x, tmp.z);
    base.valid = true;
  }

  function update(dt) {
    // did the level / ticks move the camera since our last application? -> new base framing
    if (!applied || !camera.position.equals(finalPos) || !camera.quaternion.equals(finalQuat)) captureBase();

    if (!engine.currentLevel) { // menus: no user offset
      for (const k in tgt) tgt[k] = cur[k] = 0;
      applied = false; return;
    }

    if (keysAllowed() && !tween) {
      const k = input.keys, sp = 0.9 * dt;
      const ax = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      const az = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
      const zz = (k.has('KeyQ') ? 1 : 0) - (k.has('KeyE') ? 1 : 0);
      const scale = Math.exp(cur.zoom);
      tgt.px += ax * sp * scale; tgt.pz += az * sp * scale; tgt.zoom += zz * 1.1 * dt;
    }

    if (tween) {
      tween.t += dt;
      const u = ease(Math.min(1, tween.t / tween.dur));
      for (const k in tween.to) tgt[k] = cur[k] = tween.from[k] + (tween.to[k] - tween.from[k]) * u;
      if (tween.t >= tween.dur) { const r = tween.resolve; tween = null; r(api.get()); }
    }
    clampTargets();
    const a = 1 - Math.exp(-dt * 10);
    for (const k in cur) cur[k] += (tgt[k] - cur[k]) * a;

    const idle = Math.abs(cur.yaw) + Math.abs(cur.pitch) + Math.abs(cur.zoom) + Math.abs(cur.px) + Math.abs(cur.pz) < 1e-4;
    if (idle) { camera.position.copy(base.pos); camera.quaternion.copy(base.quat); }
    else {
      const azm = base.az + cur.yaw;
      const el = THREE.MathUtils.clamp(base.el + cur.pitch, PITCH_MIN, PITCH_MAX);
      // max zoom-out: 3.2x the level framing, or ~2.4 m in ART-scale scenes (1 unit = 10 cm) so the whole OR shows
      const rMax = Math.max(base.dist * Math.exp(ZOOM_MAX), engine.MM <= 0.011 ? 24 : 0);
      const r = Math.min(base.dist * Math.exp(cur.zoom), rMax);
      const right = tmp.set(Math.cos(azm), 0, -Math.sin(azm));
      const target = new THREE.Vector3().copy(base.target)
        .addScaledVector(right, cur.px * base.dist)
        .add(new THREE.Vector3(-Math.sin(azm), 0, -Math.cos(azm)).multiplyScalar(cur.pz * base.dist));
      camera.position.set(
        target.x + r * Math.sin(azm) * Math.cos(el),
        target.y + r * Math.sin(el),
        target.z + r * Math.cos(azm) * Math.cos(el));
      camera.up.set(0, 1, 0);
      camera.lookAt(target);
    }
    camera.updateMatrixWorld();
    finalPos.copy(camera.position); finalQuat.copy(camera.quaternion);
    applied = true;
  }

  const api = {
    /** back to the level's framing; snap=true jumps instantly */
    reset(snap = false) {
      tween = null;
      for (const k in tgt) { tgt[k] = 0; if (snap) cur[k] = 0; }
      return api.get();
    },
    /** {yaw, pitch (rad offsets), dist (multiplier, 1 = level framing), pan:[x,z] (fractions of view distance)} */
    set(o = {}, snap = false) {
      tween = null;
      if (typeof o.yaw === 'number') tgt.yaw = o.yaw;
      if (typeof o.pitch === 'number') tgt.pitch = o.pitch;
      if (typeof o.dist === 'number' && o.dist > 0) tgt.zoom = Math.log(o.dist);
      if (Array.isArray(o.pan)) { tgt.px = +o.pan[0] || 0; tgt.pz = +o.pan[1] || 0; }
      clampTargets();
      if (snap) Object.assign(cur, tgt);
      return api.get();
    },
    get() {
      return { yaw: tgt.yaw, pitch: tgt.pitch, dist: Math.exp(tgt.zoom), pan: [tgt.px, tgt.pz], baseDistance: base.dist };
    },
    /** eased move to {yaw,pitch,dist,pan} over `seconds`; resolves when done */
    orbitTo(o = {}, seconds = 2) {
      const to = {};
      if (typeof o.yaw === 'number') to.yaw = o.yaw;
      if (typeof o.pitch === 'number') to.pitch = o.pitch;
      if (typeof o.dist === 'number' && o.dist > 0) to.zoom = Math.log(o.dist);
      if (Array.isArray(o.pan)) { to.px = +o.pan[0] || 0; to.pz = +o.pan[1] || 0; }
      if (tween) tween.resolve(api.get());
      return new Promise((resolve) => {
        const from = {}; for (const k in to) from[k] = cur[k];
        tween = { from, to, t: 0, dur: Math.max(0.01, seconds), resolve };
      });
    },
    update,
  };
  return api;
}
