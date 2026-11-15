// ART: procedural models/materials for Steady Hands. See docs/NOTES.md (ART section) for API.
// Units: 1 unit = 10 cm (so 0.01 unit = 1 mm). Y is up. Pad lies in the XZ plane, top surface at y = pad.userData.surfaceY.
// Instrument convention: tip at local origin, instrument body extends toward +Z (so the tool "points" along -Z).
import * as THREE from 'three';
import { rng, valueNoise, canvas, texFromCanvas, skinDetail, fabricDetail, tissueDetail, brushedDetail } from './tex.js';

const V3 = (p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0));

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...opts.repeat); }
  return t;
}
const rand = rng;

const mats = {};
// LOOK: grounded-realism materials. MeshStandardMaterial only (GPU-safe), one shadow light, HDRI reflections.
function steel(rough = 0.26) {
  const k = 'steel' + rough;
  return mats[k] ||= new THREE.MeshStandardMaterial({ color: 0xe2e6ea, metalness: 1, roughness: rough + 0.04, roughnessMap: brushedDetail().rough, envMapIntensity: 1.15 });
}
const blackMat = () => mats.black ||= new THREE.MeshStandardMaterial({ color: 0x101113, roughness: 0.8, metalness: 0.05 });
const handleMat = () => mats.handle ||= new THREE.MeshStandardMaterial({ color: 0x1c2024, roughness: 0.42, metalness: 0.25 });
const goldMat = () => mats.gold ||= new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.3 });

function shadowAll(o, cast = true, recv = true) { o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = recv; } }); return o; }

// ---------------------------------------------------------------- lights + environment
const HDRI_URL = new URL('../../assets/hospital_room_2.hdr', import.meta.url).href;
let _hdri = null, _hdriPromise = null;
function loadHDRI() {
  if (_hdriPromise) return _hdriPromise;
  _hdriPromise = import('three/addons/loaders/RGBELoader.js').then(({ RGBELoader }) => new Promise((res, rej) => {
    new RGBELoader().load(HDRI_URL, (t) => { t.mapping = THREE.EquirectangularReflectionMapping; _hdri = t; res(t); }, undefined, rej);
  }));
  return _hdriPromise;
}
export function makeORLights(scene) {
  scene.background = new THREE.Color(0x0a0d10);
  scene.fog = new THREE.Fog(0x0a0d10, 18, 46);
  // placeholder env (soft studio gradient) until the CC0 HDRI (Poly Haven "hospital_room_2", 1k) arrives
  const env = canvasTex(256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#c9d4dc'); gr.addColorStop(0.5, '#5d666e'); gr.addColorStop(1, '#22272c');
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.fillRect(w * 0.4, 0, w * 0.2, h * 0.12);
  });
  env.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = _hdri || env;
  scene.environmentIntensity = 0.55;
  loadHDRI().then((t) => { if (scene.environment === env) scene.environment = t; }).catch((e) => console.warn('[art] HDRI load failed', e));

  // surgical light: one bright cool-white spot from above = the only shadow caster (soft pool with falloff)
  const key = new THREE.SpotLight(0xf3f7ff, 120, 0, 0.5, 0.85, 1.7);
  key.position.set(0.8, 10, 2.4);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03; key.shadow.radius = 6;
  key.shadow.camera.near = 4; key.shadow.camera.far = 22;
  const fill = new THREE.HemisphereLight(0xdbe6f0, 0x2a2420, 0.35);
  const rim = new THREE.DirectionalLight(0x9fc8d8, 0.45); rim.position.set(-5, 5, -6);  // subtle cool back light
  const g = new THREE.Group(); g.name = 'ORLights';
  g.add(key, key.target, fill, rim);
  scene.add(g);
  return { group: g, key, fill, rim, dispose() { scene.remove(g); } };
}

// ---------------------------------------------------------------- drapes
const DRAPE_BLUE = 0x3e6e8e;
function drapeMat() {
  if (mats.drape) return mats.drape;
  const f = fabricDetail();
  return (mats.drape = new THREE.MeshStandardMaterial({ color: DRAPE_BLUE, map: f.albedo, normalMap: f.normal, normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.93, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.6 }));
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const foldNoise = valueNoise(77, 64);
/** height-field drape: grid over [-W/2,W/2]x[-D/2,D/2]; heightFn(x,z) -> y; optional rectangular hole (winW x winH at origin).
 *  Folds grow with distance from the hole. UVs in world units (fabric texture tiles every ~0.6 units). */
function buildDrape({ W, D, nx = 120, nz = 90, heightFn, winW = 0, winH = 0, foldAmp = 0.06, uvScale = 1.6 }) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    let x = -W / 2 + W * i / nx, z = -D / 2 + D * j / nz;
    // snap the grid lines nearest the window edge onto it so the hole is clean
    if (winW) { if (Math.abs(Math.abs(x) - winW / 2) < W / nx * 0.5) x = Math.sign(x) * winW / 2; if (Math.abs(Math.abs(z) - winH / 2) < D / nz * 0.5) z = Math.sign(z) * winH / 2; }
    const dx = Math.max(0, Math.abs(x) - winW / 2), dz = Math.max(0, Math.abs(z) - winH / 2), dist = Math.hypot(dx, dz);
    const n = foldNoise(x * 0.9 + 3, z * 0.35 + 7), ridge = 1 - Math.abs(2 * n - 1);
    const n2 = foldNoise(x * 0.3 + 11, z * 1.1 + 2), ridge2 = 1 - Math.abs(2 * n2 - 1);
    const fold = foldAmp * sstep(0.05, 1.4, dist) * (ridge * ridge * 1.0 + ridge2 * ridge2 * 0.6);
    pos.push(x, heightFn(x, z) + fold, z); uv.push(x * uvScale, z * uvScale);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    if (winW) { const cx = (pos[a * 3] + pos[d * 3]) / 2, cz = (pos[a * 3 + 2] + pos[d * 3 + 2]) / 2; if (Math.abs(cx) < winW / 2 && Math.abs(cz) < winH / 2) continue; }
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, drapeMat()); m.receiveShadow = true; m.castShadow = true; m.name = 'drape';
  return m;
}
/** rolled hem around a rectangular window (gives the drape visible thickness) */
function windowHem(winW, winH, y, r = 0.035, cr = 0.06) {
  const s = roundedRectShape(winW + r * 1.2, winH + r * 1.2, cr), pts = s.getSpacedPoints(160).map((p) => new THREE.Vector3(p.x, y, p.y));
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 220, r, 10, true), drapeMat());
  m.castShadow = true; m.receiveShadow = true; m.name = 'drapeHem'; return m;
}

export function makeDrape(w = 16, d = 12) { // flat-ish table drape (blue, gentle folds)
  const m = buildDrape({ W: w, D: d, nx: 80, nz: 60, heightFn: () => 0, foldAmp: 0.03 });
  return m;
}

