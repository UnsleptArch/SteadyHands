// PATIENT — supine adult patient on the OR table, prepped and draped (game-quality realism, no gore).
// makePatient() returns the same shape as the old makeDummy(): Group with userData {abdomen, skinY, torsoHalfWidth, rightForearm, kind}.
// Head at -X, feet at +X, patient's right side at +Z, table pad top at y=0.2, abdominal skin at y=1.8 (x=-0.5).
//
// Draping: when a makeDrapeWithWindow() mesh is placed next to the patient (as the surgeries do), the patient
// swaps that flat drape *surface* for a body-conforming one (same fabric material, same window, same hem,
// prep, cavity and screen bar — those children are untouched), so the body contour, legs, feet tent,
// anaesthesia screen and draped arm boards read through the cloth.
import * as THREE from 'three';
import { valueNoise, skinDetail } from './tex.js';

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** smooth piecewise interpolation through [x, y] keys (smoothstep between keys, clamped ends) */
const curve = (keys) => (x) => {
  if (x <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [x1, y1] = keys[i];
    if (x <= x1) { const [x0, y0] = keys[i - 1]; return y0 + (y1 - y0) * ss(x0, x1, x); }
  }
  return keys[keys.length - 1][1];
};

const PAD = 0.2, SKIN_Y = 1.8, NAVEL_X = -0.5;
// --- body proportions (1 unit = 10 cm; ~1.75 m adult; navel -> crown 7.2, navel -> heel 10.6)
const torsoTop = curve([[-5.3, 0.95], [-4.75, 1.25], [-4.3, 1.62], [-3.4, 1.98], [-2.6, 2.02], [-1.9, 1.9], [-1.2, 1.82], [NAVEL_X, 1.8],
  [0.4, 1.76], [1.3, 1.66], [2.1, 1.5], [2.9, 1.15], [3.6, 0.6]]);
const torsoHW = curve([[-5.3, 0.55], [-4.85, 0.62], [-4.45, 1.85], [-3.9, 2.08], [-3.0, 1.95], [-2.1, 1.72], [-1.2, 1.55], [NAVEL_X, 1.58],
  [0.6, 1.7], [1.5, 1.82], [2.3, 1.78], [3.1, 1.45], [3.6, 1.2]]);
const legR = curve([[2.3, 0.6], [3.2, 0.64], [4.4, 0.6], [6.5, 0.46], [7.0, 0.45], [8.1, 0.44], [9.6, 0.27]]);
const legZ = curve([[2.3, 0.88], [6.6, 0.68], [9.8, 0.78]]);
const TOE_X = 10.15, TOE_TOP = 2.05;
// superellipse cross-section falloff: 1 on the centreline, 0 at the edge (flat back, rounded flanks)
const prof = (u) => (u >= 1 ? 0 : Math.pow(1 - Math.pow(u, 3.5), 0.55));
// draped falloff: same flat top, but the sheet eases onto the pad (no vertical flank)
const dprof = (u) => 1 - ss(0.5, 1.0, u);

/** height of the (undraped) body surface at (x, z), dummy-local; PAD where there is no body */
function bodyY(x, z) {
  const az = Math.abs(z);
  let y = PAD;
  if (x > -5.4 && x < 3.7) y = Math.max(y, PAD + (torsoTop(x) - PAD) * prof(az / torsoHW(x)));
  if (x > 2.0 && x < 9.9) {
    const r = legR(x), zc = legZ(x);
    y = Math.max(y, PAD + 2 * r * prof(Math.abs(az - zc) / r));
  }
  return y;
}

