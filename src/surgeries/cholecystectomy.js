// SURGERY — Laparoscopic Cholecystectomy: "Critical View of Safety".
// OR wide shot (draped patient with 4 trocars) -> laparoscopic monitor view inside the abdomen (scope light, circular
// vignette). Instruments pivot at their ports: the FULCRUM EFFECT mirrors the hand (tip = centre - K*(hand - centre)).
// Steps: retract (fundus cephalad + neck lateral, traction gauge) -> hook dissection of Calot's triangle + cystic plate
//        -> CVS time-out (3 criteria + identify the cystic duct; CBD decoy = critical) -> clip 2+1 on duct and artery,
//        then cut between -> detach from the liver bed and extract through the port.
import * as THREE from 'three';
import { createSurgery, MM } from './steps.js';
import { makeRing, polyline, closestOnPolyline } from '../levels/_common.js';

const ID = 'cholecystectomy';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CAV = V(0, -40, 0);         // the abdominal cavity lives far below the OR, enclosed in its own dome
const PLANE = 0.06;               // local height of the interaction plane (structure tops)
const K = 0.85;                   // fulcrum gain (as in the lap drill)
const CUT = 0.47;                 // cut parameter along duct/artery (0 = gallbladder end)
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function call(art, name, ...a) {
  try { return typeof art[name] === 'function' ? art[name](...a) : null; } catch (e) { console.warn('[chole] art.' + name, e); return null; }
}

// ---------------------------------------------------------------- materials
let _tn = null;
function tissueNormal() {
  if (_tn) return _tn;
  const N = 128, h = new Float32Array(N * N);
  let s = 12345; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 18; k++) {
    const fx = 1 + ((r() * 9) | 0), fy = 1 + ((r() * 9) | 0), ph = r() * 6.283, a = 1 / (fx + fy);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] += a * Math.sin(6.283 * (fx * x + fy * y * (k % 2 ? 1 : -1)) / N + ph);
  }
  for (let i = 0; i < N * N; i++) h[i] += (r() - 0.5) * 0.06;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (h[y * N + ((x + 1) % N)] - h[y * N + ((x + N - 1) % N)]) * 3, dy = (h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x]) * 3;
    const l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  _tn = new THREE.CanvasTexture(c); _tn.wrapS = _tn.wrapT = THREE.RepeatWrapping; _tn.repeat.set(3, 3);
  return _tn;
}
const wet = (color, roughness = 0.36, extra = {}) => new THREE.MeshStandardMaterial({
  color, roughness, metalness: 0, normalMap: tissueNormal(), normalScale: new THREE.Vector2(0.55, 0.55), envMapIntensity: 0.25, ...extra,
});
const steelMat = () => new THREE.MeshStandardMaterial({ color: 0xc4ccd3, metalness: 0.9, roughness: 0.28, envMapIntensity: 0.6 });
const blackMat = () => new THREE.MeshStandardMaterial({ color: 0x15181c, metalness: 0.2, roughness: 0.45, envMapIntensity: 0.4 });

function tubeAlong(curve, r, mat, seg = 40, radial = 12) { return new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, radial, false), mat); }
function subCurve(curve, a, b, n = 16) { const pts = []; for (let i = 0; i <= n; i++) pts.push(curve.getPoint(a + (b - a) * i / n)); return new THREE.CatmullRomCurve3(pts); }
function cylZ(r0, r1, len, mat, z0 = 0, radial = 14) {
  const geo = new THREE.CylinderGeometry(r1, r0, len, radial); geo.rotateX(Math.PI / 2); geo.translate(0, 0, z0 + len / 2);
  return new THREE.Mesh(geo, mat);
}

// ---------------------------------------------------------------- instruments (tip at origin, shaft toward +Z)
function makeHook() {
  const g = new THREE.Group();
  g.add(cylZ(0.006, 0.006, 0.07, steelMat(), 0, 8));
  const bend = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 8), steelMat()); bend.position.set(0, -0.013, 0.002); g.add(bend);
  g.add(cylZ(0.022, 0.024, 3, blackMat(), 0.07, 16));
  g.setOpen = () => {};
  return g;
}
function makeClipper() {
  const g = new THREE.Group();
  g.add(cylZ(0.026, 0.026, 3, steelMat(), 0.09, 16));
  const jaws = [];
  for (const s of [-1, 1]) {
    const p = new THREE.Group(); p.position.z = 0.09;
    const j = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.014, 0.09), steelMat()); j.position.set(s * 0.012, 0, -0.045); p.add(j);
    p.userData.s = s; jaws.push(p); g.add(p);
  }
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.05), new THREE.MeshStandardMaterial({ color: 0xd6cba4, metalness: 0.9, roughness: 0.25 }));
  clip.position.z = 0.03; g.add(clip); g.userData.clip = clip;
  g.setOpen = (t) => { for (const j of jaws) j.rotation.y = j.userData.s * t * 0.22; };
  return g;
}
function makeScissors() {
  const g = new THREE.Group();
  g.add(cylZ(0.024, 0.024, 3, blackMat(), 0.08, 16));
  const blades = [];
  for (const s of [-1, 1]) {
    const p = new THREE.Group(); p.position.z = 0.08;
    const geo = new THREE.BoxGeometry(0.006, 0.016, 0.08); const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) { const z = pa.getZ(i); if (z < 0) pa.setY(i, pa.getY(i) * 0.35); pa.setX(i, pa.getX(i) + 0.02 * (z + 0.04) ** 2 * 6); }
    const b = new THREE.Mesh(geo, steelMat()); b.position.set(s * 0.004, 0, -0.04); p.add(b);
    p.userData.s = s; blades.push(p); g.add(p);
  }
  g.setOpen = (t) => { for (const b of blades) b.rotation.y = b.userData.s * t * 0.3; };
  return g;
}