// ---------------------------------------------------------------- skin
/** realistic (not hyper-real) skin albedo canvas for a w x h patch, with a soft povidone-iodine (Betadine) prep stain. */
function skinCanvas(w, h, { prep = true, seed = 5, pxu = 170 } = {}) {
  const W = Math.round(w * pxu), H = Math.round(h * pxu), c = canvas(W, H), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = '#d6a68c'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) { // gentle tone variation
    const x = r() * W, y = r() * H, rad = (0.25 + r() * 0.8) * pxu, gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const col = r() > 0.5 ? '232,186,160' : '196,140,118'; gr.addColorStop(0, `rgba(${col},0.18)`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  if (prep) { // Betadine: overlapping circular wipes, soft irregular border
    const cx = W / 2, cy = H / 2;
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.5, x = cx + Math.cos(a) * rr * W * 0.92, y = cy + Math.sin(a) * rr * H * 0.92;
      const rad = (0.18 + r() * 0.35) * pxu * Math.max(1, Math.min(w, h) / 3), gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const tone = r() > 0.5 ? '168,86,34' : '140,66,26';
      gr.addColorStop(0, `rgba(${tone},0.10)`); gr.addColorStop(0.7, `rgba(${tone},0.07)`); gr.addColorStop(1, `rgba(${tone},0)`);
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(236,200,170,0.25)'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
  }
  return c;
}
/** skin material. opts: {w,h (patch size for the albedo), prep (Betadine stain), repeat (detail tiling)} */
export function makeSkinMaterial(o = {}) {
  const w = o.w ?? 3, h = o.h ?? 2, d = skinDetail();
  const map = texFromCanvas(skinCanvas(w, h, o));
  const nm = d.normal.clone(); nm.needsUpdate = true; const rep = o.repeat ?? 1.4; nm.repeat.set(w * rep, h * rep);
  return new THREE.MeshStandardMaterial({ map, normalMap: nm, normalScale: new THREE.Vector2(0.12, 0.12), roughness: 0.58, metalness: 0, envMapIntensity: 0.5 });
}
const plainSkin = () => mats.plainSkin ||= new THREE.MeshStandardMaterial({ color: 0xd2a68e, roughness: 0.62, metalness: 0, envMapIntensity: 0.5 });

// ---------------------------------------------------------------- surgical field (replaces the tissue pad)
function roundedRectShape(w, d, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** makeSurgicalField({w=6,h=4, surfaceY=0.35, drape=true, prep=true}) -> {mesh (Group), surfaceY, toLocal(x,z)}
 *  A prepped skin window (w x h, Betadine-tinted) surrounded by blue OR drapes that fall away over a body.
 *  mesh.userData = {width, depth, thickness, surfaceY, top, toUV, contains} (same as the old tissue pad, so incisionDecal(mesh) works).
 *  Field-local x,z in [-w/2,w/2] x [-h/2,h/2]; toLocal(worldX, worldZ) -> [x,z] (also .x/.z) in field-local units. */
export function makeSurgicalField(o = {}) {
  const w = o.w ?? o.width ?? 6, h = o.h ?? o.depth ?? 4, top = o.surfaceY ?? o.thickness ?? 0.35;
  const group = new THREE.Group(); group.name = 'SurgicalField';
  const surfaceY = top + 0.0005;
  const skinMesh = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.3, h + 0.3), makeSkinMaterial({ w: w + 0.3, h: h + 0.3, prep: o.prep !== false }));
  skinMesh.rotation.x = -Math.PI / 2; skinMesh.position.y = surfaceY; skinMesh.receiveShadow = true; skinMesh.name = 'padTop';
  group.add(skinMesh);
  // body volume under the skin so edges never show a gap (hidden by the drape)
  const body = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, top, h + 0.3), plainSkin()); body.position.y = top / 2 - 0.002; group.add(body);
  if (o.drape !== false) {
    const S = Math.max(w, h), W = Math.max(18, w * 3.2), D = Math.max(14, h * 3.4), hem = 0.03;
    const R = h / 2 + S * 0.55; // body half-width under the drape
    const heightFn = (x, z) => {
      const dz = Math.max(0, Math.abs(z) - h / 2), dx = Math.max(0, Math.abs(x) - w / 2);
      const body = top + hem - (top + hem + 0.2) * sstep(0, R - h / 2, dz) ** 1.6;   // falls away over the flanks
      return Math.max(-0.02, body - 0.02 * dx) ;
    };
    const dr = buildDrape({ W, D, heightFn, winW: w, winH: h, foldAmp: 0.09 * S / 6, uvScale: 1.6 * 6 / S });
    group.add(dr);
    group.add(windowHem(w, h, surfaceY + 0.012, 0.035 * S / 6, 0.08));
  }
  shadowAll(group, false, true);
  const W0 = w + 0.12, D0 = h + 0.12; // legacy pad convention: decal covers width-0.12
  Object.assign(group.userData, {
    width: W0, depth: D0, thickness: top, surfaceY, top: skinMesh, kind: 'field',
    toUV: (x, z) => ({ u: x / w + 0.5, v: z / h + 0.5 }),
    contains: (x, z) => Math.abs(x) <= w / 2 && Math.abs(z) <= h / 2,
  });
  const toLocal = (x, z) => { group.updateMatrixWorld(true); const v = group.worldToLocal(new THREE.Vector3(x, 0, z)); const r = [v.x, v.z]; r.x = v.x; r.z = v.z; return r; };
  group.userData.toLocal = toLocal;
  return { mesh: group, surfaceY, toLocal, userData: group.userData };
}

/** legacy alias: makeTissuePad() -> the surgical field Group (old code did `pad.mesh` via fromArt or used the Group directly). */
export function makeTissuePad(o = {}) {
  const f = makeSurgicalField({ w: (o.width ?? 6) - 0.12, h: (o.depth ?? 4) - 0.12, surfaceY: o.thickness ?? 0.35, drape: o.drape });
  return f.mesh;
}

// ---------------------------------------------------------------- incision decal
/** incisionDecal(pad) -> {mesh, addPoint(x,z,depth=0.5), endStroke(), setGuide(pts, {color,dashed}), addMark(x,z,{color,radius}),
 *  flash(x,z), clearCut(), clearAll()}. x,z are pad-local coordinates (units). depth in 0..1 widens/darkens the groove. */