/** drape height (dummy-local) over the body; win = {cx, cy, cz, w, h} window (cy = skin level under the drape origin) */
function drapeY(x, z, win, noise) {
  const az = Math.abs(z);
  const lift = 0.13;                          // drape thickness + slack over skin
  let y = PAD + 0.03;
  // torso (with lateral slack: the sheet bridges from the flank down to the pad)
  if (x > -5.6 && x < 3.9) {
    const hw = torsoHW(x) + 0.7;
    y = Math.max(y, PAD + 0.03 + (torsoTop(x) + lift - PAD - 0.03) * dprof(az / hw));
  }
  // legs + the sheet bridging the gap between them (sags a little)
  if (x > 2.0) {
    const r = legR(Math.min(x, 9.6)), zc = legZ(Math.min(x, 9.8)), top = PAD + 2 * r + lift;
    const leg = PAD + 0.03 + (top - PAD - 0.03) * dprof(Math.max(0, Math.abs(az - zc) - 0.05) / (r + 0.6));
    const bridge = az < zc ? top - 0.22 * (1 - Math.pow(az / zc, 2)) * ss(2.6, 4.2, x) : 0;
    let legsY = Math.max(leg, bridge);
    // feet: toes point up and tent the sheet; it runs straight from the shins up to the toes, then drops off the end
    const toeLat = Math.pow(prof(Math.max(0, az - zc + 0.1) / 1.05), 0.6);
    const tent = x <= TOE_X ? PAD + 0.03 + (TOE_TOP - PAD) * Math.pow(ss(7.0, TOE_X, x), 1.35) * toeLat
      : PAD + 0.03 + (TOE_TOP - PAD) * (1 - ss(TOE_X, TOE_X + 0.9, x)) * toeLat;
    legsY = Math.max(legsY, tent);
    y = Math.max(y, x < 3.9 ? legsY : legsY);
  }
  // reinforced flat panel around the fenestration, blended into the contour
  const dx = Math.max(0, Math.abs(x - win.cx) - win.w / 2), dz = Math.max(0, Math.abs(z - win.cz) - win.h / 2), dist = Math.hypot(dx, dz);
  const rimY = win.cy + 0.145, k = 1 - ss(0.12, 0.75, dist);
  y = y * (1 - k) + rimY * k;
  // soft folds away from the window
  const n = noise(x * 0.55 + 3, z * 0.9 + 7), r1 = 1 - Math.abs(2 * n - 1);
  const n2 = noise(x * 0.22 + 11, z * 0.45 + 2), r2 = 1 - Math.abs(2 * n2 - 1);
  y += 0.07 * ss(0.2, 1.5, dist) * (r1 * r1 + 0.6 * r2 * r2);
  // hang over the table sides and the foot end
  y = Math.max(-3.6, y - 2.6 * ss(3.5, 3.95, az) - 7 * Math.max(0, az - 3.8));
  y = Math.max(-3.6, y - 2.6 * ss(11.0, 11.5, x) - 7 * Math.max(0, x - 11.35));
  // anaesthesia screen: sheet runs up from the chest, over the bar, and drops a little behind it
  const bx = win.bx, by = win.by + 0.06;
  if (x < bx + 0.9) {
    const up = Math.pow(ss(bx + 0.9, bx + 0.02, x), 0.6);
    y = y * (1 - up) + by * up;
    if (x < bx) y = by - 1.6 * ss(bx, bx - 0.4, x);
    y += 0.12 * Math.max(0, Math.min(1, (bx + 0.9 - x) / 0.9)) * (r1 - 0.5) * (1 - ss(3.3, 4.1, az)); // vertical folds
  }
  return y;
}

/** heightfield sheet with a rectangular hole (window centred at mesh origin) */
function buildSheet({ x0, x1, z0, z1, nx, nz, fn, winW, winH, mat }) {
  const pos = [], uv = [], idx = [], W = x1 - x0, D = z1 - z0;
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    let x = x0 + W * i / nx, z = z0 + D * j / nz;
    if (Math.abs(Math.abs(x) - winW / 2) < W / nx * 0.5) x = Math.sign(x) * winW / 2;
    if (Math.abs(Math.abs(z) - winH / 2) < D / nz * 0.5) z = Math.sign(z) * winH / 2;
    pos.push(x, fn(x, z), z); uv.push(x * 1.6, z * 1.6);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    const cx = (pos[a * 3] + pos[d * 3]) / 2, cz = (pos[a * 3 + 2] + pos[d * 3 + 2]) / 2;
    if (Math.abs(cx) < winW / 2 && Math.abs(cz) < winH / 2) continue;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
  return m;
}

