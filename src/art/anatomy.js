// ANATOMY — procedural neighbouring anatomy for the open surgeries (game realism: natural colours, soft wet sheen, smooth
// shading, no gore). 1 unit = 10 cm, Y up. See docs/NOTES.md "ANATOMY:" for the API + placement recipes.
//   makeAbdomenSet(opts) — packed abdominal viscera, drape-window local (origin = window centre at skin level; head -X, patient right +Z)
//   makeThoraxSet(opts)  — ribs / intercostals / pleura / lung (setInflation) / heart hint / diaphragm, chest_tube.js frame
//   makeNeckSet(opts)    — IJV (setCompression) / carotid (update(t) pulse) / SCM / clavicle, central_line.js frame
import * as THREE from 'three';
import { tissueDetail } from './tex.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const capR = (u, a = 0.04, b = 0.04) => Math.sqrt(Math.max(0, Math.min(1, a > 0 ? u / a : 1, b > 0 ? (1 - u) / b : 1))); // round end caps

let _td = null;
const td = () => { try { return (_td ||= tissueDetail()); } catch (e) { return (_td = {}); } };
/** wet tissue material (one per part so highlight tints only that organ) */
function wet(color, o = {}) {
  const t = td();
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.roughness ?? 0.42, metalness: 0, envMapIntensity: o.env ?? 0.6,
    map: o.noMap ? null : t.map || null, normalMap: t.normal || null, normalScale: new THREE.Vector2(o.ns ?? 0.3, o.ns ?? 0.3),
    side: o.side ?? THREE.FrontSide, transparent: !!o.opacity, opacity: o.opacity ?? 1, depthWrite: o.opacity ? false : true });
  return m;
}
function shadowAll(o) { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }

/** Tube with variable radius rFn(u, angle) along a curve (u in [u0,u1]), parallel-transport frames, smooth seam. */
function tubeVar(curve, rFn, { segs = 120, rad = 22, u0 = 0, u1 = 1, squashY = 1 } = {}) {
  // parallel-transport frames over [u0,u1] (no Frenet flips, correct for sub-ranges)
  const Ts = [], Ns = [], Bs = [];
  for (let i = 0; i <= segs; i++) Ts.push(curve.getTangentAt(u0 + (u1 - u0) * i / segs).normalize());
  { const t = Ts[0], ax = Math.abs(t.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0); Ns.push(V(0, 0, 0).crossVectors(t, ax).normalize()); }
  for (let i = 1; i <= segs; i++) { const n = Ns[i - 1].clone(), a = Ts[i - 1], b = Ts[i], ax = V(0, 0, 0).crossVectors(a, b);
    const l = ax.length(); if (l > 1e-6) n.applyAxisAngle(ax.divideScalar(l), Math.acos(Math.min(1, Math.max(-1, a.dot(b)))));
    n.addScaledVector(b, -n.dot(b)).normalize(); Ns.push(n); }
  for (let i = 0; i <= segs; i++) Bs.push(V(0, 0, 0).crossVectors(Ts[i], Ns[i]));
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = u0 + (u1 - u0) * i / segs, P = curve.getPointAt(u);
    const N = Ns[i], B = Bs[i];
    for (let j = 0; j <= rad; j++) {
      const a = j / rad * Math.PI * 2, r = rFn(u, a);
      const dx = N.x * Math.cos(a) + B.x * Math.sin(a), dy = N.y * Math.cos(a) + B.y * Math.sin(a), dz = N.z * Math.cos(a) + B.z * Math.sin(a);
      pos.push(P.x + r * dx, P.y + r * dy * squashY, P.z + r * dz); uv.push(j / rad, u * curve.getLength() * 2);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) { const a = i * (rad + 1) + j, b = a + rad + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.attributes.normal; // weld seam normals
  for (let i = 0; i <= segs; i++) { const a = i * (rad + 1), b = a + rad; const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1; n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l); }
  return g;
}
const crv = (pts, closed = false) => new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : V(...p))), closed, 'centripetal');
/** deformed sphere: fn(v: Vector3 on unit sphere) -> mutates v */
function blob(fn, w = 48, h = 32) { const g = new THREE.SphereGeometry(1, w, h), p = g.attributes.position, v = V(0, 0, 0); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v); p.setXYZ(i, v.x, v.y, v.z); } g.computeVertexNormals(); return g; }