export function incisionDecal(pad) {
  const { width, depth: D, surfaceY } = pad.userData;
  const W = width - 0.12, H = D - 0.12, pxu = 300;
  const cw = Math.round(W * pxu), ch = Math.round(H * pxu);
  const mk = () => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return c; };
  const guideC = mk(), cutC = mk(), markC = mk(), outC = mk();
  const gg = guideC.getContext('2d'), cg = cutC.getContext('2d'), mg = markC.getContext('2d'), og = outC.getContext('2d');
  const tex = new THREE.CanvasTexture(outC); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const px = (x) => (x / W + 0.5) * cw, py = (z) => (z / H + 0.5) * ch;
  let last = null, dirty = true;
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.45, metalness: 0, envMapIntensity: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = surfaceY + 0.002; mesh.renderOrder = 2; mesh.name = 'incisionDecal';
  pad.add(mesh);
  const compose = () => { og.clearRect(0, 0, cw, ch); og.drawImage(guideC, 0, 0); og.drawImage(cutC, 0, 0); og.drawImage(markC, 0, 0); tex.needsUpdate = true; dirty = false; };
  compose();
  mesh.onBeforeRender = () => { if (dirty) compose(); };
  const api = {
    mesh, texture: tex,
    setGuide(pts, { color = '#5b3a9e', dashed = true, width: lw = 3 } = {}) {
      gg.clearRect(0, 0, cw, ch); if (!pts || pts.length < 2) { dirty = true; return; }
      // surgical skin-marker ink: slightly soft edge (ink bleed), semi-opaque
      gg.strokeStyle = color; gg.lineWidth = lw * 1.15; gg.lineCap = 'round'; gg.lineJoin = 'round'; gg.globalAlpha = 0.82;
      gg.shadowColor = color; gg.shadowBlur = 2.5;
      if (dashed) gg.setLineDash([14, 8]);
      gg.beginPath(); pts.forEach((p, i) => (i ? gg.lineTo(px(p.x), py(p.z)) : gg.moveTo(px(p.x), py(p.z)))); gg.stroke();
      gg.setLineDash([]);
      for (const p of [pts[0], pts[pts.length - 1]]) { gg.fillStyle = color; gg.beginPath(); gg.arc(px(p.x), py(p.z), 5.5, 0, 7); gg.fill(); }
      gg.shadowBlur = 0; gg.globalAlpha = 1;
      dirty = true;
    },
    addPoint(x, z, d = 0.5) {
      const p = { x: px(x), y: py(z) };
      if (last) {
        const w = 1.6 + d * 2.6; // thin, clean incision; deeper = slightly wider gap
        const seg = (c, lw, a, ox = 0, oy = 0) => { cg.strokeStyle = c; cg.lineWidth = lw; cg.globalAlpha = a; cg.lineCap = 'round'; cg.beginPath(); cg.moveTo(last.x + ox, last.y + oy); cg.lineTo(p.x + ox, p.y + oy); cg.stroke(); };
        seg('rgb(214,128,122)', w + 7, 0.22);          // faint pink wound edge
        seg('rgb(255,226,214)', w + 2.2, 0.35, 0, -1); // lit upper lip
        seg('rgb(150,48,52)', w + 1.2, 0.85);          // parted dermis edge
        seg('rgb(72,14,20)', w * 0.55, 0.95);          // gap core
        cg.globalAlpha = 1;
      }
      last = p; dirty = true;
    },
    endStroke() { last = null; },
    addMark(x, z, { color = '#2a5ea8', radius = 0.045 } = {}) {
      mg.fillStyle = color; mg.globalAlpha = 0.9; mg.beginPath(); mg.arc(px(x), py(z), radius * pxu, 0, 7); mg.fill();
      mg.strokeStyle = '#fff'; mg.lineWidth = 2; mg.stroke(); mg.globalAlpha = 1; dirty = true;
    },
    flash(x, z) { // subtle red error highlight (no gore)
      const gr = mg.createRadialGradient(px(x), py(z), 0, px(x), py(z), 28); gr.addColorStop(0, 'rgba(200,60,60,0.35)'); gr.addColorStop(1, 'rgba(200,60,60,0)');
      mg.fillStyle = gr; mg.fillRect(px(x) - 30, py(z) - 30, 60, 60); dirty = true;
    },
    clearCut() { cg.clearRect(0, 0, cw, ch); last = null; dirty = true; },
    clearMarks() { mg.clearRect(0, 0, cw, ch); dirty = true; },
    clearAll() { gg.clearRect(0, 0, cw, ch); cg.clearRect(0, 0, cw, ch); mg.clearRect(0, 0, cw, ch); last = null; dirty = true; },
    dispose() { pad.remove(mesh); tex.dispose(); mat.dispose(); mesh.geometry.dispose(); },
  };
  return api;
}

// ---------------------------------------------------------------- instruments
function latheAlongZ(profile, mat, seg = 24) { // profile: [[z, radius]...] with z from tip(0)->back
  const pts = profile.map(([z, r]) => new THREE.Vector2(r, z));
  const g = new THREE.LatheGeometry(pts, seg); g.rotateX(Math.PI / 2); // lathe axis Y -> Z
  return new THREE.Mesh(g, mat);
}

/** Scalpel: #10 blade on a flat handle. Tip at origin, handle toward +Z, blade edge faces down (-Y). userData: {tip, length} */
export function makeScalpel() {
  const g = new THREE.Group(); g.name = 'Scalpel';
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.bezierCurveTo(-0.12, 0.03, -0.3, 0.07, -0.6, 0.075);
  s.lineTo(-0.6, 0.17); s.lineTo(-0.08, 0.15); s.quadraticCurveTo(-0.02, 0.1, 0, 0);
  const bg = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 });
  bg.translate(0, 0, -0.006);
  const blade = new THREE.Mesh(bg, steel(0.2)); blade.rotation.y = Math.PI / 2; blade.position.z = 0; g.add(blade);
  // slot + holder
  const holder = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.28), steel(0.3)); holder.position.set(0, 0.125, 0.72); g.add(holder);
  const handle = latheAlongZ([[0.85, 0.05], [0.95, 0.075], [1.3, 0.1], [1.9, 0.11], [2.3, 0.08], [2.35, 0.0]], steel(0.3));
  handle.scale.set(0.8, 1, 1); handle.position.y = 0.13; g.add(handle);
  for (let i = 0; i < 12; i++) { // grip rings
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.01, 8, 24), steel(0.35)); ring.scale.set(0.8, 1, 1);
    ring.position.set(0, 0.13, 1.35 + i * 0.07); g.add(ring);
  }
  shadowAll(g); g.userData = { tip: new THREE.Vector3(0, 0, 0), length: 2.35, kind: 'scalpel' };
  return g;
}

/** Needle driver (Mayo-Hegar style): box-lock, ring handles. Tip at origin, body toward +Z. setOpen(t 0..1). userData.tip */
export function makeNeedleDriver() {
  const g = new THREE.Group(); g.name = 'NeedleDriver';
  const pivotZ = 0.7, halves = [];
  for (const sgn of [-1, 1]) {
    const p = new THREE.Group(); p.position.set(0, 0, pivotZ);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, pivotZ), steel(0.22)); // tapered via scale below
    const jg = jaw.geometry; const pos = jg.attributes.position;
    for (let i = 0; i < pos.count; i++) { if (pos.getZ(i) < 0) { pos.setX(i, pos.getX(i) * 0.55); pos.setY(i, pos.getY(i) * 0.6); } }
    jg.computeVertexNormals();
    jaw.position.set(sgn * 0.015, 0, -pivotZ / 2);
    const shank = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 1.0), steel(0.28)); shank.position.set(sgn * 0.015, 0, 0.5);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.04, 12, 32), steel(0.25)); ring.rotation.x = Math.PI / 2; ring.scale.set(0.8, 1, 1.15);
    ring.position.set(sgn * 0.19, 0, 1.28);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.04, 0.06), steel(0.28)); arm.position.set(sgn * 0.09, 0, 1.0); arm.rotation.y = sgn * -0.4;
    p.add(jaw, shank, ring, arm); p.userData.sgn = sgn; halves.push(p); g.add(p);
  }
  const lockA = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.35), steel(0.3)); lockA.position.set(0.05, 0.04, pivotZ + 0.65);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 16), goldMat()); pin.position.set(0, 0, pivotZ);
  g.add(lockA, pin);
  g.userData = { tip: new THREE.Vector3(0, 0, 0), kind: 'driver', open: 0 };
  g.setOpen = (t) => { g.userData.open = t; for (const h of halves) h.rotation.y = h.userData.sgn * t * 0.22; };
  g.setOpen(0);
  shadowAll(g); return g;
}