const mats = {};
const skinMat = () => mats.skin ||= (() => {
  const d = skinDetail(), nm = d.normal.clone(); nm.needsUpdate = true; nm.wrapS = nm.wrapT = THREE.RepeatWrapping; nm.repeat.set(3, 3);
  return new THREE.MeshStandardMaterial({ color: 0xd09c80, normalMap: nm, normalScale: new THREE.Vector2(0.06, 0.06), roughness: 0.6, metalness: 0, envMapIntensity: 0.5 });
})();
const std = (k, color, o = {}) => mats[k] ||= new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });
const fallbackDrape = () => std('drape', 0x3e6e8e, { roughness: 0.93 });

/** limb segment as a smooth capsule between two points */
function limb(a, b, r0, r1, mat) {
  const len = a.distanceTo(b), pts = [];
  const N = 14;
  for (let i = 0; i <= N; i++) { const t = i / N, ang = -Math.PI / 2 + Math.PI * t; pts.push(new THREE.Vector2(Math.cos(ang) * r0, Math.sin(ang) * r0 - len / 2)); }
  pts.length = 0; // build a tapered profile: bottom cap (r0) -> shaft -> top cap (r1)
  for (let i = 0; i <= 8; i++) { const ang = -Math.PI / 2 + (Math.PI / 2) * i / 8; pts.push(new THREE.Vector2(Math.cos(ang) * r0, -len / 2 + Math.sin(ang) * r0 + r0 * 0)); }
  for (let i = 0; i <= 8; i++) { const ang = (Math.PI / 2) * i / 8; pts.push(new THREE.Vector2(Math.cos(ang) * r1, len / 2 + Math.sin(ang) * r1)); }
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), mat);
  m.position.copy(a).lerp(b, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

/** palm-up hand at the wrist point w, fingers pointing along dir (unit, in XZ) */
function makeHand(sz, mat) {
  const h = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat); palm.scale.set(0.42, 0.16, 0.5); palm.position.set(0, 0, 0.42); h.add(palm);
  const fl = [0.36, 0.42, 0.4, 0.32], fx = [-0.24, -0.08, 0.08, 0.23];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, fl[i], 4, 10), mat); f.rotation.x = Math.PI / 2 - 0.12;
    f.position.set(fx[i] * sz, 0.02, 0.86 + fl[i] / 2); h.add(f);
  }
  const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 10), mat); th.rotation.set(Math.PI / 2, 0, -sz * 0.75);
  th.position.set(-0.4 * sz, 0.04, 0.55); h.add(th);
  return h;
}