// ============================================================================================================ ABDOMEN
/**
 * makeAbdomenSet(opts) -> {group, parts, anchors, bounds, setHighlight(name|null), setOmentum(bool), update(t)}
 * Coordinates (group-local): origin = drape window centre at skin level (= dummy.userData.abdomen ≈ navel), head -X,
 * patient's right +Z, up +Y. Real adult proportions, compressed vertically by opts.flatten so the anterior organ
 * surfaces sit at y = opts.topY (default 0.03, just under the drape rim 0.12; cavity floor is at -0.06).
 * opts: {omentum=true, highlight=null|'appendix'|'gallbladder'|..., flatten=0.45, topY=0.03,
 *        center='navel'|'rlq'|'ruq'|'appendix'|'gallbladder' (that anchor is moved to x=z=0), kidneys=true, bladder=false}
 */
export function makeAbdomenSet(opts = {}) {
  const o = { omentum: true, highlight: null, flatten: 0.45, topY: 0.03, center: 'navel', kidneys: true, bladder: false, ...opts };
  const group = new THREE.Group(); group.name = 'AbdomenSet';
  const body = new THREE.Group(); group.add(body); // real-proportion coordinates (navel skin = 0)
  const parts = {}, A = {};
  const add = (name, mesh) => { mesh.name = name; body.add(mesh); parts[name] = mesh; return mesh; };

  // ---- posterior wall / retroperitoneum (a shallow bowl so there is never a void between loops)
  {
    const g = new THREE.PlaneGeometry(5.8, 3.0, 64, 36); g.rotateX(-Math.PI / 2); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, -1.15 + 0.45 * ss(1.0, 1.5, Math.abs(z)) - 0.6 * ss(2.0, 2.9, Math.abs(x + 0.2)) - 0.12 * Math.exp(-z * z * 4)); }
    g.translate(-0.2, 0, 0); g.computeVertexNormals();
    add('posteriorWall', new THREE.Mesh(g, wet(0x9a5650, { roughness: 0.55 })));
  }
  // ---- liver (RUQ): smooth wedge, dome above, sharp inferior edge, thin left lobe
  {
    const g = blob((v) => {
      const left = ss(0.6, -1.0, v.z), caud = ss(0.0, 1.0, v.x);
      const ty = v.y > 0 ? 0.62 : 0.3; v.y *= ty * (1 - 0.55 * left) * (1 - 0.65 * caud);
      v.x *= 0.95 * (1 - 0.25 * left); v.z *= 1.25;
    }, 64, 40);
    const m = add('liver', new THREE.Mesh(g, wet(0x6a2620, { roughness: 0.3, env: 0.8 })));
    m.position.set(-2.2, -0.55, 0.42); m.rotation.y = 0.32;
    A.liverEdge = V(-1.3, -0.5, 0.75);
  }
  // ---- gallbladder: pear under the liver, fundus peeking past the inferior edge
  {
    const prof = []; for (let i = 0; i <= 40; i++) { const t = i / 40; const r = 0.19 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.65) * (1 - 0.6 * ss(0.55, 1, t)) + 0.035 * ss(0.85, 1, t) * (1 - t + 0.05); prof.push(new THREE.Vector2(Math.max(r, 0.0005), 0.85 * t)); }
    const g = new THREE.LatheGeometry(prof, 32); g.rotateZ(Math.PI / 2); // fundus at +X... after rotate: lathe y -> -x
    const m = add('gallbladder', new THREE.Mesh(g, wet(0x5c7a38, { roughness: 0.28 })));
    m.scale.set(1, 0.8, 0.9); m.position.set(-1.0, -0.62, 0.78); m.rotation.y = -0.45;
    A.gallbladder = V(-1.12, -0.5, 0.82); A.ruq = A.gallbladder.clone();
    const duct = new THREE.Mesh(tubeVar(crv([[-1.8, -0.66, 0.42], [-1.95, -0.7, 0.25], [-1.9, -0.75, 0.05]]), () => 0.03, { segs: 30, rad: 10 }), wet(0xc2b45a, { roughness: 0.4 }));
    add('cysticDuct', duct);
  }
  // ---- stomach (LUQ) -> pylorus -> duodenum
  {
    const c = crv([[-2.85, -0.7, -0.95], [-2.35, -0.48, -0.95], [-1.8, -0.42, -0.7], [-1.45, -0.42, -0.25], [-1.55, -0.48, 0.15], [-1.75, -0.58, 0.32], [-1.65, -0.78, 0.55], [-1.2, -0.85, 0.6]]);
    const r = (u) => { const k = [[0, 0.3], [0.08, 0.44], [0.3, 0.4], [0.5, 0.32], [0.66, 0.2], [0.72, 0.11], [1, 0.1]]; let v = k[k.length - 1][1]; for (let i = 1; i < k.length; i++) if (u <= k[i][0]) { v = k[i - 1][1] + (k[i][1] - k[i - 1][1]) * ss(k[i - 1][0], k[i][0], u); break; } return v * capR(u, 0.05, 0.02); };
    add('stomach', new THREE.Mesh(tubeVar(c, (u, a) => r(u) * (1 + 0.025 * Math.sin(a * 5 + u * 40)), { segs: 140, rad: 28, squashY: 0.8 }), wet(0xd59a8a, { roughness: 0.36 })));
    A.stomach = V(-1.9, -0.1, -0.7); A.luq = A.stomach.clone();
  }
  // ---- colon frame: cecum -> ascending -> hepatic flexure -> transverse -> splenic flexure -> descending -> sigmoid -> rectum
  const colonPts = [[1.95, -0.6, 1.0], [1.65, -0.5, 1.15], [1.0, -0.52, 1.25], [0.0, -0.55, 1.28], [-1.0, -0.5, 1.22], [-1.45, -0.42, 1.0],
    [-1.25, -0.32, 0.55], [-0.85, -0.25, 0.0], [-1.15, -0.3, -0.6], [-1.85, -0.42, -1.05], [-2.05, -0.55, -1.32], [-1.4, -0.65, -1.4],
    [-0.2, -0.65, -1.38], [0.9, -0.62, -1.3], [1.45, -0.5, -1.0], [1.7, -0.38, -0.45], [1.45, -0.36, -0.05], [1.85, -0.5, 0.2], [2.4, -0.95, 0.05]];
  const colon = crv(colonPts);
  const L = colon.getLength(), uAt = (i) => { let d = 0; for (let k = 1; k <= i; k++) d += V(...colonPts[k]).distanceTo(V(...colonPts[k - 1])); return d; };
  const totalPoly = uAt(colonPts.length - 1), U = (i) => uAt(i) / totalPoly;
  const colR = (u, a) => {
    const s = u * L;
    let r = 0.25 + 0.07 * ss(U(2), 0, u) - 0.05 * ss(U(13), U(16), u);           // cecum widest, sigmoid narrower
    r *= 1 + 0.11 * Math.pow(Math.sin(Math.PI * s / 0.32), 2);                     // haustra
    for (const t of [0.5, 2.6, 4.7]) { const d = Math.atan2(Math.sin(a - t), Math.cos(a - t)); r *= 1 - 0.07 * Math.exp(-d * d / 0.02); } // taeniae grooves
    return r * capR(u, 0.025, 0.004);
  };
  const colMat = wet(0xcb8a74, { roughness: 0.4 });
  const seg = (name, i0, i1, extra = {}) => add(name, new THREE.Mesh(tubeVar(colon, colR, { u0: U(i0), u1: U(i1), segs: Math.max(16, Math.round((U(i1) - U(i0)) * 420)), rad: 26, ...extra }), extra.mat || colMat));
  seg('cecum', 0, 1, { mat: wet(0xcb8a74, { roughness: 0.4 }) });
  seg('ascendingColon', 1, 5); seg('transverseColon', 5, 9); seg('descendingColon', 9, 14); seg('sigmoid', 14, 18);
  A.cecum = colon.getPointAt(U(0) + 0.012).clone().add(V(0, 0.22, 0)); A.hepaticFlexure = V(...colonPts[5]); A.splenicFlexure = V(...colonPts[10]);
  // epiploic fat tags along the colon
  {
    const fat = wet(0xe6c36a, { roughness: 0.5 }), geo = new THREE.SphereGeometry(0.05, 10, 8), tags = new THREE.Group();
    for (let k = 0; k < 30; k++) { const u = 0.06 + 0.88 * k / 30, P = colon.getPointAt(u), T = colon.getTangentAt(u), side = V(-T.z, 0, T.x).normalize().multiplyScalar(k % 2 ? 1 : -1);
      const m = new THREE.Mesh(geo, fat); m.position.copy(P).addScaledVector(side, 0.2).add(V(0, 0.1, 0)); m.scale.set(1.1, 0.9, 1.6); m.lookAt(P.clone().add(T)); tags.add(m); }
    add('epiploicFat', tags);
  }
  // ---- appendix: from the cecal base (posteromedial), hanging toward the pelvis
  {
    const c = crv([[1.75, -0.5, 0.86], [1.98, -0.4, 0.66], [2.12, -0.38, 0.42], [2.2, -0.42, 0.2]]);
    add('appendix', new THREE.Mesh(tubeVar(c, (u) => 0.058 * (1 + 0.12 * ss(0.5, 0.9, u)) * capR(u, 0.0, 0.08), { segs: 50, rad: 16 }), wet(0xc6655a, { roughness: 0.32 })));
    const meso = []; const N = 18; for (let i = 0; i <= N; i++) { const t = i / N, P = c.getPointAt(t); meso.push(P, V(P.x - 0.15 * (1 - t) + 0.05, P.y - 0.08, P.z + 0.22 * (1 - 0.7 * t))); }
    const pos = [], idx = []; meso.forEach((p) => pos.push(p.x, p.y, p.z)); for (let i = 0; i < N; i++) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); mg.setIndex(idx); mg.computeVertexNormals();
    add('mesoappendix', new THREE.Mesh(mg, wet(0xdcb46c, { side: THREE.DoubleSide, roughness: 0.55, noMap: true })));
    A.appendixBase = c.getPointAt(0.05); A.appendixTip = c.getPointAt(1); A.appendix = c.getPointAt(0.5); A.rlq = A.appendixBase.clone();
    parts._appendixCurve = c;
  }
  // ---- small bowel: glossy loops packed in the centre (2 layers), terminal ileum into the cecum
  const bowelPts = [];
  {
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    bowelPts.push(V(-1.15, -0.85, -0.35), V(-0.85, -0.7, -0.6)); // duodenojejunal flexure, deep
    const rows = 7;
    for (let i = 0; i < rows; i++) { // upper layer, sweeping across (z)
      const x = -0.6 + i * 2.05 / (rows - 1), dir = i % 2 ? -1 : 1, zA = -0.92, zB = 0.82;
      for (let k = 0; k <= 4; k++) { const t = k / 4, z = dir > 0 ? zA + (zB - zA) * t : zB + (zA - zB) * t;
        bowelPts.push(V(x + 0.07 * Math.sin(t * 7 + i) + 0.03 * (rnd() - 0.5), -0.36 + 0.05 * Math.sin(t * 5 + i * 2), z)); }
    }
    for (let i = 0; i < 5; i++) { // deeper layer, sweeping along (x), back toward the head
      const z = 0.7 - i * 0.34, dir = i % 2 ? 1 : -1;
      for (let k = 0; k <= 4; k++) { const t = k / 4, x = dir < 0 ? 1.35 - 1.85 * t : -0.5 + 1.85 * t; bowelPts.push(V(x, -0.64 + 0.04 * Math.sin(t * 6 + i), z + 0.06 * Math.sin(t * 8 + i))); }
    }
    bowelPts.push(V(1.2, -0.55, 0.45), V(1.45, -0.5, 0.78), V(1.62, -0.5, 1.0)); // terminal ileum -> ileocecal valve
    const c = crv(bowelPts);
    add('smallBowel', new THREE.Mesh(tubeVar(c, (u, a) => 0.13 * (1 + 0.04 * Math.sin(u * 400)) * (1 - 0.15 * ss(0.94, 1, u)) * capR(u, 0.003, 0.0), { segs: 900, rad: 20 }), wet(0xdc958a, { roughness: 0.3, env: 0.75 })));
    parts._bowelCurve = c;
    A.smallBowel = V(0.4, -0.2, 0); A.terminalIleum = V(1.45, -0.5, 0.78);
  }
  // ---- greater omentum: thin lobulated fatty apron hanging from the transverse colon over the bowel
  {
    const samples = parts._bowelCurve.getSpacedPoints(700).concat(colon.getSpacedPoints(300));
    const top = (x, z) => { let y = -1; for (const p of samples) { const dx = p.x - x, dz = p.z - z, d2 = dx * dx + dz * dz; if (d2 < 0.06) y = Math.max(y, p.y + Math.sqrt(0.06 - d2) * 0.75); } return y; };
    const x0 = -1.05, x1 = 0.2, z0 = -1.1, z1 = 1.05, nx = 40, nz = 48;
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, top(x, z) + 0.035 + 0.012 * Math.sin(x * 23 + z * 9) * Math.sin(z * 17)); }
    // scalloped free edge: drop triangles below an undulating hem
    const hem = (z) => -0.05 + 0.1 * Math.sin(z * 4.3 + 0.5) + 0.04 * Math.sin(z * 11);
    const ix = g.index.array, keep = [];
    for (let t = 0; t < ix.length; t += 3) { let cx = 0, cz = 0; for (let k = 0; k < 3; k++) { cx += p.getX(ix[t + k]) / 3; cz += p.getZ(ix[t + k]) / 3; } if (cx < hem(cz) && Math.abs(cz) < 1.0 - 0.1 * ss(0.2, 0.8, cx)) keep.push(ix[t], ix[t + 1], ix[t + 2]); }
    g.setIndex(keep); g.computeVertexNormals();
    const m = add('omentum', new THREE.Mesh(g, wet(0xe4c070, { roughness: 0.5, side: THREE.DoubleSide, ns: 0.6 })));
    m.visible = !!o.omentum;
  }
  if (o.kidneys) for (const s of [1, -1]) {
    const k = add(s > 0 ? 'kidneyR' : 'kidneyL', new THREE.Mesh(blob((v) => { v.x *= 0.55; v.y *= 0.24; v.z *= 0.3; v.z -= s * 0.08 * Math.exp(-v.x * v.x * 20) * (v.z * s > 0 ? 1 : 0); }), wet(0x84362c, { roughness: 0.35 })));
    k.position.set(-1.25 + (s > 0 ? 0.15 : -0.05), -1.05, s * 0.85); k.rotation.y = s * 0.25;
  }
  if (o.kidneys) { parts.kidneys = [parts.kidneyR, parts.kidneyL]; }
  if (o.bladder) { const b = add('bladder', new THREE.Mesh(blob((v) => { v.multiplyScalar(0.36); v.y *= 0.6; }), wet(0xdbb0a0, { roughness: 0.35 }))); b.position.set(2.6, -1.0, 0); }

  shadowAll(body);
  // ---- fit: compress vertically, put the anterior surface at topY, recentre on the requested anchor
  body.scale.y = o.flatten; body.updateMatrixWorld(true);
  const bbAnt = new THREE.Box3(); for (const n of ['smallBowel', 'transverseColon', 'liver']) bbAnt.expandByObject(parts[n]);
  body.position.y = o.topY - bbAnt.max.y;
  const ctr = { navel: V(0, 0, 0), rlq: A.rlq, ruq: A.ruq, appendix: A.appendix, gallbladder: A.gallbladder, luq: A.luq }[o.center] || V(0, 0, 0);
  body.position.x = -ctr.x; body.position.z = -ctr.z;
  body.updateMatrix(); group.updateMatrixWorld(true);
  // keep the set inside the draped trunk: hide parts that ended up wholly outside the safe region after recentring
  // (the drape falls away past |z|≈1.2), and give the window its own posterior wall in group space
  // sink anything lateral of the drape's flat top (|z| > ~1.15 in group space) so it can never poke through the falling drape
  const sink = (x, z) => 1.6 * Math.max(ss(1.12, 1.5, Math.abs(z)), ss(2.7, 3.3, x));
  const tmp = V(0, 0, 0), inv = new THREE.Matrix4();
  body.traverse((m) => {
    if (!m.isMesh || m === parts.posteriorWall) return;
    const M = new THREE.Matrix4().copy(m.matrix); for (let q = m.parent; q && q !== body; q = q.parent) M.premultiply(q.matrix); M.premultiply(body.matrix);
    if (m.parent !== body) { tmp.setFromMatrixPosition(M); const d = sink(tmp.x, tmp.z); if (d > 0) m.position.y -= d / o.flatten; return; }
    inv.copy(M).invert(); const pa = m.geometry.attributes.position; let moved = false;
    for (let i = 0; i < pa.count; i++) { tmp.fromBufferAttribute(pa, i).applyMatrix4(M); const d = sink(tmp.x, tmp.z); if (d > 0) { tmp.y -= d; tmp.applyMatrix4(inv); pa.setXYZ(i, tmp.x, tmp.y, tmp.z); moved = true; } }
    if (moved) { pa.needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingBox(); m.geometry.computeBoundingSphere(); }
  });
  const SAFE = new THREE.Box3(V(-3.4, -9, -1.3), V(3.0, 9, 1.3));
  for (const [n, m] of Object.entries(parts)) { if (!m || !m.isObject3D || n === 'posteriorWall') continue; const bb = new THREE.Box3().setFromObject(m); if (!bb.isEmpty() && !bb.intersectsBox(SAFE)) m.visible = false; }
  if (o.center !== 'navel') {
    const w = parts.posteriorWall; w.removeFromParent(); const g = w.geometry; g.computeBoundingBox();
    w.position.set(0, 0, 0); group.add(w); w.scale.set(1, o.flatten, 1); w.position.y = body.position.y; w.updateMatrix();
  }
  const anchors = {}; for (const [k, p] of Object.entries(A)) anchors[k] = p.clone().applyMatrix4(body.matrix);
  const bounds = new THREE.Box3().setFromObject(body);
  // curves in group space (for surgeries that want to follow the appendix etc.)
  const curveIn = (c) => new THREE.CatmullRomCurve3(c.points.map((q) => q.clone().applyMatrix4(body.matrix)));
  parts.appendixCurve = curveIn(parts._appendixCurve); delete parts._appendixCurve; delete parts._bowelCurve;

  const base = new Map(); body.traverse((m) => { if (m.isMesh) base.set(m, m.material.emissive.getHex()); });
  function setHighlight(name) {
    for (const [m] of base) { m.material.emissive.setHex(0x000000); m.material.emissiveIntensity = 1; }
    const p = name && parts[name]; if (!p) return;
    p.traverse((m) => { if (m.isMesh) { m.material.emissive.setHex(0x5a3a10); m.material.emissiveIntensity = 0.55; } });
  }
  setHighlight(o.highlight);
  // gentle peristalsis / breathing shimmer (optional)
  function update(t) { if (parts.smallBowel) parts.smallBowel.scale.setScalar(1 + 0.004 * Math.sin(t * 1.3)); }
  group.userData = { kind: 'abdomenSet', anchors, bounds, flatten: o.flatten };
  return { group, parts, anchors, bounds, setHighlight, setOmentum: (v) => { parts.omentum.visible = !!v; }, update };
}