/** Curved suture needle (3/8 circle) with swage + optional thread. Tip at origin, arc curves toward +X, extends +Z.
 *  userData: {tip, radius, length}. g.setThread(pointsArray) draws a thread tube from the swage end through the given local points ([] clears). */
export function makeCurvedNeedle() {
  const R = 0.2, z0 = 0.05, arc = Math.PI * 0.75, tube = 0.0085;
  const g = new THREE.Group(); g.name = 'CurvedNeedle';
  const P = (a) => new THREE.Vector3(R * (1 - Math.cos(a)), 0, z0 + R * Math.sin(a));
  const curve = new THREE.CatmullRomCurve3(Array.from({ length: 40 }, (_, i) => P(arc * i / 39)));
  const body = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, tube, 10), steel(0.15));
  const tipM = new THREE.Mesh(new THREE.ConeGeometry(tube, z0, 10), steel(0.15)); tipM.rotation.x = -Math.PI / 2; tipM.position.z = z0 / 2; // apex at origin
  const end = curve.getPoint(1);
  const swage = new THREE.Mesh(new THREE.SphereGeometry(tube * 1.5, 10, 8), steel(0.15)); swage.position.copy(end);
  g.add(body, tipM, swage);
  const threadMat = new THREE.MeshStandardMaterial({ color: 0x2a2f8f, roughness: 0.6 });
  let thread = null;
  g.setThread = (pts) => {
    if (thread) { g.remove(thread); thread.geometry.dispose(); thread = null; }
    if (!pts || pts.length < 1) return;
    const arr = [end.clone(), ...pts.map(V3)]; if (arr.length < 2) return; if (arr.length === 2) arr.push(arr[1].clone().add(new THREE.Vector3(0, 0, 0.001)));
    thread = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arr), Math.max(8, arr.length * 8), 0.0045, 6), threadMat); g.add(thread);
  };
  g.userData = { tip: new THREE.Vector3(0, 0, 0), swage: end.clone(), radius: R, length: arc * R, kind: 'needle' };
  shadowAll(g); return g;
}

/** Laparoscopic grasper. Long shaft (3.2 units) with plastic handle at +Z; tip (jaw hinge front) at origin, shaft along +Z.
 *  setOpen(t 0..1). userData: {tip, length}. Intended to pass through the lap box port (pivot around port). */
export function makeGrasper() {
  const g = new THREE.Group(); g.name = 'Grasper';
  const L = 3.2;
  const shaft = latheAlongZ([[0.14, 0.05], [0.2, 0.05], [L, 0.05], [L, 0]], steel(0.22), 20); g.add(shaft);
  const collar = latheAlongZ([[0.14, 0.038], [0.2, 0.038], [0.22, 0]], steel(0.3)); g.add(collar);
  const jaws = [];
  for (const sgn of [-1, 1]) {
    const p = new THREE.Group(); p.position.set(0, 0, 0.17);
    const j = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.04, 0.2), steel(0.22));
    const pos = j.geometry.attributes.position; for (let i = 0; i < pos.count; i++) if (pos.getZ(i) < 0) pos.setX(i, pos.getX(i) * 0.6);
    j.position.set(sgn * 0.012, 0, -0.1);
    for (let i = 0; i < 4; i++) { const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.012), steel(0.3)); tooth.position.set(sgn * -0.002, 0.024, -0.03 - i * 0.04); j.add(tooth); }
    p.add(j); p.userData.sgn = sgn; jaws.push(p); g.add(p);
  }
  // handle (pistol-grip style, black polymer)
  const hz = L;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.5, 8, 16), handleMat()); body.rotation.x = Math.PI / 2; body.position.z = hz + 0.3; g.add(body);
  const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.5, 8, 16), handleMat()); grip.position.set(0, -0.35, hz + 0.45); grip.rotation.x = 0.25; g.add(grip);
  const trigger = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.022, 10, 24, Math.PI), handleMat()); trigger.rotation.set(0, Math.PI / 2, 0); trigger.position.set(0, -0.12, hz + 0.28); g.add(trigger);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.1, 20), steel(0.3)); knob.rotation.x = Math.PI / 2; knob.position.z = hz - 0.02; g.add(knob);
  g.userData = { tip: new THREE.Vector3(0, 0, 0), length: L, kind: 'grasper', open: 0 };
  g.setOpen = (t) => { g.userData.open = t; for (const j of jaws) j.rotation.y = j.userData.sgn * t * 0.35; };
  g.setOpen(0.3);
  shadowAll(g); return g;
}

// ---------------------------------------------------------------- lap box, pegs, vessels
/** Laparoscopic trainer box. Open front, matte black shell, rubber floor at y=0, ceiling with a trocar port.
 *  userData: {port: Vector3 (local, in the ceiling hole), portNormal (0,-1,0), floorY:0, height, bounds:{x:[a,b], z:[a,b]}}. */
export function makeLapBox(o = {}) {
  const W = o.width ?? 6, Dp = o.depth ?? 4, H = o.height ?? 3.2, t = 0.14;
  const g = new THREE.Group(); g.name = 'LapBox';
  const shell = blackMat();
  const floorTex = canvasTex(512, 512, (c, w, h) => { c.fillStyle = '#2a3a35'; c.fillRect(0, 0, w, h); const r = rand(9);
    for (let i = 0; i < 6000; i++) { c.fillStyle = `rgba(255,255,255,${r() * 0.05})`; c.fillRect(r() * w, r() * h, 2, 2); }
    c.strokeStyle = 'rgba(190,220,210,0.18)'; c.lineWidth = 2; for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(i * w / 8, 0); c.lineTo(i * w / 8, h); c.moveTo(0, i * h / 8); c.lineTo(w, i * h / 8); c.stroke(); } });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, t, Dp), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.7 })); floor.position.y = -t / 2; g.add(floor);
  const box = (w, h, d, x, y, z, m = shell) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  const backMat = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.85 });
  box(W, H, t, 0, H / 2, -Dp / 2 - t / 2, backMat);
  box(t, H, Dp + 2 * t, -W / 2 - t / 2, H / 2, 0);
  box(t, H, Dp + 2 * t, W / 2 + t / 2, H / 2, 0);
  // ceiling with a circular port hole
  const portZ = o.portZ ?? 0.9, portR = 0.16;
  const cs = new THREE.Shape(); cs.moveTo(-W / 2 - t, -Dp / 2 - t); cs.lineTo(W / 2 + t, -Dp / 2 - t); cs.lineTo(W / 2 + t, Dp / 2 + t); cs.lineTo(-W / 2 - t, Dp / 2 + t); cs.closePath();
  const hole = new THREE.Path(); hole.absarc(0, portZ, portR, 0, Math.PI * 2, true); cs.holes.push(hole);
  const cg = new THREE.ExtrudeGeometry(cs, { depth: t, bevelEnabled: false, curveSegments: 32 }); cg.rotateX(Math.PI / 2); cg.translate(0, H + t, 0);
  const ceil = new THREE.Mesh(cg, shell); g.add(ceil);
  // trocar sleeve (port)
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(portR + 0.02, portR + 0.02, 0.5, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.35, metalness: 0.4, side: THREE.DoubleSide }));
  sleeve.position.set(0, H + t + 0.18, portZ); g.add(sleeve);
  const flange = new THREE.Mesh(new THREE.TorusGeometry(portR + 0.04, 0.045, 12, 32), steel(0.3)); flange.rotation.x = Math.PI / 2; flange.position.set(0, H + t * 2 + 0.02, portZ); g.add(flange);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(portR, 0.02, 10, 32), new THREE.MeshStandardMaterial({ color: 0xb02a2a, roughness: 0.5 })); lip.rotation.x = Math.PI / 2; lip.position.set(0, H + t * 2 + 0.2, portZ); g.add(lip);
  // glow-less "camera light" strip under the ceiling for readable interior
  const lamp = new THREE.PointLight(0xdfeeff, 22, 9, 1.4); lamp.position.set(0, H - 0.4, 0.2); g.add(lamp);
  shadowAll(g);
  g.userData = { port: new THREE.Vector3(0, H + t, portZ), portNormal: new THREE.Vector3(0, -1, 0), floorY: 0, height: H, width: W, depth: Dp,
    bounds: { x: [-W / 2 + 0.1, W / 2 - 0.1], z: [-Dp / 2 + 0.1, Dp / 2 - 0.1] } };
  return g;
}