export function makePatient() {
  const g = new THREE.Group(); g.name = 'Dummy';
  // ---------------- OR table
  const tableSteel = std('tableSteel', 0xaab2ba, { metalness: 1, roughness: 0.32 });
  const padMat = std('pad', 0x1d2328, { roughness: 0.6 });
  const table = new THREE.Mesh(new THREE.BoxGeometry(22, 0.3, 7), tableSteel); table.position.y = -0.15; g.add(table);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(21.6, 0.2, 6.4), padMat); pad.position.y = 0.1; g.add(pad);
  for (const x of [-8, 8]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 6, 20), tableSteel); leg.position.set(x, -3.3, 0); g.add(leg); }
  const base = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 3), std('base', 0x2a2f34, { roughness: 0.7 })); base.position.y = -6.4; g.add(base);
  // arm boards (arms abducted ~80°)
  const ARM_X = -3.55;
  for (const s of [-1, 1]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 5.2), padMat); board.position.set(ARM_X, 0.09, s * 5.7); g.add(board);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 5.0), tableSteel); rail.position.set(ARM_X, -0.1, s * 5.6); g.add(rail);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 12), tableSteel); post.position.set(ARM_X, -1.4, s * 7.6); g.add(post);
  }
  // ---------------- body (smooth heightfield shell for torso + legs; mostly under the drape)
  const body = buildSheet({ x0: -5.3, x1: 9.9, z0: -2.15, z1: 2.15, nx: 150, nz: 60, fn: (x, z) => bodyY(x, z) - 0.002, winW: 0, winH: 0, mat: skinMat() });
  body.name = 'body'; g.add(body);
  // feet (toes up)
  for (const s of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.1, 6, 16), skinMat());
    foot.position.set(TOE_X - 0.15, PAD + 1.0, s * 0.8); foot.rotation.z = 0.12; foot.scale.set(0.9, 1, 1.15); g.add(foot);
  }
  // head on a gel head ring, neck
  const head = new THREE.Group(); head.position.set(-6.45, 1.12, 0); g.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), skinMat()); skull.scale.set(1.0, 0.92, 0.78); head.add(skull);
  const face = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), skinMat()); face.scale.set(0.62, 0.55, 0.6); face.position.set(0.42, 0.3, 0); head.add(face);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), skinMat()); nose.scale.set(1.3, 1.1, 0.8); nose.position.set(0.3, 0.93, 0); head.add(nose);
  for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skinMat()); ear.scale.set(1, 1.2, 0.5); ear.position.set(-0.05, 0.05, s * 0.78); head.add(ear); }
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1.04, 36, 24, 0, Math.PI * 2, 0, Math.PI * 0.55), std('cap', 0x5f8fb6, { roughness: 0.95 }));
  cap.scale.set(1.0, 0.94, 0.8); cap.rotation.z = Math.PI / 2 + 0.35; cap.position.x = -0.12; head.add(cap);
  // endotracheal tube + tape (anaesthetised)
  const ett = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.62, 0.82, 0.08), new THREE.Vector3(0.68, 1.12, 0.1), new THREE.Vector3(0.3, 1.3, 0.22), new THREE.Vector3(-1.3, 1.15, 0.5)]), 24, 0.04, 8),
    std('ett', 0xe8eef2, { roughness: 0.25, transparent: true, opacity: 0.85 })); head.add(ett);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.18, 12, 28), std('gel', 0x2b6c86, { roughness: 0.35 })); ring.rotation.x = Math.PI / 2; ring.position.set(-6.6, 0.38, 0); g.add(ring);
  const neck = limb(new THREE.Vector3(-5.9, 0.95, 0), new THREE.Vector3(-4.8, 0.95, 0), 0.5, 0.55, skinMat()); neck.scale.set(1, 1, 1); g.add(neck);
  // arms on the boards (skin), hands palm-up
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Vector3(ARM_X - 0.1, 1.05, s * 1.75), el = new THREE.Vector3(ARM_X + 0.05, 0.62, s * 4.5), wr = new THREE.Vector3(ARM_X + 0.1, 0.52, s * 6.75);
    g.add(limb(sh, el, 0.5, 0.42, skinMat()), limb(el, wr, 0.38, 0.29, skinMat()));
    const hand = makeHand(s, skinMat()); hand.position.copy(wr).add(new THREE.Vector3(0, -0.08, 0)); hand.rotation.y = s > 0 ? 0 : Math.PI; g.add(hand);
    arms.push({ s, sh, el, wr, hand });
  }
  // monitoring: pulse-oximeter clip on the left index finger, IV cannula + line on the right wrist
  const L = arms.find((a) => a.s < 0), R = arms.find((a) => a.s > 0);
  const ox = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.34), std('ox', 0x3a8fd0, { roughness: 0.45 })); ox.position.copy(L.wr).add(new THREE.Vector3(0.08, 0.02, -1.1)); g.add(ox);
  const oxCable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([ox.position.clone(), ox.position.clone().add(new THREE.Vector3(-0.6, -0.1, -0.6)), new THREE.Vector3(ARM_X - 1.6, 0.25, -7.6)]), 20, 0.025, 6), std('cable', 0x30353a)); g.add(oxCable);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 0.5), std('tape', 0xf1f1ec, { roughness: 0.8 })); tape.position.copy(R.wr).add(new THREE.Vector3(0, 0.3, -0.35)); g.add(tape);
  const iv = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([tape.position.clone(), tape.position.clone().add(new THREE.Vector3(-0.4, 0.15, 0.3)), new THREE.Vector3(ARM_X - 1.5, 1.4, 8.2), new THREE.Vector3(ARM_X - 1.8, 6, 8.6)]), 30, 0.03, 6),
    std('ivline', 0xe6f0f4, { roughness: 0.2, transparent: true, opacity: 0.7 })); g.add(iv);

  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

  // ---------------- drapes: built when the surgery's fenestrated drape appears next to the patient
  const abdomen = new THREE.Vector3(NAVEL_X, SKIN_Y, 0);
  const noise = valueNoise(91, 64);
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  let draped = false, tries = 0;
  const armDrapes = (mat) => {
    for (const a of arms) {
      // arm wrapped in a sheet up to the wrist, sheet tucked over the board edges
      const sleeve = limb(a.sh.clone().add(new THREE.Vector3(0, 0.08, -a.s * 0.15)), a.wr.clone().add(new THREE.Vector3(0, 0.02, -a.s * 0.15)), 0.62, 0.48, mat);
      { // soft wrinkles along the wrapped sheet
        const pa = sleeve.geometry.attributes.position;
        for (let i = 0; i < pa.count; i++) {
          const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), ang = Math.atan2(z, x);
          const w = 1 + 0.045 * Math.sin(y * 3.1 + 2.0 * Math.sin(ang * 2)) + 0.03 * Math.sin(ang * 5 + y * 1.3) + 0.04 * (noise(y * 0.8 + 5, ang * 1.5 + 9) - 0.5);
          pa.setX(i, x * w); pa.setZ(i, z * w);
        }
        sleeve.geometry.computeVertexNormals();
      }
      sleeve.scale.set(1.12, 1, 0.86); sleeve.name = 'armDrape'; g.add(sleeve);
      const tuck = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 4.6), mat); tuck.position.set(ARM_X, 0.24, a.s * 5.15); g.add(tuck);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.07, 8, 24), mat); cuff.position.copy(a.wr).add(new THREE.Vector3(0, 0.02, -a.s * 0.18)); cuff.rotation.y = 0; g.add(cuff);
    }
  };
  const drapeUp = (found) => {
    draped = true;
    const mat = (found && found.material && found.material.isMaterial) ? found.material : fallbackDrape();
    let win = { cx: abdomen.x, cy: abdomen.y + 0.03, cz: 0, w: 2.8, h: 2.2 };
    if (found) {
      g.updateWorldMatrix(true, false); found.updateWorldMatrix(true, false);
      const p = g.worldToLocal(found.getWorldPosition(new THREE.Vector3()));
      const prep = found.userData.prep, gp = prep && prep.geometry && prep.geometry.parameters;
      win = { cx: p.x, cy: p.y, cz: p.z, w: gp ? gp.width - 0.08 : 2.8, h: gp ? gp.height - 0.08 : 2.2 };
      found.material = hidden; found.castShadow = false;   // keep its hem, prep, cavity and screen bar
      found.userData.patientDraped = true;
    }
    win.bx = win.cx - 4.75; win.by = win.cy + 2.98;
    const sheet = buildSheet({ x0: win.bx - 0.4 - win.cx, x1: 11.9 - win.cx, z0: -4.25 - win.cz, z1: 4.25 - win.cz, nx: 300, nz: 136,
      fn: (x, z) => drapeY(x + win.cx, z + win.cz, win, noise) - win.cy, winW: win.w, winH: win.h, mat });
    sheet.name = 'patientDrape'; sheet.position.set(win.cx, win.cy, win.cz); g.add(sheet);
    armDrapes(mat);
    body.visible = false; // fully covered; skip drawing it
  };
  // sentinel: zero-area mesh whose onBeforeRender looks for the window drape once the scene is assembled
  const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  const sentinel = new THREE.Mesh(sgeo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  sentinel.frustumCulled = false; sentinel.name = 'patientSentinel';
  sentinel.onBeforeRender = (renderer, scene) => {
    if (draped) return;
    if (++tries > 600) { draped = true; return; } // nothing to conform to: leave the body bare
    const ab = g.localToWorld(abdomen.clone());
    let found = null;
    scene.traverse((o) => { if (!found && o.name === 'DrapeWindow' && !o.userData.patientDraped && o.getWorldPosition(new THREE.Vector3()).distanceTo(ab) < 1.0) found = o; });
    if (found) drapeUp(found);
  };
  g.add(sentinel);

  g.userData = {
    abdomen, skinY: SKIN_Y, torsoHalfWidth: 1.5, rightForearm: R.wr.clone().lerp(R.el, 0.3), kind: 'dummy',
    drape: () => { if (!draped) drapeUp(null); }, // optional: drape without a window drape present
  };
  return g;
}