// ============================================================================================================ THORAX
/**
 * makeThoraxSet(opts) -> {group, parts:{ribs[], intercostals, chestWall, pleura, lung, heart, diaphragm}, setInflation(0..1), update(t), ribZ(k,x)}
 * Frame matches src/surgeries/chest_tube.js: skin at y=0 (place group at y=Y0), ribs run along X (−X anterior/pec,
 * +X posterior/lat), spaced along Z (−Z toward the axilla). opts: {side:'right'|'left', pitch=0.27, slope=-0.1, z5=-0.05,
 * ribDepth=0.1, chestWall=true (translucent soft tissue sheet, set false if the surgery draws its own skin), inflation=0}
 */
export function makeThoraxSet(opts = {}) {
  const o = { side: 'right', pitch: 0.27, slope: -0.1, z5: -0.05, ribDepth: 0.1, chestWall: true, inflation: 0, ...opts };
  const group = new THREE.Group(); group.name = 'ThoraxSet';
  const ribZ = (k, x) => o.z5 + (k - 5) * o.pitch + o.slope * x;
  const curveDepth = (x) => -o.ribDepth - 0.18 * x * x; // chest wall curves away from the field centre
  const parts = { ribs: [] };
  const bone = wet(0xe8dcc4, { roughness: 0.45, ns: 0.2 }), cart = wet(0xcfd6d2, { roughness: 0.3 });
  for (let k = 2; k <= 10; k++) {
    const pts = []; for (let i = 0; i <= 24; i++) { const x = -1.5 + 3.0 * i / 24; pts.push(V(x, curveDepth(x), ribZ(k, x))); }
    const c = crv(pts);
    // flattened bone (wider than deep), costal cartilage at the anterior end
    const g = tubeVar(c, (u) => 0.062 * capR(u, 0.01, 0.01), { segs: 80, rad: 16 });
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); const cy = curveDepth(x); p.setY(i, cy + (p.getY(i) - cy) * 0.6); } g.computeVertexNormals();
    const rib = new THREE.Mesh(g, x0Material(bone, cart)); rib.name = 'rib' + k; rib.userData.k = k; group.add(rib); parts.ribs.push(rib);
  }
  // intercostal muscles: striated sheet just under the ribs
  {
    const g = new THREE.PlaneGeometry(3.0, 3.0, 60, 60); g.rotateX(-Math.PI / 2); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, curveDepth(p.getX(i)) - 0.03);
    g.computeVertexNormals();
    const tex = stripeTex('#8c3b34', '#a24a40', 18);
    parts.intercostals = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 0.5, normalMap: td().normal || null, normalScale: new THREE.Vector2(0.3, 0.3) }));
    parts.intercostals.rotation.y = Math.atan(o.slope); parts.intercostals.name = 'intercostals'; group.add(parts.intercostals);
  }
  // parietal pleura: thin glossy translucent lining
  {
    const g = new THREE.PlaneGeometry(3.0, 3.0, 40, 40); g.rotateX(-Math.PI / 2); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, curveDepth(p.getX(i)) - 0.045);
    g.computeVertexNormals();
    parts.pleura = new THREE.Mesh(g, wet(0xe9d6d0, { roughness: 0.15, opacity: 0.35, side: THREE.DoubleSide, noMap: true, env: 1.0 })); parts.pleura.name = 'pleura'; group.add(parts.pleura);
  }
  // lung: spongy pink lobe whose surface sits against the pleura when expanded, shrinks medially/apically when collapsed
  {
    const g = blob((v) => { v.x *= 1.55; v.y *= 0.6; v.z *= 1.5; v.y += 0.12 * (v.x * v.x + v.z * v.z * 0.4) * (v.y > 0 ? -1 : 0); }, 64, 40);
    const lung = new THREE.Mesh(g, wet(0xe3a3a0, { roughness: 0.55, ns: 0.8 })); lung.name = 'lung';
    // fissure line
    const fis = new THREE.Mesh(tubeVar(crv([[-1.1, 0, 0.6], [-0.2, 0, 0.1], [0.9, 0, -0.5]]), () => 0.012, { segs: 40, rad: 6 }), wet(0xb0706e, { noMap: true })); lung.add(fis);
    group.add(lung); parts.lung = lung; parts._fis = fis;
  }
  // heart hint (deep, anterior-medial) + diaphragm dome (caudal, +Z)
  {
    const h = new THREE.Mesh(blob((v) => { v.multiplyScalar(0.55); v.y *= 0.75; v.x *= 1.1; v.z += 0.1 * v.x; }), wet(0x8e3a32, { roughness: 0.35 }));
    h.position.set(-1.45, -1.1, 0.45); h.name = 'heart'; group.add(h); parts.heart = h;
    if (o.side !== 'left') h.material.opacity = 0.0, h.visible = false; // heart only shows through on the left
    const d = new THREE.Mesh(blob((v) => { v.x *= 1.6; v.z *= 0.9; v.y = v.y > 0 ? v.y * 0.45 : v.y * 0.05; }), wet(0xa0453c, { roughness: 0.4, ns: 0.6 }));
    d.position.set(0, -1.25, ribZ(10, 0) + 0.75); d.name = 'diaphragm'; group.add(d); parts.diaphragm = d;
  }
  if (o.chestWall) {
    const g = new THREE.PlaneGeometry(3.0, 3.0, 40, 40); g.rotateX(-Math.PI / 2); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, curveDepth(p.getX(i)) * 0.4 - 0.005);
    g.computeVertexNormals();
    parts.chestWall = new THREE.Mesh(g, wet(0xb87068, { roughness: 0.5, opacity: 0.28, side: THREE.DoubleSide })); parts.chestWall.name = 'chestWall'; group.add(parts.chestWall);
  }
  let infl = 0;
  function setInflation(t) {
    infl = Math.min(1, Math.max(0, t)); const e = ss(0, 1, infl);
    const L = parts.lung, s = 0.55 + 0.45 * e;
    L.scale.set(s * 0.95, 0.5 + 0.5 * e, s);
    // expanded: lung surface touches the pleura (top at curveDepth(0)-0.05); collapsed: retracts ~4 cm deep + medial/apical
    const top = curveDepth(0) - 0.05 - (1 - e) * 0.42;
    L.position.set(-0.25 * (1 - e), top - 0.7 * L.scale.y, -0.1 - 0.3 * (1 - e));
    L.material.color.setHex(e > 0.5 ? 0xe6a6a2 : 0xc98a88).lerp(new THREE.Color(0xe6a6a2), e);
  }
  setInflation(o.inflation);
  if (o.side === 'left') group.scale.x = 1; // anterior stays -X in the chest_tube frame for either side (the surgery mirrors the camera)
  shadowAll(group);
  if (parts.pleura) parts.pleura.castShadow = false; if (parts.chestWall) parts.chestWall.castShadow = false;
  const update = (t) => { if (parts.heart.visible) parts.heart.scale.setScalar(1 + 0.03 * Math.max(0, Math.sin(t * 7.5))); parts.lung.scale.y *= 1; };
  group.userData = { kind: 'thoraxSet', ribZ };
  return { group, parts, setInflation, get inflation() { return infl; }, update, ribZ };
}
function x0Material(bone) { return bone; }
function stripeTex(a, b, n) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = a; x.fillRect(0, 0, 256, 256); x.strokeStyle = b; x.lineWidth = 3;
  for (let i = -256; i < 512; i += 256 / n) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 140, 256); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); return t;
}