const TRAIN = { red: 0xd8332f, yellow: 0xf2c230, blue: 0x2f7fd8, green: 0x32b36a, orange: 0xf08a24, purple: 0x8a52c8 };
/** makePeg(color|name='yellow') -> bead (ring-shaped rubber bead, pickup target). Rests with base at y=0. userData: {radius, height, color} */
export function makePeg(color = 'yellow') {
  const c = typeof color === 'string' && TRAIN[color] !== undefined ? TRAIN[color] : color;
  const r = 0.11, h = 0.14;
  const prof = [[0.045, 0], [r - 0.025, 0], [r, 0.025], [r, h - 0.025], [r - 0.025, h], [0.045, h], [0.04, h / 2]].map(([x, y]) => new THREE.Vector2(x, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), new THREE.MeshStandardMaterial({ color: c, roughness: 0.35 }));
  m.name = 'Peg'; shadowAll(m); m.userData = { radius: r, height: h, color: c, kind: 'peg' };
  return m;
}
/** makePost(color) -> base disc + vertical pin (transfer target). Base at y=0, pin top at y=0.45. userData.top */
export function makePost(color = 'blue') {
  const c = typeof color === 'string' && TRAIN[color] !== undefined ? TRAIN[color] : color;
  const g = new THREE.Group(); g.name = 'Post';
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 32), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 })); base.position.y = 0.025;
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.45, 16), steel(0.3)); pin.position.y = 0.25;
  g.add(base, pin); shadowAll(g); g.userData = { top: new THREE.Vector3(0, 0.45, 0), height: 0.45, kind: 'post' };
  return g;
}
/** makeVessel(path) -> red vessel strip (tube) following array of {x,y,z}. userData: {curve, radius, distanceTo(p)->world-agnostic local distance to centreline} */
export function makeVessel(path, radius = 0.045) {
  const pts = path.map(V3);
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, pts.length * 14), radius, 14),
    new THREE.MeshStandardMaterial({ color: 0xb3151c, roughness: 0.28 }));
  m.name = 'Vessel'; shadowAll(m);
  const samples = curve.getSpacedPoints(120);
  m.userData = { curve, radius, kind: 'vessel', samples,
    distanceTo(p) { const q = V3(p); let best = Infinity; for (const s of samples) best = Math.min(best, s.distanceTo(q)); return best; } };
  m.setHighlight = (on) => { m.material.emissive.set(on ? 0xff2a2a : 0x000000); m.material.emissiveIntensity = on ? 0.6 : 0; };
  return m;
}

// ================================================================ SURGERIES ADDENDUM (low-poly, flat-shaded, no gore)
const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.02, ...extra });
const skin = () => mats.skin ||= plainSkin();

/** makeDummy() -> Group: OR table + supine patient (smooth, mostly hidden under drapes). Head at -X, feet at +X, table pad top at y=0.2.
 *  userData: {abdomen: Vector3 (abdomen centre at skin top), skinY, torsoHalfWidth, rightForearm} */
export function makeDummy() {
  const g = new THREE.Group(); g.name = 'Dummy';
  const tableSteel = new THREE.MeshStandardMaterial({ color: 0xaab2ba, metalness: 1, roughness: 0.32, roughnessMap: brushedDetail().rough });
  const table = new THREE.Mesh(new THREE.BoxGeometry(22, 0.3, 7), tableSteel); table.position.y = -0.15; g.add(table);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(21, 0.2, 6.4), flat(0x1d2328, { roughness: 0.6 })); pad.position.y = 0.1; g.add(pad);
  for (const x of [-8, 8]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 6, 20), tableSteel); leg.position.set(x, -3.3, 0); g.add(leg); }
  const base = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 3), flat(0x2a2f34)); base.position.y = -6.4; g.add(base);
  const add = (geo, x, y, z, mat = skin()) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const alongX = (geo) => { geo.rotateZ(Math.PI / 2); return geo; };
  add(alongX(new THREE.CylinderGeometry(1, 1, 6, 32)), -1, 0.9, 0).scale.set(1, 0.7, 1.5);
  const chest = add(new THREE.SphereGeometry(1, 32, 20), -3.9, 0.9, 0); chest.scale.set(0.9, 0.7, 1.5);
  const hips = add(new THREE.SphereGeometry(1, 32, 20), 2.1, 0.9, 0); hips.scale.set(0.9, 0.7, 1.4);
  add(alongX(new THREE.CylinderGeometry(0.4, 0.45, 0.7, 20)), -5.0, 0.8, 0);
  add(new THREE.SphereGeometry(0.85, 32, 24), -5.95, 1.05, 0).scale.set(1.1, 0.95, 0.9);
  for (const sz of [-1, 1]) {
    add(new THREE.SphereGeometry(0.5, 20, 14), -3.7, 1.0, sz * 1.8);
    add(alongX(new THREE.CylinderGeometry(0.4, 0.34, 3.4, 20)), -2.0, 0.7, sz * 1.95);
    add(alongX(new THREE.CylinderGeometry(0.33, 0.27, 2.6, 20)), 0.9, 0.6, sz * 1.95);
    add(new THREE.CapsuleGeometry(0.24, 0.5, 6, 16), 2.5, 0.45, sz * 1.95).rotation.z = Math.PI / 2;
    add(alongX(new THREE.CylinderGeometry(0.62, 0.45, 6.6, 24)), 5.5, 0.82, sz * 0.8);
  }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  const skinY = 1.8;
  g.userData = { abdomen: new THREE.Vector3(-0.5, skinY, 0), skinY, torsoHalfWidth: 1.5, rightForearm: new THREE.Vector3(0.9, 0.6, 1.95), kind: 'dummy' };
  return g;
}