export default {
  id: ID,
  title: 'Laparoscopic Cholecystectomy',
  MM,
  brief: 'Remove the gallbladder through keyhole ports while watching a camera monitor. Instruments pivot at the port, so the tip moves OPPOSITE to your hand (fulcrum effect). ' +
    'Retract, dissect Calot\'s triangle, prove the Critical View of Safety before you clip, clip 2+1 and cut, then extract. Mistaking the common bile duct for the cystic duct is the classic disaster.',

  setup(engine, art) {
    const { scene } = engine;
    const cam = engine.camera;
    const group = new THREE.Group(); group.name = 'surgery-cholecystectomy'; scene.add(group);

    // ================================================================ OR (intro / outro wide shot)
    let dummy = call(art, 'makeDummy');
    if (dummy && !dummy.isObject3D) dummy = dummy.mesh;
    let abdomen, skinY;
    if (dummy) { dummy.position.y = 0.03; group.add(dummy); abdomen = dummy.userData.abdomen.clone().add(V(0, 0.03, 0)); skinY = dummy.userData.skinY + 0.03; }
    else {
      const torso = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 3), new THREE.MeshStandardMaterial({ color: 0xcfc4b3, roughness: 0.8 })); torso.position.set(-1, 0.83, 0); group.add(torso);
      abdomen = V(-0.5, 1.83, 0); skinY = 1.83;
    }
    const dr = call(art, 'makeDrapeWithWindow', 6, 5, 2.8, 2.2);
    let prepY = skinY + 0.12;
    if (dr && dr.mesh) {
      dr.mesh.position.copy(abdomen); group.add(dr.mesh);
      const prep = dr.prep || dr.mesh.userData.prep;
      if (prep) prepY = abdomen.y + prep.position.y;
    }
    const C = V(abdomen.x, prepY, abdomen.z);
    // trocars: umbilical camera port + epigastric + two right subcostal
    for (const [dx, dz, r] of [[0.9, 0, 0.07], [-0.9, -0.1, 0.06], [-0.55, 0.75, 0.035], [-0.1, 0.85, 0.035]]) {
      const t = new THREE.Group();
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.5, 16), steelMat()); sleeve.position.y = 0.2; t.add(sleeve);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(r * 2.1, r * 1.8, 0.16, 18), blackMat()); head.position.y = 0.45; t.add(head);
      t.position.set(C.x + dx, prepY, C.z + dz); t.rotation.set(dz * 0.25, 0, -dx * 0.08); group.add(t);
    }
    let monitor = call(art, 'makeVitalsMonitor');
    if (monitor && monitor.mesh) { monitor.mesh.position.set(C.x - 2.5, prepY - 2.3, C.z - 2.2); monitor.mesh.rotation.y = 0.5; group.add(monitor.mesh); }
    else monitor = null;

    // ================================================================ the abdominal cavity (laparoscopic view)
    const cav = new THREE.Group(); cav.position.copy(CAV); group.add(cav);
    const W = (p) => p.clone().add(CAV); // local -> world
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 40, 24), wet(0x8a4a44, 0.55, { side: THREE.BackSide }));
    dome.scale.set(1, 0.75, 1); cav.add(dome);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), wet(0xb98a6a, 0.6)); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.09; cav.add(floor);
    // omentum / duodenum / colon hints at the bottom of the frame
    const omMat = wet(0xd9b26a, 0.42);
    for (let i = 0; i < 26; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), omMat);
      const x = -1.3 + (i % 13) * 0.2 + (i > 12 ? 0.1 : 0), z = 0.85 + (i > 12 ? 0.22 : 0) + 0.04 * Math.sin(i * 2.1);
      b.scale.set(0.14, 0.06, 0.12); b.position.set(x, -0.04, z); cav.add(b);
    }
    cav.add(tubeAlong(new THREE.CatmullRomCurve3([V(0.55, -0.02, 1.2), V(0.75, -0.0, 0.62), V(1.05, -0.02, 0.3), V(1.5, -0.04, 0.2)]), 0.16, wet(0xd59a86, 0.4), 40, 18)); // duodenum
    // shared ANATOMY set (stomach, bowel, colon, omentum) as the surrounding field, if available; our own interactive
    // liver/gallbladder/ducts stay on top. Patient frame (head -X, right +Z) -> lap view (head = screen top, right = screen left).
    const decor = cav.children.slice(2); // omentum blobs + duodenum (fallback scenery)
    let anatomySet = null, disposedA = false;
    import('../art/anatomy.js').then((m) => {
      if (disposedA || !m || typeof m.makeAbdomenSet !== 'function') return;
      const set = m.makeAbdomenSet({ center: 'gallbladder', omentum: true, highlight: null });
      for (const k of ['gallbladder', 'liver']) if (set.parts[k]) set.parts[k].visible = false;
      set.group.rotation.y = -Math.PI / 2; set.group.position.set(-0.3, -0.24, -0.05);
      if (set.setOmentum) set.setOmentum(false);
      cav.add(set.group); anatomySet = set;
      for (const d of decor) d.visible = false;
      floor.position.y = -0.4;
    }).catch((e) => console.warn('[chole] anatomy set unavailable', e && e.message));
    // liver (right lobe, underside edge toward the camera)
    const liverGeo = new THREE.SphereGeometry(1, 56, 30);
    { const pa = liverGeo.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i); pa.setY(i, y > 0 ? y : y * 0.35); pa.setZ(i, z + 0.08 * Math.sin(x * 3)); } liverGeo.computeVertexNormals(); }
    const liver = new THREE.Mesh(liverGeo, wet(0x6e2622, 0.3)); liver.scale.set(1.75, 0.3, 0.62); liver.position.set(-0.1, 0.04, -0.78); cav.add(liver);
    const liver2 = new THREE.Mesh(liverGeo, wet(0x6a2420, 0.3)); liver2.scale.set(0.9, 0.24, 0.5); liver2.position.set(1.15, 0.0, -0.7); cav.add(liver2);
    // scope light (follows the camera) + soft fill
    const scopeLight = new THREE.PointLight(0xfff3e6, 5.5, 0, 2); cav.add(scopeLight);
    const fill = new THREE.HemisphereLight(0xffe6dc, 0x4a2020, 0.35); cav.add(fill);

    // ---------------- gallbladder + biliary tree (rebuilt when the gallbladder is moved)
    const F0 = V(-0.58, 0.14, -0.02), F1 = V(-0.40, 0.40, -0.60);
    const N0 = V(0.0, 0.11, 0.20), N1 = V(-0.26, 0.10, 0.30);
    const J = V(0.43, 0.02, 0.30);
    const A0 = V(0.33, 0.045, -0.11);
    const cbdCurve = new THREE.CatmullRomCurve3([V(0.36, 0.0, -0.6), V(0.41, 0.02, -0.15), J.clone(), V(0.47, 0.0, 0.8), V(0.5, -0.03, 1.2)]);
    const gbMat = wet(0x5d7a3c, 0.26), ductMat = wet(0xd8c47c, 0.32), artMat = wet(0xb4434a, 0.3, { emissive: 0x000000 }), cbdMat = wet(0xd8dcb4, 0.3);
    ductMat.emissive = new THREE.Color(0); cbdMat.emissive = new THREE.Color(0);
    const cbd = tubeAlong(cbdCurve, 0.042, cbdMat, 50, 16); cav.add(cbd);
    cav.add(tubeAlong(new THREE.CatmullRomCurve3([V(0.85, -0.04, 0.05), V(0.43, -0.03, -0.08), A0.clone()]), 0.017, artMat, 24, 10)); // right hepatic a.
    const gbR = (t) => Math.max(0.004, 0.15 * Math.sqrt(Math.sin(Math.min(1, t / 0.22) * Math.PI / 2)) * (1 - 0.62 * ss(0.45, 1, t)));
    const spec = new THREE.Group(); cav.add(spec); // specimen: gallbladder + distal stumps + distal clips
    const gbMesh = new THREE.Mesh(new THREE.BufferGeometry(), gbMat); spec.add(gbMesh);
    const neckCap = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), gbMat); spec.add(neckCap);
    const st = { F: F0.clone(), N: N0.clone(), gbCurve: null, duct: null, artery: null, cutDuct: false, cutArt: false };
    const pieces = { ductD: null, ductP: null, artD: null, artP: null };
    const gbAt = (t) => st.gbCurve.getPoint(t);
    function gbCurveFor(F, N) {
      const A = F.clone().lerp(N, 0.3); A.y += 0.03; const M = F.clone().lerp(N, 0.65); M.y += 0.02;
      return new THREE.CatmullRomCurve3([F.clone(), A, M, N.clone()]);
    }
    function ductCurveFor(N) {
      const a = N.clone().lerp(J, 0.35).add(V(0, 0.02, 0.035)), b = N.clone().lerp(J, 0.7).add(V(0, 0.015, 0.02));
      return new THREE.CatmullRomCurve3([N.clone(), a, b, J.clone()]);
    }
    function arteryCurveFor(gb) {
      const p = gb.getPoint(0.72); const G = p.clone().add(V(gbR(0.72) * 0.85, -0.02, 0));
      return new THREE.CatmullRomCurve3([G, G.clone().lerp(A0, 0.4).add(V(0, 0.02, -0.04)), G.clone().lerp(A0, 0.75).add(V(0, 0.01, -0.02)), A0.clone()]);
    }
    function rebuild() {
      st.gbCurve = gbCurveFor(st.F, st.N);
      const TS = 40, RS = 22;
      const geo = new THREE.TubeGeometry(st.gbCurve, TS, 1, RS, false);
      const pa = geo.attributes.position, P = new THREE.Vector3();
      for (let i = 0; i <= TS; i++) {
        const t = i / TS; st.gbCurve.getPointAt(t, P); const r = gbR(t);
        for (let j = 0; j <= RS; j++) {
          const k = i * (RS + 1) + j;
          pa.setXYZ(k, P.x + (pa.getX(k) - P.x) * r, P.y + (pa.getY(k) - P.y) * r * 0.8, P.z + (pa.getZ(k) - P.z) * r);
        }
      }
      geo.computeVertexNormals();
      gbMesh.geometry.dispose(); gbMesh.geometry = geo;
      neckCap.position.copy(st.N); neckCap.scale.setScalar(gbR(1) * 1.05);
      st.duct = ductCurveFor(st.N); st.artery = arteryCurveFor(st.gbCurve);
      buildPieces();
    }
    function setPiece(key, parent, curve, r, mat) {
      if (pieces[key]) { pieces[key].parent.remove(pieces[key]); pieces[key].geometry.dispose(); }
      pieces[key] = tubeAlong(curve, r, mat, 20, 10); parent.add(pieces[key]);
    }
    function buildPieces() {
      const gD = st.cutDuct ? 0.035 : 0, gA = st.cutArt ? 0.035 : 0;
      setPiece('ductD', spec, subCurve(st.duct, 0, CUT - gD), 0.024, ductMat);
      setPiece('ductP', cav, subCurve(st.duct, CUT + gD, 1), 0.024, ductMat);
      setPiece('artD', spec, subCurve(st.artery, 0, CUT - gA), 0.016, artMat);
      setPiece('artP', cav, subCurve(st.artery, CUT + gA, 1), 0.016, artMat);
    }
    rebuild();

    // final (retracted) anatomy: used to lay out fat, plate and targets
    const finGb = gbCurveFor(F1, N1), finDuct = ductCurveFor(N1), finArt = arteryCurveFor(finGb);
    const plateAt = (t) => finGb.getPoint(t).add(V(gbR(t) * 1.02, -0.01, 0));
    // cystic plate (pale liver bed exposed when the lower third is taken down)
    { // flat ribbon of pale liver bed between gallbladder and liver
      const pos = [], idx = [], N = 16;
      for (let i = 0; i <= N; i++) {
        const t = 0.4 + 0.55 * i / N, p = plateAt(t).add(V(0.0, -0.04, 0)), q = plateAt(Math.min(1, t + 0.01)).sub(plateAt(Math.max(0, t - 0.01)));
        const n = V(-q.z, 0, q.x).normalize().multiplyScalar(0.045 * Math.sin(Math.PI * i / N) + 0.008);
        pos.push(p.x - n.x * 0.6, p.y, p.z - n.z * 0.6, p.x + n.x, p.y - 0.01, p.z + n.z);
        if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      cav.add(new THREE.Mesh(geo, wet(0xc9968a, 0.5, { side: THREE.DoubleSide }))); }

    // ---------------- fat over Calot's triangle and the lower third (cleared by the hook)
    const strands = [
      { name: 'duct', pts: (u) => finDuct.getPoint(u).add(V(0, 0.03, -0.03)), a: 0.12, b: 0.9 },
      { name: 'artery', pts: (u) => finArt.getPoint(u).add(V(0, 0.03, 0)), a: 0.12, b: 0.92 },
      { name: 'window', pts: (u) => finDuct.getPoint(u).lerp(finArt.getPoint(u), 0.5).add(V(0, 0.02, 0)), a: 0.15, b: 0.85 },
      { name: 'upper', pts: (u) => finArt.getPoint(u).add(V(0, 0.01, -0.075)), a: 0.15, b: 0.8 },
      { name: 'plate', pts: (u) => plateAt(u).add(V(0.0, 0.02, 0)), a: 0.45, b: 0.92 },
    ];
    const globs = [];
    for (const [si, s] of strands.entries()) {
      const line = []; for (let i = 0; i <= 20; i++) line.push(s.pts(s.a + (s.b - s.a) * i / 20));
      s.line = line;
      const pl = polyline(line); const n = Math.max(5, Math.round(pl.length / 0.03));
      let seed = 97 + si * 31; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i <= n; i++) {
        const u = s.a + (s.b - s.a) * i / n, p = s.pts(u);
        for (let k = 0; k < 2; k++) globs.push({ p: p.clone().add(V((r() - 0.5) * 0.04, r() * 0.02, (r() - 0.5) * 0.04)), r: 0.019 + r() * 0.014, strand: si, scale: 1, cleared: false, rot: r() * 3 });
      }
    }
    const fatMat = wet(0xe6c46a, 0.4, { emissive: 0x000000 });
    const fatIM = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 9), fatMat, globs.length); cav.add(fatIM);
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
    function writeGlobs() {
      globs.forEach((g, i) => {
        const k = Math.max(0.0001, g.scale);
        _q.setFromEuler(_e.set(0, g.rot, 0)); _s.set(g.r * 1.3 * k, g.r * 0.55 * k, g.r * k);
        _m.compose(g.p, _q, _s); fatIM.setMatrixAt(i, _m);
      });
      fatIM.instanceMatrix.needsUpdate = true;
    }
    writeGlobs();

    // ---------------- extraction port (cannula entering the view, top right)
    const Etip = V(0.66, 0.34, -0.44), Edir = V(0.5, 0.62, -0.42).normalize();
    { const can = new THREE.Group(); can.add(cylZ(0.07, 0.07, 1.6, steelMat(), 0, 24));
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.008, 8, 24), steelMat()); can.add(lip);
      can.position.copy(Etip); can.lookAt(W(Etip.clone().add(Edir))); cav.add(can); }

    // ---------------- instruments
    const PORT_L = V(-1.3, 1.05, 0.6), PORT_R = V(1.3, 1.05, 0.6), PORT_A = V(-1.5, 0.95, -1.0);
    const graspL = (call(art, 'makeGrasper')) || makeHook();
    const graspA = (call(art, 'makeGrasper')) || makeHook();
    const graspR = (call(art, 'makeGrasper')) || makeHook();
    for (const g of [graspL, graspA, graspR]) { g.scale.setScalar(0.55); g.visible = false; cav.add(g); }
    const hook = makeHook(), clipper = makeClipper(), scissors = makeScissors();
    for (const g of [hook, clipper, scissors]) { g.visible = false; cav.add(g); }
    function pose(tool, tip, port, open) {
      tool.visible = true; tool.position.copy(tip); tool.lookAt(W(port));
      if (tool.setOpen) tool.setOpen(open);
    }
    const handRing = makeRing(0.022, 0.03, 0xffffff, 0, 0.35); handRing.material.depthTest = false; handRing.renderOrder = 9; cav.add(handRing);
    const tipRing = makeRing(0.03, 0.04, 0x3ec5b5, 0, 0.8); tipRing.material.depthTest = false; tipRing.renderOrder = 9; cav.add(tipRing);
    handRing.visible = tipRing.visible = false;
    const fx = []; // little cautery steam puffs
    const puffMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
    function puff(p) {
      if (fx.length > 24) return;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), puffMat.clone()); m.position.copy(p); cav.add(m); fx.push({ m, t: 0 });
    }

    // ---------------- laparoscopic camera + helpers (all in cavity-local coordinates)
    const camL = V(0, 1.35, 1.05), tgtL = V(0, 0, -0.02);
    const CAMS = [
      { pos: V(-0.12, 1.55, 1.08), tgt: V(-0.12, 0.05, -0.2) },  // retract: include liver top
      { pos: V(0.02, 1.2, 0.98), tgt: V(0.02, 0.02, 0.0) },       // dissect
      { pos: V(0.04, 1.08, 0.92), tgt: V(0.04, 0.02, 0.04) },     // CVS
      { pos: V(0.06, 1.1, 0.95), tgt: V(0.06, 0.02, 0.06) },      // clip & cut
      { pos: V(0.08, 1.5, 1.05), tgt: V(0.08, 0.05, -0.16) },     // extract
    ];
    const planeHit = (p, y = PLANE) => { const d = p.clone().sub(camL); const t = (y - camL.y) / (d.y || -1e-6); return camL.clone().addScaledVector(d, t); };
    const rayAt = (pp, h) => planeHit(pp, h);  // same ray, different height
    const local = (wp) => wp.clone().sub(CAV);
    const fulc = () => V(tgtL.x, PLANE, tgtL.z);
    const tipFromHand = (h) => { const c = fulc(); return V(clamp(c.x - (h.x - c.x) * K, -1.1, 1.1), PLANE, clamp(c.z - (h.z - c.z) * K, -1.0, 0.95)); };
    const handFor = (tp) => { const c = fulc(); return W(V(c.x - (tp.x - c.x) / K, PLANE, c.z - (tp.z - c.z) / K)); };
    const settle = async (bot) => { if (Math.abs(bot.pos.y - (CAV.y + PLANE)) > 0.5) await bot.start(W(fulc())); for (let n = 0; n < 80 && camI >= 0 && camL.distanceTo(CAMS[camI].pos) + tgtL.distanceTo(CAMS[camI].tgt) > 0.004; n++) await bot.wait(0.05); };
    const dXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const curveDist = (curve, pp, a = 0, b = 1) => { let best = Infinity, bt = 0; for (let i = 0; i <= 40; i++) { const t = a + (b - a) * i / 40; const d = dXZ(planeHit(curve.getPoint(t)), pp); if (d < best) { best = d; bt = t; } } return { d: best, t: bt }; };

    // ---------------- DOM overlay: scope vignette, OSD, traction gauge, CVS checklist, instrument label
    const css = document.createElement('style');
    css.textContent = `
.chl{position:fixed;inset:0;pointer-events:none;z-index:2;font-family:Inter,system-ui,sans-serif;color:#e8edf2}
.chl-vig{position:absolute;inset:0;background:radial-gradient(ellipse 62vw 66vh at 50% 54%,rgba(0,0,0,0) 72%,rgba(0,0,0,.82) 90%,#000 100%);opacity:0;transition:opacity .4s}
.chl-fade{position:absolute;inset:0;background:#000;opacity:0;transition:opacity .45s}
.chl-osd{position:absolute;left:26px;bottom:22px;font:600 12px/1.5 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:rgba(220,230,236,.62);opacity:0;transition:opacity .4s}
.chl-osd b{color:#3EC5B5;font-weight:600}
.chl-panel{position:absolute;left:26px;top:50%;transform:translateY(-50%);width:270px;background:rgba(11,15,19,.86);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px 16px;display:none}
.chl-panel h4{margin:0 0 10px;font-size:11px;letter-spacing:.12em;color:#8b98a5;font-weight:600}
.chl-panel .it{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.3;margin:7px 0;color:#b9c4ce}
.chl-panel .it i{flex:none;width:16px;height:16px;border-radius:4px;border:1.5px solid #5d6b77;margin-top:1px;font-style:normal;font-size:12px;line-height:14px;text-align:center}
.chl-panel .it.ok{color:#e8edf2}.chl-panel .it.ok i{background:#3EC5B5;border-color:#3EC5B5;color:#0b0f13}
.chl-panel .q{margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.08);font-size:14px;color:#e8edf2;display:none}
.chl-gauge{position:absolute;right:26px;top:50%;transform:translateY(-50%);width:64px;display:none;text-align:center}
.chl-gauge small{display:block;font-size:11px;letter-spacing:.12em;color:#8b98a5;font-weight:600;margin-bottom:8px}
.chl-gbar{position:relative;margin:0 auto;width:16px;height:260px;border-radius:8px;background:rgba(255,255,255,.1);overflow:hidden}
.chl-gbar .band{position:absolute;left:0;right:0;bottom:40%;height:30%;background:rgba(62,197,181,.35)}
.chl-gbar .red{position:absolute;left:0;right:0;bottom:85%;top:0;background:rgba(229,72,77,.3)}
.chl-gbar .fill{position:absolute;left:3px;right:3px;bottom:0;border-radius:6px;background:#dfe6ec;height:0}
.chl-gauge b{display:block;margin-top:8px;font-size:22px;font-variant-numeric:tabular-nums}
.chl-tool{position:absolute;right:26px;bottom:22px;font-size:13px;color:#b9c4ce;background:rgba(11,15,19,.8);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:7px 12px;display:none}
.chl-tool kbd{font:600 11px Inter,sans-serif;border:1px solid #5d6b77;border-radius:4px;padding:1px 5px;margin-left:6px;color:#e8edf2}
`;
    document.head.appendChild(css);
    const ov = document.createElement('div'); ov.className = 'chl';
    ov.innerHTML = `<div class="chl-vig"></div>
      <div class="chl-osd">● <b>LAP</b> 30° · 1080p · CO₂ 12 mmHg<br>MIRRORED CONTROL: instruments pivot at the port</div>
      <div class="chl-panel"><h4>CRITICAL VIEW OF SAFETY</h4>
        <div class="it" data-c="0"><i></i><span>Calot's triangle cleared of fat</span></div>
        <div class="it" data-c="1"><i></i><span>Lower third of gallbladder off the liver bed</span></div>
        <div class="it" data-c="2"><i></i><span>Exactly two structures enter the gallbladder</span></div>
        <div class="q">Now click the <b>cystic duct</b>.</div></div>
      <div class="chl-gauge"><small>TRACTION</small><div class="chl-gbar"><div class="red"></div><div class="band"></div><div class="fill"></div></div><b>0</b></div>
      <div class="chl-tool"></div>
      <div class="chl-fade"></div>`;
    (document.getElementById('ui') || document.body).appendChild(ov);
    const $ = (s) => ov.querySelector(s);
    const ui = {
      setGauge(v) { const g = $('.chl-gauge'); g.style.display = v === null ? 'none' : 'block'; if (v === null) return;
        const f = $('.chl-gbar .fill'); f.style.height = clamp(v, 0, 100) + '%'; f.style.background = v > 85 ? '#E5484D' : v >= 40 && v <= 70 ? '#3EC5B5' : '#dfe6ec'; $('.chl-gauge b').textContent = Math.round(v); },
      panel(on) { $('.chl-panel').style.display = on ? 'block' : 'none'; },
      check(i, on) { ov.querySelector(`.it[data-c="${i}"]`).classList.toggle('ok', on); ov.querySelector(`.it[data-c="${i}"] i`).textContent = on ? '✓' : ''; },
      question(on) { $('.chl-panel .q').style.display = on ? 'block' : 'none'; },
      tool(name) { const t = $('.chl-tool'); t.style.display = name ? 'block' : 'none'; if (name) t.innerHTML = `Instrument: <b>${name}</b>`; },
      toolSwap(name) { const t = $('.chl-tool'); t.style.display = 'block'; t.innerHTML = `Instrument: <b>${name}</b> <kbd>Q</kbd> swap`; },
    };
    ov.style.zIndex = 2;

    // ---------------- lap-mode switching (hide OR lights while inside, restore after)
    let lapOn = false; const hidden = [];
    const inGroup = (o) => { for (let p = o; p; p = p.parent) if (p === group) return true; return false; };
    function setLap(on) {
      lapOn = on;
      $('.chl-vig').style.opacity = on ? 1 : 0; $('.chl-osd').style.opacity = on ? 1 : 0;
      if (on) {
        scene.traverse((o) => { if (o.isLight && o.visible && !inGroup(o)) { hidden.push(o); o.visible = false; } });
        const f = $('.chl-fade'); f.style.transition = 'none'; f.style.opacity = 1; void f.offsetWidth; f.style.transition = 'opacity .6s'; f.style.opacity = 0;
      } else {
        for (const o of hidden) o.visible = true; hidden.length = 0;
        ui.panel(false); ui.setGauge(null); ui.tool(null);
        for (const g of [graspL, graspA, graspR, hook, clipper, scissors]) g.visible = false;
        handRing.visible = tipRing.visible = false;
      }
    }
    function showRings(hand, tip) {
      handRing.visible = !!hand; tipRing.visible = !!tip;
      if (hand) handRing.position.set(hand.x, PLANE + 0.002, hand.z);
      if (tip) tipRing.position.set(tip.x, PLANE + 0.003, tip.z);
    }

    // ================================================================ steps
    const wideCam = { pos: [C.x + 0.9, prepY + 3.4, C.z + 3.4], target: [C.x - 0.7, prepY + 0.1, C.z - 0.5] };
    const stepCam = { pos: wideCam.pos, target: wideCam.target };
    const plane = CAV.y + PLANE;
    let fundusHeld = false, neckHeld = false;

    // generic "grasp and pull to a traction zone" phase for step 1
    function tractionPhase(S, { which, from, to, label }) {
      const ph = { held: false, t: 0, hold: 0, over: 0, grabOff: new THREE.Vector3(), tip: V(0, PLANE, 0), done: false, t0: 0 };
      const setPos = (t) => { if (which === 'F') st.F.lerpVectors(from, to, t); else st.N.lerpVectors(from, to, t); if (which === 'F') st.F.y = from.y + (to.y - from.y) * Math.min(1, t) + 0.03 * Math.sin(Math.PI * Math.min(1, t)); rebuild(); };
      ph.update = (ev, dt) => {
        const hand = local(ev.p); const tp = tipFromHand(hand); ph.tip.copy(tp);
        const cur = which === 'F' ? st.F : st.N;
        const fp = planeHit(from), tpP = planeHit(to);
        const ax = tpP.clone().sub(fp); const L2 = ax.x * ax.x + ax.z * ax.z;
        if (ev.pressed && !ph.held) {
          if (dXZ(tp, planeHit(cur)) < 0.13) { ph.held = true; ph.grabOff.copy(planeHit(cur)).sub(tp); S.setInstr(`${label}: keep traction in the green band (40–70) for 2 s`); }
          else { S.m.missedActions++; S.setInstr(which === 'F' ? 'Line the grasper jaws up on the fundus (the rounded tip), then hold the button' : 'Grasp the neck (infundibulum), the narrow end near the ducts'); }
        }
        if (ph.held && ev.down) {
          const g = tp.clone().add(ph.grabOff);
          ph.t = clamp(((g.x - fp.x) * ax.x + (g.z - fp.z) * ax.z) / L2, 0, 1.7);
          setPos(ph.t);
          const tension = ph.t * 55;
          ui.setGauge(tension);
          if (tension >= 40 && tension <= 70) { ph.hold += dt; S.setInstr(`${label}: hold steady… ${Math.max(0, 2 - ph.hold).toFixed(1)} s`); } else ph.hold = Math.max(0, ph.hold - dt * 0.5);
          if (tension > 85) { ph.over += dt; if (ph.over > 0.5) { S.error(0.35, 'Too much traction, ease off.'); ph.held = false; ph.over = 0; ph.hold = 0; S.setInstr('The wall started to tear. Grasp again and pull more gently.'); } } else ph.over = 0;
          if (ph.hold >= 2) { ph.done = true; ph.held = false; setPos(1); ui.setGauge(55); return true; }
        } else if (ph.held && !ev.down) { ph.held = false; ph.hold = 0; S.m.retries++; S.setInstr('Released too early: grasp again and hold the traction'); }
        if (!ph.held && ph.t > 0) { ph.t = Math.max(0, ph.t - dt * 2.5); setPos(ph.t); ui.setGauge(ph.t * 55); }
        if (!ph.held && ph.t <= 0) ui.setGauge(0);
        return false;
      };
      ph.bot = async (bot) => {
        const cur = which === 'F' ? st.F : st.N;
        await bot.moveTo(handFor(planeHit(cur)), 0.8); await bot.wait(0.25); bot.down(true); await bot.wait(0.2);
        await bot.moveTo(handFor(planeHit(to)), 0.35); await bot.wait(2.3); bot.down(false); await bot.wait(0.2);
      };
      return ph;
    }

    const steps = [
      {
        title: 'Retract the gallbladder', tool: null, plane, cam: stepCam,
        instr: 'Mirrored controls! Grasp the fundus (rounded tip) and push it UP over the liver. Keep traction in the green band.',
        start(S) {
          const t0 = S.time;
          const pF = tractionPhase(S, { which: 'F', from: F0, to: F1, label: 'Fundus cephalad' });
          const pN = tractionPhase(S, { which: 'N', from: N0, to: N1, label: 'Neck lateral' });
          let phase = 0;
          ui.setGauge(0); ui.tool('Grasper (left port)');
          return {
            hideMarker: true,
            frac: () => (phase + (phase === 0 ? pF.t : pN.t) * 0.5) / 2,
            update(ev, dt) {
              const p = phase === 0 ? pF : pN;
              const done = p.update(ev, dt);
              const h = p.held ? (phase === 0 ? st.F.y : st.N.y) : 0.16;
              pose(graspL, rayAt(p.tip, h), PORT_L, p.held ? 0.02 : 0.5);
              showRings(local(ev.p), p.held ? null : p.tip);
              if (fundusHeld) pose(graspA, st.F.clone().add(V(-0.04, 0.02, 0.0)), PORT_A, 0.02);
              if (done && phase === 0) {
                phase = 1; fundusHeld = true; S.award(120, 'Fundus up — good counter-traction');
                S.setInstr('Assistant holds the fundus. Now grasp the neck (near the ducts) and pull it LATERALLY (to the left).');
                ui.setGauge(0);
              } else if (done && phase === 1) {
                neckHeld = true; S.award(120, 'Calot\'s triangle opened');
                if (S.time - t0 < 20) S.award(60, 'Quick, gentle exposure');
                ui.setGauge(null);
                return true;
              }
              return false;
            },
            async bot(bot) { await settle(bot); await pF.bot(bot); while (phase === 0) await bot.wait(0.05); await bot.wait(0.4); await pN.bot(bot); },
          };
        },
      },
      {
        title: 'Dissect Calot\'s triangle', tool: null, plane, cam: stepCam,
        instr: 'Hook cautery: hold the button and sweep SLOWLY over the yellow fat. Clear the triangle and the lower third of the gallbladder. Keep off the ducts.',
        start(S) {
          ui.tool('Hook cautery (right port)');
          const total = globs.length; let spd = 0, cleared = 0, fastT = -9, fastN = 0, ductT = 0, burnArmed = true, lastTip = null, strandDone = strands.map(() => false), errors0 = S.m.tissueErrors;
          const tip = V(0, PLANE, 0);
          const ductCurves = [cbdCurve, finDuct];
          return {
            hideMarker: true,
            frac: () => cleared / total,
            update(ev, dt) {
              tip.copy(tipFromHand(local(ev.p)));
              pose(graspL, st.N.clone().add(V(-0.03, 0.02, 0.02)), PORT_L, 0.02); pose(graspA, st.F.clone().add(V(-0.04, 0.02, 0)), PORT_A, 0.02);
              const t3 = rayAt(tip, 0.075);
              pose(hook, t3, PORT_R, 0);
              showRings(local(ev.p), ev.down ? null : tip);
              fatMat.emissive.setRGB(0.09 + 0.06 * Math.sin(performance.now() / 260), 0.06, 0);
              if (lastTip && dt > 0.004) spd += (dXZ(tip, lastTip) / dt - spd) * Math.min(1, dt * 6); lastTip = tip.clone(); const speed = spd;
              if (ev.down) {
                if (speed > 1.1) {
                  if (S.time - fastT > 0.6) { fastN = S.time - fastT < 3 ? fastN + 1 : 1; fastT = S.time;
                    if (fastN >= 2) { S.error(0.35, 'Small bleed: too fast, heat spreads. Slow down'); fastN = 0; } else S.warn('Too fast — slow, controlled strokes'); }
                } else {
                  for (const g of globs) if (!g.cleared && dXZ(planeHit(g.p), tip) < 0.055) {
                    g.cleared = true; cleared++; if (Math.random() < 0.35) puff(rayAt(tip, 0.09));
                  }
                }
                // thermal injury: hook resting on a duct
                let dd = Infinity; for (const c of ductCurves) dd = Math.min(dd, curveDist(c, tip).d - (c === cbdCurve ? 0.042 : 0.024));
                if (dd < 0.006) { ductT += dt; if (ductT > 0.3 && burnArmed) { burnArmed = false; S.error(0.9, 'Thermal injury — the hook touched a duct!'); } }
                else { ductT = 0; if (dd > 0.03) burnArmed = true; }
              } else ductT = 0;
              strands.forEach((s, si) => {
                if (strandDone[si]) return;
                const mine = globs.filter((g) => g.strand === si); const c = mine.filter((g) => g.cleared).length;
                if (c / mine.length > 0.9) { strandDone[si] = true; S.award(40, si === 4 ? 'Lower third off the liver bed' : 'Fat cleared'); S.comboHit('dissect', 'Clean plane', 30); }
              });
              const pct = cleared / total;
              S.setInstr(`Cleared ${Math.round(pct * 100)}% — sweep slowly over the remaining yellow fat (aim > 90%)`);
              if (pct > 0.92) {
                for (const g of globs) g.cleared = true;
                fatMat.emissive.setRGB(0, 0, 0);
                if (S.m.tissueErrors === errors0) S.award(150, 'Clean plane, no heat near the duct.');
                hook.visible = false; showRings(null, null);
                return true;
              }
              return false;
            },
            async bot(bot) {
              await settle(bot);
              for (const s of strands) {
                const pts = s.line.map((p) => handFor(planeHit(p)));
                await bot.moveTo(pts[0], 0.9); await bot.wait(0.15); bot.down(true);
                await bot.path(pts.slice(1), 0.3); bot.down(false); await bot.wait(0.1);
              }
              // mop up stragglers
              for (let k = 0; k < 3; k++) {
                const left = globs.filter((g) => !g.cleared);
                if (!left.length || left.length < globs.length * 0.06) break;
                for (const g of left.slice(0, 12)) { if (g.cleared) continue; await bot.moveTo(handFor(planeHit(g.p)), 0.5); bot.down(true); await bot.wait(0.12); bot.down(false); }
              }
            },
          };
        },
      },
      {
        title: 'Critical View of Safety — time-out', tool: null, plane, cam: stepCam,
        instr: 'Before anything is clipped, PROVE the anatomy: click the evidence for each of the 3 criteria, then pick the cystic duct.',
        start(S) {
          ui.tool(null); ui.panel(true); ui.question(false); [0, 1, 2].forEach((i) => ui.check(i, false));
          const targets = [
            finDuct.getPoint(0.5).lerp(finArt.getPoint(0.5), 0.5),
            plateAt(0.68),
            finDuct.getPoint(0.06).lerp(finArt.getPoint(0.06), 0.5),
          ];
          const rings = targets.map((p) => { const r = makeRing(0.05, 0.062, 0x3ec5b5, 0, 0); r.material.depthTest = false; r.renderOrder = 9; r.position.copy(p); cav.add(r); return r; });
          let checks = [false, false, false], phase = 'criteria', wrong = 0, hintShown = false, hover = null;
          const structs = [{ k: 'duct', curve: st.duct, mat: ductMat }, { k: 'artery', curve: st.artery, mat: artMat }, { k: 'cbd', curve: cbdCurve, mat: cbdMat }];
          const pickStruct = (pp) => { let best = null, bd = 0.05; for (const s of structs) { const d = curveDist(s.curve, pp, s.k === 'cbd' ? 0.15 : 0.05, s.k === 'cbd' ? 0.75 : 0.95).d; if (d < bd) { bd = d; best = s; } } return best; };
          const reset = () => { checks = [false, false, false]; [0, 1, 2].forEach((i) => { ui.check(i, false); rings[i].material.opacity = 0; }); phase = 'criteria'; ui.question(false); };
          const mech = {
            frac: () => (checks.filter(Boolean).length + (phase === 'done' ? 1 : 0)) / 4,
            update(ev) {
              const pp = local(ev.p);
              const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200);
              rings.forEach((r, i) => { if (checks[i]) r.material.opacity = 0.9; else if (hintShown && phase === 'criteria') r.material.opacity = 0.25 + 0.4 * pulse; else r.material.opacity = 0; });
              for (const s of structs) s.mat.emissive.setRGB(0, 0, 0);
              if (phase === 'identify') { hover = pickStruct(pp); if (hover) hover.mat.emissive.setRGB(0.18, 0.18, 0.18); }
              if (!ev.pressed) return false;
              if (phase === 'criteria') {
                let hit = -1, bd = 0.085;
                targets.forEach((t, i) => { const d = dXZ(planeHit(t), pp); if (!checks[i] && d < bd) { bd = d; hit = i; } });
                if (hit >= 0) {
                  checks[hit] = true; ui.check(hit, true);
                  S.award(70, ['Triangle cleared', 'Liver bed exposed', 'Two structures, one window'][hit]);
                  if (checks.every(Boolean)) { phase = 'identify'; ui.question(true); S.setInstr('All three criteria shown. Which tube is the CYSTIC DUCT? Click it.'); }
                } else {
                  wrong++; S.m.missedActions++; S.comboBreak('cvs'); S.warn('Not evidence of a criterion — look again');
                  if (wrong >= 2 && !hintShown) { hintShown = true; S.info('Hint: the teal rings mark where to look'); }
                }
              } else if (phase === 'identify') {
                const s = pickStruct(pp);
                if (!s) { S.m.missedActions++; S.setInstr('Click directly on one of the tubular structures'); return false; }
                if (s.k === 'duct') {
                  phase = 'done'; rings.forEach((r) => { r.visible = false; }); S.award(hintShown ? 120 : 220, 'Critical View achieved. Now you may clip.');
                  for (const x of structs) x.mat.emissive.setRGB(0, 0, 0);
                  setTimeout(() => ui.panel(false), 900);
                  return true;
                }
                if (s.k === 'artery') { S.error(0.35, 'That is the cystic artery — thinner, red, pulsatile', 'action'); }
                else { S.error(1.8, 'STOP. That is the common bile duct'); S.m.retries++; reset(); S.setInstr('Re-establish the Critical View: click the 3 pieces of evidence again.'); S.info('The CBD runs past the gallbladder — it does not enter it'); }
              }
              return false;
            },
            async bot(bot) {
              await settle(bot);
              for (const t of targets) { await bot.moveTo(W(planeHit(t)), 0.7); await bot.wait(0.35); bot.down(true); await bot.wait(0.12); bot.down(false); await bot.wait(0.45); }
              await bot.wait(0.6);
              const p = W(planeHit(st.duct.getPoint(0.55)));
              await bot.moveTo(p, 0.6); await bot.wait(0.6); bot.down(true); await bot.wait(0.12); bot.down(false);
            },
            dispose() { rings.forEach((r) => { cav.remove(r); r.geometry.dispose(); }); },
          };
          return mech;
        },
      },
      {
        title: 'Clip & cut: 2 + 1 rule', tool: null, plane, cam: stepCam,
        instr: 'Clip applier: hover a white mark and HOLD 0.4 s to fire. 2 clips on the patient side, 1 on the gallbladder side, on BOTH duct and artery.',
        start(S) {
          const clipMat = new THREE.MeshStandardMaterial({ color: 0xd6cba4, metalness: 0.9, roughness: 0.25, envMapIntensity: 0.8 });
          const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthTest: false, depthWrite: false });
          const slots = [];
          for (const [k, curve, r] of [['duct', st.duct, 0.024], ['artery', st.artery, 0.016]]) {
            for (const t of [0.22, 0.7, 0.8]) {
              const p = curve.getPoint(t), tan = curve.getTangent(t);
              const ghost = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, r * 2 + 0.05), ghostMat); ghost.renderOrder = 8;
              ghost.position.copy(p).add(V(0, r + 0.004, 0)); ghost.rotation.y = Math.atan2(tan.x, tan.z) + Math.PI / 2; cav.add(ghost);
              slots.push({ k, t, p, tan, r, ghost, done: false, side: t < CUT ? 'dist' : 'prox' });
            }
          }
          let tool = 'clip', qPrev = false, hold = 0, holdFrom = null, holdSlot = null, cuts = { duct: false, artery: false };
          const tip = V(0, PLANE, 0);
          const nClips = (k) => slots.filter((s) => s.k === k && s.done).length;
          const setTool = (t) => { tool = t; ui.toolSwap(t === 'clip' ? 'Clip applier' : 'Scissors'); };
          setTool('clip');
          function placeClip(s) {
            s.done = true; s.ghost.visible = false;
            const clip = new THREE.Group();
            for (const sgn of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.006, s.r * 2 + 0.03), clipMat); b.position.y = sgn * (s.r * 0.55); clip.add(b); }
            clip.position.copy(s.p); clip.rotation.y = Math.atan2(s.tan.x, s.tan.z) + Math.PI / 2;
            (s.side === 'dist' ? spec : cav).add(clip);
          }
          function doCut(k) {
            cuts[k] = true; if (k === 'duct') st.cutDuct = true; else st.cutArt = true; buildPieces();
          }
          return {
            hideMarker: true,
            frac: () => (slots.filter((s) => s.done).length + (cuts.duct ? 2 : 0) + (cuts.artery ? 2 : 0)) / 10,
            update(ev, dt) {
              const q = ev.input.keys.has('KeyQ');
              if (q && !qPrev) setTool(tool === 'clip' ? 'scissors' : 'clip');
              qPrev = q;
              tip.copy(tipFromHand(local(ev.p)));
              const t3 = rayAt(tip, 0.07);
              pose(graspL, st.N.clone().add(V(-0.03, 0.02, 0.02)), PORT_L, 0.02); pose(graspA, st.F.clone().add(V(-0.04, 0.02, 0)), PORT_A, 0.02);
              clipper.visible = scissors.visible = false;
              pose(tool === 'clip' ? clipper : scissors, t3, PORT_R, ev.down ? 0.05 : 0.6);
              clipper.userData.clip.visible = true;
              showRings(local(ev.p), tip);
              const pulse = 0.3 + 0.35 * (0.5 + 0.5 * Math.sin(performance.now() / 220));
              ghostMat.opacity = pulse;
              if (tool === 'clip') {
                if (ev.pressed) {
                  let best = null, bd = 0.04;
                  for (const s of slots) if (!s.done) { const d = dXZ(planeHit(s.p), tip); if (d < bd) { bd = d; best = s; } }
                  if (best) { holdSlot = best; hold = 0; holdFrom = local(ev.p); }
                  else if (curveDist(cbdCurve, tip, 0.15, 0.75).d < 0.05) S.error(1.8, 'Never clip the common bile duct!');
                  else { S.m.missedActions++; S.warn('Line the clip up on a white mark'); }
                }
                if (holdSlot && ev.down) {
                  hold += dt;
                  if (dXZ(local(ev.p), holdFrom) > 0.045) { S.m.missedActions++; S.comboBreak('clip'); S.warn('Clip misdeployed — hold steady (SHIFT)'); holdSlot = null; }
                  else if (hold >= 0.4) {
                    const s = holdSlot; holdSlot = null; placeClip(s);
                    const err = dXZ(planeHit(s.p), tip) / MM; S.precision(err);
                    S.award(50, s.side === 'prox' ? 'Patient-side clip' : 'Specimen-side clip'); S.comboHit('clip', 'Perfect clip', 30);
                    if (slots.every((x) => x.done)) { setTool('scissors'); S.setInstr('All 6 clips on. Scissors: cut each structure in the gap between the patient-side pair and the single clip.'); }
                  }
                } else if (holdSlot && !ev.down) { holdSlot = null; S.m.retries++; S.setInstr('Hold the button until the clip closes (0.4 s)'); }
              } else if (ev.pressed) {
                const cands = [['duct', st.duct], ['artery', st.artery], ['cbd', cbdCurve]].map(([k, c]) => ({ k, ...curveDist(c, tip, k === 'cbd' ? 0.15 : 0.05, k === 'cbd' ? 0.75 : 0.95) })).sort((a, b) => a.d - b.d);
                const c = cands[0];
                if (c.d > 0.04) { S.m.missedActions++; S.setInstr('Open the scissors across the duct or artery, in the gap between clips'); }
                else if (c.k === 'cbd') S.error(1.8, 'STOP — never cut the common bile duct!');
                else if (cuts[c.k]) S.info('Already divided');
                else if (nClips(c.k) < 3) S.error(1.8, c.k === 'duct' ? 'Cut before clipping — bile leak!' : 'Cut before clipping — arterial bleed!');
                else if (c.t < 0.27 || c.t > 0.65) { S.m.missedActions++; S.warn('Cut in the gap — keep a 2 mm margin from the clips'); }
                else {
                  doCut(c.k); S.precision(Math.abs(c.t - CUT) * 70);
                  S.award(120, c.k === 'duct' ? 'Cystic duct divided' : 'Cystic artery divided');
                  if (cuts.duct && cuts.artery) { clipper.visible = scissors.visible = false; ui.tool(null); ghostMat.opacity = 0; return true; }
                }
              }
              return false;
            },
            async bot(bot) {
              await settle(bot);
              for (const s of slots) { await bot.moveTo(handFor(planeHit(s.p)), 0.6); await bot.wait(0.2); bot.down(true); await bot.wait(0.55); bot.down(false); await bot.wait(0.15); }
              await bot.wait(0.3);
              for (const c of [st.duct, st.artery]) { await bot.moveTo(handFor(planeHit(c.getPoint(CUT))), 0.6); await bot.wait(0.3); bot.down(true); await bot.wait(0.15); bot.down(false); await bot.wait(0.3); }
            },
            dispose() { for (const s of slots) { cav.remove(s.ghost); s.ghost.geometry.dispose(); } },
          };
        },
      },
      {
        title: 'Detach from the liver bed & extract', tool: null, plane, cam: stepCam,
        instr: 'Hook: hold and trace the dotted line along the liver bed, staying inside the corridor. Hold SHIFT for the tight corridor.',
        start(S) {
          ui.tool('Hook cautery (right port)');
          const bed = []; for (let i = 0; i <= 24; i++) bed.push(plateAt(0.9 - 0.75 * i / 24).add(V(0.01, 0.01, 0)));
          const dots = new THREE.Group(); cav.add(dots);
          const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false });
          bed.forEach((p, i) => { if (i % 2) return; const d = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), dotMat); d.position.copy(p); d.renderOrder = 9; dots.add(d); });
          let phase = 'bed', sMax = 0, sFrac = 0, outT = 0, outArmed = true, devSum = 0, devN = 0, held = false, grabOff = null, anim = -1;
          const tip = V(0, PLANE, 0);
          const portP = () => planeHit(Etip);
          const portRing = makeRing(0.09, 0.11, 0x3ec5b5, 0, 0); portRing.material.depthTest = false; portRing.renderOrder = 9; cav.add(portRing);
          const specHome = spec.position.clone();
          return {
            hideMarker: true,
            frac: () => (phase === 'bed' ? 0.6 * sFrac : 0.6 + (held ? 0.2 : 0)),
            update(ev, dt) {
              tip.copy(tipFromHand(local(ev.p)));
              if (fundusHeld && phase === 'bed') pose(graspA, st.F.clone().add(V(-0.04, 0.02, 0)), PORT_A, 0.02);
              if (phase === 'bed') {
                pose(graspL, st.N.clone().add(V(-0.03, 0.02, 0.02)), PORT_L, 0.02);
                const pl = polyline(bed.map((p) => planeHit(p)));
                const c = closestOnPolyline(pl, tip);
                const h = bed[Math.min(bed.length - 1, Math.round((c.s / pl.length) * (bed.length - 1)))].y + 0.02;
                pose(hook, rayAt(tip, h), PORT_R, 0);
                showRings(local(ev.p), ev.down ? null : tip);
                if (ev.down) {
                  if (sMax === 0 && c.s > 0.05) { if (ev.pressed) S.setInstr('Start at the bottom end of the dotted line (near the neck)'); }
                  else {
                    if (c.dist < 0.045 && c.s <= sMax + 0.08) { sMax = Math.max(sMax, c.s); sFrac = sMax / pl.length; devSum += c.dist; devN++; if (Math.random() < 0.15) puff(rayAt(tip, h)); }
                    if (c.dist > 0.045) { outT += dt; if (outT > 1 && outArmed) { outArmed = false; S.error(0.35, 'Out of the plane — liver bed oozing'); } } else { outT = 0; outArmed = true; }
                  }
                }
                dots.children.forEach((d, i) => { d.visible = (i * 2) / (bed.length - 1) > sFrac; });
                if (sFrac > 0.97) {
                  const mean = devSum / Math.max(1, devN) / MM; S.precision(mean);
                  S.award(mean < 2 ? 150 : 90, mean < 2 ? 'Clean plane on the liver bed' : 'Gallbladder detached');
                  phase = 'extract'; hook.visible = false; graspA.visible = false; graspL.visible = false; fundusHeld = false;
                  S.setInstr('Grasper: grab the gallbladder neck and drag it into the port (teal ring, top right).');
                  ui.tool('Grasper (right port)');
                }
                return false;
              }
              if (phase === 'extract') {
                const t3 = rayAt(tip, 0.16);
                portRing.position.copy(portP()).setY(PLANE + 0.004); portRing.material.opacity = 0.45 + 0.4 * Math.sin(performance.now() / 200);
                const grabP = () => planeHit(spec.localToWorld(st.N.clone().lerp(st.F, 0.15)).sub(CAV));
                if (ev.pressed && !held) {
                  if (dXZ(tip, grabP()) < 0.2) { held = true; grabOff = spec.position.clone().sub(V(tip.x, 0, tip.z)); }
                  else { S.m.missedActions++; S.setInstr('Line the jaws up on the gallbladder neck, then hold'); }
                }
                if (held && ev.down) {
                  spec.position.set(tip.x + grabOff.x, specHome.y + 0.12, tip.z + grabOff.z);
                } else if (held && !ev.down) {
                  held = false;
                  if (dXZ(tip, portP()) < 0.2 || dXZ(grabP(), portP()) < 0.18) { phase = 'anim'; anim = 0; S.award(150, 'Specimen extracted'); }
                  else { S.m.retries++; S.setInstr('Drag it all the way into the port ring before releasing'); spec.position.copy(specHome); }
                }
                pose(graspR, held ? rayAt(tip, specHome.y + 0.2) : t3, PORT_R, held ? 0.02 : 0.5);
                showRings(local(ev.p), held ? null : tip);
                return false;
              }
              if (phase === 'anim') {
                anim += dt; const u = Math.min(1, anim / 1.1);
                spec.position.lerp(Etip.clone().addScaledVector(Edir, 0.7).sub(st.N), 0.07);
                graspR.visible = false; portRing.visible = false; showRings(null, null);
                if (u >= 1) { spec.visible = false; return true; }
              }
              return false;
            },
            async bot(bot) {
              await settle(bot);
              const pts = bed.map((p) => handFor(planeHit(p)));
              await bot.moveTo(pts[0], 0.8); await bot.wait(0.2); bot.down(true);
              const ext = pts[pts.length - 1].clone().add(pts[pts.length - 1].clone().sub(pts[pts.length - 2]).setLength(0.03));
              await bot.path([...pts.slice(1), ext], 0.28); bot.down(false); await bot.wait(0.6);
              const g = planeHit(spec.localToWorld(st.N.clone().lerp(st.F, 0.15)).sub(CAV));
              await bot.moveTo(handFor(g), 0.7); await bot.wait(0.25); bot.down(true); await bot.wait(0.25);
              const target = planeHit(Etip).add(g.clone().sub(g)); // grab point -> port
              await bot.moveTo(handFor(target), 0.4); await bot.wait(0.3); bot.down(false); await bot.wait(0.4);
            },
            dispose() { cav.remove(dots); cav.remove(portRing); },
          };
        },
      },
    ];

    const controller = createSurgery({
      id: ID, engine, art, group, steps, monitor, parTime: 110, wideCam,
      summary: { title: 'Gallbladder out — no bile duct injury', sub: 'Critical View of Safety confirmed before clipping. Day-case discharge.' },
    });

    // camera + per-frame cavity animation on top of the shared step machine
    const baseUpdate = controller.update, baseDispose = controller.dispose;
    let camI = -1;
    controller.update = (dt, input) => {
      baseUpdate(dt, input);
      const i = controller.stepIndex;
      const want = i >= 0 && !controller.S.done;
      if (want !== lapOn) setLap(want);
      if (lapOn) {
        const c = CAMS[Math.min(i, CAMS.length - 1)];
        if (camI < 0) { camL.copy(c.pos); tgtL.copy(c.tgt); }
        camI = i;
        const k = 1 - Math.exp(-dt * 2.2);
        camL.lerp(c.pos, k); tgtL.lerp(c.tgt, k);
        const sway = Math.sin(controller.S.time * 1.3) * 0.004;
        cam.position.copy(camL).add(CAV).add(V(sway, 0, 0)); cam.lookAt(W(tgtL));
        scopeLight.position.copy(camL).add(V(0.05, 0.02, 0));
        // artery pulses with the heart rate
        const hr = controller.S.vitals.state.hr;
        const ph = (controller.S.time * hr / 60) % 1;
        artMat.emissive.setRGB(Math.max(0, 0.12 * Math.sin(ph * Math.PI * 2)) + (artMat.emissive.g > 0.1 ? 0.18 : 0), artMat.emissive.g, artMat.emissive.b);
      }
      if (anatomySet && anatomySet.update) { try { anatomySet.update(controller.S.time); } catch { /* decorative */ } }
      // fat shrink + steam puffs
      let changed = false;
      for (const g of globs) if (g.cleared && g.scale > 0) { g.scale = Math.max(0, g.scale - dt * 4); changed = true; }
      if (changed) writeGlobs();
      for (let j = fx.length - 1; j >= 0; j--) {
        const f = fx[j]; f.t += dt; f.m.position.y += dt * 0.08; f.m.scale.setScalar(1 + f.t * 3); f.m.material.opacity = Math.max(0, 0.45 * (1 - f.t / 0.8));
        if (f.t > 0.8) { cav.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); fx.splice(j, 1); }
      }
    };
    controller.dispose = () => {
      disposedA = true;
      setLap(false);
      ov.remove(); css.remove();
      baseDispose();
    };
    return controller;
  },
};