// ============================================================================================================ NECK
/**
 * makeNeckSet(opts) -> {group, parts:{ijv, carotid, scm, clavicle, thyroid}, setCompression(0..1), update(t)}
 * Frame matches src/surgeries/central_line.js: skin at y=0 (place group at y=skinY, x/z at the field centre C),
 * vessels run along X (−X cranial, +X toward the clavicle at x≈1.08), +Z lateral. IJV at z=+0.06, depth 0.14
 * (oval 7.2x5 mm radii); carotid at z=−0.08, depth 0.175, r 0.04. opts: {vein:{z,d,rx,ry}, artery:{z,d,r} in mm, scm=true}
 */
export function makeNeckSet(opts = {}) {
  const MM = 0.01;
  const vein = { z: 6, d: 14, rx: 7.2, ry: 5.0, ...(opts.vein || {}) }, art = { z: -8, d: 17.5, r: 4.0, ...(opts.artery || {}) };
  const group = new THREE.Group(); group.name = 'NeckSet';
  const parts = {};
  const path = (z, d, bend = 0.03) => crv([[-1.15, -d, z - bend], [-0.4, -d, z], [0.4, -d, z + bend * 0.5], [1.1, -d - 0.04, z + bend * 1.5]]);
  // IJV: thin-walled oval, compressible (flattens vertically, widens slightly)
  const vc = path(vein.z * MM, vein.d * MM, 0.02);
  const ijv = new THREE.Mesh(tubeVar(vc, (u, a) => vein.rx * MM * capR(u, 0.01, 0.01) * Math.sqrt(1 / (Math.cos(a) ** 2 + (vein.rx / vein.ry * Math.sin(a)) ** 2)), { segs: 80, rad: 24 }),
    wet(0x4a3f78, { roughness: 0.3, env: 0.8, noMap: true }));
  ijv.name = 'ijv'; group.add(ijv); parts.ijv = ijv;
  // carotid: round, thick-walled, pulsing
  const ac = path(art.z * MM, art.d * MM, -0.015);
  const carotid = new THREE.Mesh(tubeVar(ac, (u) => art.r * MM * capR(u, 0.01, 0.01), { segs: 80, rad: 20 }), wet(0xb83a3a, { roughness: 0.3, env: 0.8, noMap: true }));
  carotid.name = 'carotid'; group.add(carotid); parts.carotid = carotid;
  // SCM: two heads (sternal medial, clavicular lateral) converging cranially over the vessels
  if (opts.scm !== false) {
    const scm = new THREE.Group(); scm.name = 'scm';
    const mm = new THREE.MeshStandardMaterial({ color: 0xffffff, map: stripeTex('#9a3e36', '#ad5146', 10), roughness: 0.5, normalMap: td().normal || null, normalScale: new THREE.Vector2(0.3, 0.3) });
    const head = (pts, w) => { const c = crv(pts); const g = tubeVar(c, (u) => w * (0.7 + 0.3 * Math.sin(Math.PI * u)) * capR(u, 0.03, 0.03), { segs: 60, rad: 18, squashY: 0.35 }); return new THREE.Mesh(g, mm); };
    scm.add(head([[-1.2, -0.06, 0.0], [-0.3, -0.06, -0.02], [0.05, -0.065, -0.04], [0.55, -0.07, -0.22], [1.0, -0.08, -0.42]], 0.12));  // sternal head
    scm.add(head([[-1.2, -0.06, 0.02], [-0.3, -0.06, 0.05], [0.05, -0.065, 0.08], [0.55, -0.07, 0.28], [1.0, -0.08, 0.5]], 0.11));    // clavicular head
    group.add(scm); parts.scm = scm;
  }
  // clavicle: S-curved bone across the base of the field
  {
    const c = crv([[1.12, -0.06, -0.75], [1.05, -0.05, -0.2], [1.08, -0.055, 0.3], [1.15, -0.07, 0.75]]);
    const cl = new THREE.Mesh(tubeVar(c, (u) => 0.075 * capR(u, 0.03, 0.03) * (1 + 0.25 * ss(0.7, 1, u)), { segs: 60, rad: 18 }), wet(0xe8dcc4, { roughness: 0.45, ns: 0.2 }));
    cl.name = 'clavicle'; group.add(cl); parts.clavicle = cl;
  }
  // thyroid lobe hint (medial) + deep muscle bed so the vessels never float
  {
    const th = new THREE.Mesh(blob((v) => { v.x *= 0.28; v.y *= 0.08; v.z *= 0.12; }), wet(0x9b4a40, { roughness: 0.4 })); th.position.set(-0.25, -0.17, -0.24); th.name = 'thyroid'; group.add(th); parts.thyroid = th;
    const g = new THREE.PlaneGeometry(2.6, 1.8, 20, 20); g.rotateX(-Math.PI / 2); g.translate(0, -0.25, 0);
    const bed = new THREE.Mesh(g, wet(0x8a3c36, { roughness: 0.6 })); bed.name = 'deepBed'; group.add(bed); parts.deepBed = bed;
  }
  shadowAll(group);
  const ijvBase = { y: ijv.position.y };
  let comp = 0;
  function setCompression(t) {
    comp = Math.min(1, Math.max(0, t));
    const sy = 1 - 0.85 * comp; ijv.scale.set(1, sy, 1 + 0.25 * comp);
    // scale about the vein axis (axis at y = -d)
    ijv.position.y = ijvBase.y - vein.d * MM * (1 - sy);
    ijv.position.z = -(vein.z * MM) * 0.25 * comp;
  }
  function update(t) {
    const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 1.2)), 3);
    const s = 1 + 0.08 * beat, cy = -art.d * MM, cz = art.z * MM;
    carotid.scale.set(1, s, s); carotid.position.set(0, cy * (1 - s), cz * (1 - s));
  }
  group.userData = { kind: 'neckSet', vein, artery: art };
  return { group, parts, setCompression, get compression() { return comp; }, update };
}