/** makeDrapeWithWindow(w,h, winW=2.8, winH=2.2) -> {mesh, windowCenter, windowSize, prep, cavity, cavityY}.
 *  Full-body blue OR drape (neck -> past the feet, hangs over the table sides, rises into an anaesthesia screen at the head),
 *  with a fenestration at the abdomen. Mesh local y=0 is skin level: set mesh.position = dummy.userData.abdomen.
 *  `prep` = Betadine-prepped skin covering the window (hide it when the cavity opens); cavity floor at local y=cavityY. */
export function makeDrapeWithWindow(w = 6, h = 5, winW = 2.8, winH = 2.2) {
  const rim = 0.12, hem = 0.025;
  const heightFn = (x, z) => {
    const az = Math.abs(z);
    const top = rim + hem - 0.45 * sstep(2.5, 4.2, x);                                   // torso -> legs
    let y = top - (top + 1.0) * sstep(Math.max(winH / 2, 1.0), 2.7, az) ** 1.4;           // over flanks/arms
    y = Math.min(y, -1.55 + 0.8 * (1 - sstep(2.6, 3.0, az)) + 0.8);                       // rest on the pad
    y -= 2.6 * sstep(3.15, 3.75, az);                                                       // hang over the table edge
    y = Math.max(y, -4.2);
    y += 2.9 * sstep(-4.2, -4.75, x);                                                       // anaesthesia screen
    return y;
  };
  const mesh = buildDrape({ W: 20.4, D: 8.2, nx: 200, nz: 96, heightFn, winW, winH, foldAmp: 0.07, uvScale: 1.6 });
  mesh.name = 'DrapeWindow';
  mesh.add(windowHem(winW, winH, rim + 0.008, 0.03, 0.06));
  // screen bar
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 8.4, 16), steel(0.3)); bar.rotation.x = Math.PI / 2; bar.position.set(-4.75, 2.98, 0); mesh.add(bar);
  // cavity: incised skin edge -> yellow subcutaneous fat -> moist peritoneal floor
  const cavityY = -0.06, cavity = new THREE.Group(); cavity.name = 'cavity';
  const td = tissueDetail();
  const tex = canvasTex(256, 256, (c, W, H) => { const gr = c.createRadialGradient(W / 2, H / 2, W * 0.1, W / 2, H / 2, W * 0.72); gr.addColorStop(0, '#d89a8e'); gr.addColorStop(0.75, '#b8746c'); gr.addColorStop(1, '#6e3a38'); c.fillStyle = gr; c.fillRect(0, 0, W, H); });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), new THREE.MeshStandardMaterial({ map: tex, normalMap: td.normal, roughnessMap: td.rough, roughness: 1, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = cavityY; floor.receiveShadow = true; cavity.add(floor);
  const fatMat = new THREE.MeshStandardMaterial({ color: 0xe2bd72, normalMap: td.normal, roughness: 0.45, metalness: 0 }), wh = rim - cavityY;
  for (const [sx, sz, len, ry] of [[0, -1, winW, 0], [0, 1, winW, 0], [-1, 0, winH, Math.PI / 2], [1, 0, winH, Math.PI / 2]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, wh, 0.05), fatMat); wall.rotation.y = ry;
    wall.position.set(sx * winW / 2, cavityY + wh / 2, sz * winH / 2); cavity.add(wall); }
  mesh.add(cavity);
  const prep = new THREE.Mesh(new THREE.PlaneGeometry(winW + 0.08, winH + 0.08), prepSkinMaterial(winW + 0.08, winH + 0.08));
  prep.rotation.x = -Math.PI / 2; prep.position.y = rim - 0.01; prep.receiveShadow = true; mesh.add(prep); mesh.userData.prep = prep;
  mesh.traverse((m) => { if (m.isMesh) m.receiveShadow = true; });
  return { mesh, prep, cavity, cavityY, windowCenter: new THREE.Vector3(0, 0, 0), windowSize: { w: winW, h: winH } };
}
/** shared Betadine-prepped skin material for a winW x winH patch (SURGERY: use for the skin halves instead of a flat tan). */
export function prepSkinMaterial(w = 2.8, h = 2.2) { const k = 'prep' + w + 'x' + h; return mats[k] ||= makeSkinMaterial({ w, h, prep: true, repeat: 3 }); }

function tubeAlong(pts, r, mat, seg = 6) { return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(V3)), pts.length * 6, r, seg), mat); }
const smooth = (color, extra = {}) => { const t = tissueDetail(); return new THREE.MeshStandardMaterial({ color, map: t.map, normalMap: t.normal, normalScale: new THREE.Vector2(0.35, 0.35), roughnessMap: t.rough, roughness: 1, metalness: 0, envMapIntensity: 0.9, ...extra, ...(extra.roughness !== undefined ? { roughness: Math.min(1, extra.roughness * 1.6) } : {}) }); };
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Haustrated colon segment along Z (z from z0 to z1) at axis height y, gentle lateral bend; with 3 taeniae coli and small epiploic fat appendages. */
function colonSegment(z0, z1, y, x0 = 0, bendAmp = 0.08) {
  const g = new THREE.Group(), len = z1 - z0, mat = smooth(0xd8a68e, { roughness: 0.55 });
  const bend = (z) => x0 + bendAmp * Math.sin((z - z0) / len * Math.PI);
  const prof = [];
  for (let i = 0; i <= 48; i++) { const z = len * i / 48; const cap = Math.min(1, Math.sqrt(Math.max(0, Math.min(z, len - z) / 0.12)));
    prof.push([z, (0.235 + 0.05 * Math.sin(Math.PI * z / 0.4) ** 2) * cap]); }
  const body = latheAlongZ(prof, mat, 24); const pa = body.geometry.attributes.position;
  for (let i = 0; i < pa.count; i++) { const z = pa.getZ(i); pa.setX(i, pa.getX(i) + bend(z + z0)); pa.setZ(i, z + z0); pa.setY(i, pa.getY(i) + y); }
  body.geometry.computeVertexNormals(); g.add(body);
  const tm = smooth(0xc79c78, { roughness: 0.5 });
  for (const ang of [Math.PI / 2, Math.PI * 7 / 6, Math.PI * 11 / 6]) {
    const pts = []; for (let i = 0; i <= 24; i++) { const z = z0 + 0.1 + (len - 0.2) * i / 24; pts.push(new THREE.Vector3(bend(z) + 0.268 * Math.cos(ang), y + 0.268 * Math.sin(ang), z)); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.017, 6), tm));
  }
  const fat = smooth(0xe8c66e);
  [[0.3, 0.6], [0.55, 2.4], [0.8, 4.0], [0.4, 5.3]].forEach(([t, ang], i) => { const z = z0 + len * (0.15 + 0.7 * t + 0.02 * i), e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), fat);
    e.scale.set(1, 0.7, 1.5); e.position.set(bend(z) + 0.29 * Math.cos(ang), y + 0.29 * Math.sin(ang), z); g.add(e); });
  return g;
}

/** makeOrgan(kind) kind: 'appendix'|'colon'|'gallbladder'|'liver'|'artery'. Stylised anatomy (smooth/low-poly, no gore), lying in XZ near origin.
 *  userData: {kind, anchor (organ-local Vector3 to grasp/cut), radius, scale, base?/curve?}. */
export function makeOrgan(kind = 'appendix') {
  const g = new THREE.Group(); g.name = 'Organ_' + kind;
  let anchor = new THREE.Vector3(), radius = 0.2, extra = {};
  if (kind === 'appendix') {
    // cecum (rounded pouch) with ascending colon continuing up (-Z), terminal ileum entering from the left (-X), appendix off the posteromedial wall
    const cec = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 18), smooth(0xd8a68e, { roughness: 0.55 })); cec.position.set(-0.95, 0.25, 0.4); cec.scale.set(1, 0.8, 1.05); g.add(cec);
    g.add(colonSegment(-1.2, 0.35, 0.25, -0.95, 0.04));
    const il = tubeAlong([{ x: -2.1, y: 0.18, z: 1.1 }, { x: -1.75, y: 0.2, z: 0.8 }, { x: -1.4, y: 0.24, z: 0.42 }], 0.1, smooth(0xe9a698), 12); g.add(il);
    const jn = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.03, 8, 16), smooth(0xcf8f82)); jn.position.set(-1.43, 0.24, 0.42); jn.lookAt(-1.43 + 1, 0.24 - 0.12, 0.42 - 0.35); g.add(jn);
    const pts = [{ x: -0.55, y: 0.14, z: 0.3 }, { x: -0.2, y: 0.17, z: 0.05 }, { x: 0.25, y: 0.17, z: 0.18 }, { x: 0.65, y: 0.15, z: -0.05 }];
    const curve = new THREE.CatmullRomCurve3(pts.map(V3)), pm = smooth(0xd98078, { roughness: 0.5 });
    const ap = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.09, 12), pm); g.add(ap);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), pm); tip.position.copy(curve.getPoint(1)); g.add(tip);
    // mesoappendix fan + appendicular artery on its free edge
    const N = 24, fv = [], fi = [], edge = [];
    for (let i = 0; i <= N; i++) { const t = i / N, c = curve.getPoint(t), w = 0.38 * (1 - 0.75 * t); fv.push(c.x, c.y - 0.05, c.z, c.x + 0.04 * t, 0.03, c.z + w); edge.push(new THREE.Vector3(c.x + 0.04 * t, 0.035, c.z + w * 0.97));
      if (i < N) { const k = i * 2; fi.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fv, 3)); fg.setIndex(fi); fg.computeVertexNormals();
    g.add(new THREE.Mesh(fg, smooth(0xecd09a, { side: THREE.DoubleSide, roughness: 0.7 })));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 40, 0.014, 6), smooth(0xb02e32, { roughness: 0.4 })));
    anchor.set(0.2, 0.17, 0.15); radius = 0.15; extra.base = new THREE.Vector3(-0.55, 0.14, 0.3); extra.curve = curve; g.scale.setScalar(0.75);
  } else if (kind === 'colon') {
    g.add(colonSegment(-1.2, 1.2, 0.25, 0, 0.12));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), smooth(0xd8a68e)); cap.position.set(0, 0.25, 1.28); cap.scale.set(1, 0.9, 0.9); g.add(cap);
    anchor.set(0, 0.25, -0.95); radius = 0.27; g.scale.setScalar(0.55);
  } else if (kind === 'gallbladder') {
    const m = smooth(0x5f7f3e, { roughness: 0.35 });
    // pear-shaped sac along X: fundus (x<0) -> body -> neck (x>0)
    const prof = []; for (let i = 0; i <= 40; i++) { const t = i / 40, x = -0.5 + 1.05 * t; const r = 0.33 * Math.sin(Math.PI * Math.pow(t, 0.8)) ** 0.7 * (1 - 0.65 * ss(0.5, 1, t)) + 0.045 * ss(0.8, 1, t); prof.push([x, Math.max(r, 0.001)]); }
    const sac = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([x, r]) => new THREE.Vector2(r, x)), 28), m); sac.geometry.rotateZ(-Math.PI / 2); sac.scale.set(1, 0.8, 0.85); g.add(sac);
    const dm = smooth(0xc3b85c, { roughness: 0.45 });
    g.add(tubeAlong([{ x: 0.55, y: 0, z: 0 }, { x: 0.72, y: 0.03, z: 0.06 }, { x: 0.95, y: 0.06, z: 0.1 }], 0.035, dm, 10));            // cystic duct
    g.add(tubeAlong([{ x: 1.25, y: 0.07, z: -0.6 }, { x: 1.05, y: 0.065, z: -0.2 }, { x: 0.95, y: 0.06, z: 0.1 }], 0.045, dm, 10));        // common hepatic duct
    g.add(tubeAlong([{ x: 0.95, y: 0.06, z: 0.1 }, { x: 0.9, y: 0.05, z: 0.45 }, { x: 0.85, y: 0.04, z: 0.85 }], 0.05, dm, 10));          // common bile duct
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), smooth(0x7d2f2b, { roughness: 0.3 })); lobe.scale.set(1.0, 0.2, 0.55); lobe.position.set(-0.15, 0.3, -0.5); g.add(lobe); // underside of right liver lobe
    anchor.set(0.9, 0.05, 0.1); radius = 0.38;
  } else if (kind === 'liver') {
    const geo = new THREE.SphereGeometry(1, 48, 28), pa = geo.attributes.position;
    const sy = (x) => 1 - 0.5 * ss(-0.2, -1, x), sz = (x) => 1 - 0.55 * ss(-0.2, -1, x);
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      pa.setXYZ(i, x * 1.9 + 0.15, y > 0 ? y * 0.5 * sy(x) : y * 0.12 * sy(x), z * 0.95 * sz(x) - (y < 0 ? 0 : 0)); }
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, smooth(0x7a2b27, { roughness: 0.28 })));
    const fx = -0.2 * 1.9 + 0.15, fp = []; for (let i = 0; i <= 20; i++) { const z = -0.55 + 1.1 * i / 20, xs = (fx - 0.15) / 1.9; const zz = z / (0.95 * sz(xs)); fp.push(new THREE.Vector3(fx, 0.5 * sy(xs) * Math.sqrt(Math.max(0, 1 - xs * xs - zz * zz)) + 0.006, z)); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fp), 30, 0.025, 6), smooth(0xd7b69a)));
    anchor.set(0, 0.4, 0); radius = 1;
  } else if (kind === 'artery') {
    const pts = [{ x: -1.6, y: 0.1, z: 0.12 }, { x: -0.8, y: 0.12, z: -0.08 }, { x: 0.3, y: 0.1, z: 0.1 }, { x: 1.2, y: 0.12, z: -0.05 }, { x: 1.7, y: 0.1, z: 0.1 }];
    g.add(tubeAlong(pts, 0.1, smooth(0xa52a30, { roughness: 0.3 }), 20));
    extra.curve = new THREE.CatmullRomCurve3(pts.map(V3)); anchor.set(0.3, 0.1, 0.15); radius = 0.1;
  } else throw new Error('makeOrgan: unknown kind ' + kind);
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  g.userData = { kind, anchor, radius, scale: g.scale.x, ...extra }; // anchor/curve are organ-local (group is scaled): use organ.localToWorld
  return g;
}

/** makeVitalsMonitor() -> {mesh, setVitals({hr,bp:'120/80',spo2}), setAlarm(bool)}. Screen animates a scrolling ECG by itself (rendered each frame via onBeforeRender).
 *  Faces +Z; ~3 wide x 2.2 tall on a stand. */
export function makeVitalsMonitor() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 320; const x = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const st = { hr: 72, bp: '120/80', spo2: 98, alarm: false }, trace = new Float32Array(300); let phase = 0, lastT = performance.now(), acc = 0, lastDraw = 0;
  const beat = (p) => { // one PQRST cycle, p in 0..1
    if (p < 0.1) return 0.1 * Math.sin(p / 0.1 * Math.PI); if (p > 0.16 && p < 0.19) return -0.15; if (p >= 0.19 && p < 0.23) return 1 - Math.abs(p - 0.21) / 0.02 * 1;
    if (p >= 0.23 && p < 0.26) return -0.25; if (p > 0.4 && p < 0.55) return 0.22 * Math.sin((p - 0.4) / 0.15 * Math.PI); return 0; };
  const draw = (now) => {
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    const bps = st.hr / 60; for (acc += dt * 120; acc >= 1; acc--) { phase = (phase + bps / 120) % 1; trace.copyWithin(0, 1); trace[299] = beat(phase); }
    x.fillStyle = '#05090c'; x.fillRect(0, 0, 512, 320);
    const col = st.alarm ? '#ff5a4d' : '#36e08a';
    x.strokeStyle = col; x.lineWidth = 2.5; x.beginPath();
    for (let i = 0; i < 300; i++) { const px = 10 + i * 1.5, py = 90 - trace[i] * 55; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke();
    x.fillStyle = 'rgba(54,224,138,0.5)'; x.fillRect(10 + (phase * 300 | 0) * 0 + 0, 0, 0, 0);
    x.font = '600 14px Inter, Arial, sans-serif'; x.fillStyle = '#7a8a94'; x.fillText('ECG II', 12, 18);
    x.font = '700 64px Inter, Arial, sans-serif'; x.fillStyle = col; x.fillText(String(Math.round(st.hr)), 20, 205); x.font = '600 16px Inter, Arial'; x.fillText('HR bpm', 24, 228);
    x.fillStyle = '#e8d44d'; x.font = '700 44px Inter, Arial'; x.fillText(st.bp, 190, 190); x.font = '600 16px Inter, Arial'; x.fillText('NIBP mmHg', 194, 214);
    x.fillStyle = '#4dc3ff'; x.font = '700 64px Inter, Arial'; x.fillText(String(Math.round(st.spo2)), 390, 205); x.font = '600 16px Inter, Arial'; x.fillText('SpO2 %', 392, 228);
    if (st.alarm && (now / 400 | 0) % 2) { x.fillStyle = '#ff5a4d'; x.fillRect(0, 300, 512, 20); }
    tex.needsUpdate = true;
  };
  draw(performance.now());
  const g = new THREE.Group(); g.name = 'VitalsMonitor';
  const shell = new THREE.Mesh(new THREE.BoxGeometry(3.1, 2.3, 0.35), flat(0x1b1f24, { flatShading: false, roughness: 0.5 })); shell.position.y = 3.2; g.add(shell);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.75), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); screen.position.set(0, 3.25, 0.18); g.add(screen);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.1, 10), steel(0.3)); pole.position.y = 1.05; g.add(pole);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.12, 20), handleMat()); foot.position.y = 0.06; g.add(foot);
  screen.onBeforeRender = () => { const n = performance.now(); if (n - lastDraw > 33) { lastDraw = n; draw(n); } };
  shadowAll(g);
  return { mesh: g, setVitals(v = {}) { Object.assign(st, v); }, setAlarm(b) { st.alarm = !!b; } };
}

/** makeForearm() -> Group: low-poly forearm + hand lying along X (hand at +X), skin top at y=skinY, resting on y=0.
 *  userData: {skinY, wound: {start,end (Vector3, on skin), center}, suturePairs:[{entry,exit}x3] (across the wound, z +-0.2), setClosed(t 0..1), bite(i) marks stitch i} */
export function makeForearm() {
  const g = new THREE.Group(); g.name = 'Forearm';
  const R = 0.9;
  const arm = new THREE.CylinderGeometry(0.7, 0.95, 5, 40); arm.rotateZ(Math.PI / 2); // wrist at -? thin end at +X (hand)
  const armSkin = makeSkinMaterial({ w: 5, h: 3, prep: true, repeat: 2 }); const m1 = new THREE.Mesh(arm, armSkin); m1.position.set(0, R * 0.9, 0); m1.scale.set(1, 0.9, 1); g.add(m1);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 1.2), skin()); hand.position.set(3.2, 0.5, 0); g.add(hand);
  for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.22), skin()); f.position.set(4.2, 0.45, -0.45 + i * 0.3); g.add(f); }
  const th = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.25), skin()); th.position.set(3.5, 0.42, 0.75); th.rotation.y = -0.5; g.add(th);
  const skinY = R * 0.9 + 0.95 * 0.9 * 0.97;
  // laceration: pink-red gap + dark centre line; closed progressively
  const start = new THREE.Vector3(-0.8, skinY, -0.05), end = new THREE.Vector3(0.8, skinY, 0.1);
  const len = start.distanceTo(end);
  const woundMat = new THREE.MeshBasicMaterial({ color: 0x7a2e34 }), wound = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.16), woundMat);
  wound.rotation.x = -Math.PI / 2; wound.position.copy(start).lerp(end, 0.5); wound.position.y += 0.012; wound.rotation.z = -Math.atan2(end.z - start.z, end.x - start.x); g.add(wound);
  const edge = new THREE.Mesh(new THREE.PlaneGeometry(len + 0.1, 0.3), new THREE.MeshBasicMaterial({ color: 0xd98a86, transparent: true, opacity: 0.6, depthWrite: false })); edge.rotation.copy(wound.rotation); edge.position.copy(wound.position); edge.position.y -= 0.004; g.add(edge);
  const marks = [];
  const pairs = [0.2, 0.5, 0.8].map((t) => { const c = start.clone().lerp(end, t); return { entry: c.clone().add(new THREE.Vector3(0, 0, -0.22)), exit: c.clone().add(new THREE.Vector3(0, 0, 0.22)) }; });
  pairs.forEach((p) => { for (const q of [p.entry, p.exit]) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.045, 10), new THREE.MeshBasicMaterial({ color: 0x2a5ea8 })); d.rotation.x = -Math.PI / 2; d.position.copy(q); d.position.y += 0.015; g.add(d); } });
  g.userData = { skinY, wound: { start, end, center: start.clone().lerp(end, 0.5) }, suturePairs: pairs, kind: 'forearm',
    setClosed(t) { wound.scale.y = Math.max(0.05, 1 - t); edge.scale.y = 1 - 0.5 * t; },
    bite(i, color = 0x1a1d6e) { const p = pairs[i]; const s = tubeAlong([p.entry, p.entry.clone().lerp(p.exit, 0.5), p.exit].map((v) => v.clone().setY(skinY + 0.03)), 0.022, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }), 5); g.add(s); marks.push(s); return s; } };
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}
