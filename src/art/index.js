// ART: procedural models/materials for Steady Hands. See docs/NOTES.md (ART section) for API.
// Units: 1 unit = 10 cm (so 0.01 unit = 1 mm). Y is up. Pad lies in the XZ plane, top surface at y = pad.userData.surfaceY.
// Instrument convention: tip at local origin, instrument body extends toward +Z (so the tool "points" along -Z).
import * as THREE from 'three';

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
function rand(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

let _brushed;
function brushedMap() { // streaks along texture U; used as roughness + bump for an anisotropic feel
  if (_brushed) return _brushed;
  const r = rand(7);
  _brushed = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const v = 90 + r() * 90 | 0;
      g.fillStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.4})`;
      g.fillRect(r() * w, r() * h, 20 + r() * 120, 1);
    }
  }, { linear: true, repeat: [1, 1] });
  return _brushed;
}
const mats = {};
function steel(rough = 0.26) {
  const k = 'steel' + rough;
  return mats[k] ||= new THREE.MeshPhysicalMaterial({
    color: 0xd7dade, metalness: 1, roughness: rough, roughnessMap: brushedMap(), bumpMap: brushedMap(), bumpScale: 0.15,
    clearcoat: 0.05, envMapIntensity: 1.25,
  });
}
const blackMat = () => mats.black ||= new THREE.MeshPhysicalMaterial({ color: 0x0b0c0e, roughness: 0.78, metalness: 0.05, clearcoat: 0.08 });
const handleMat = () => mats.handle ||= new THREE.MeshPhysicalMaterial({ color: 0x1a1d22, roughness: 0.45, metalness: 0.3, clearcoat: 0.4 });
const goldMat = () => mats.gold ||= new THREE.MeshPhysicalMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.3, envMapIntensity: 1.2 });

function shadowAll(o, cast = true, recv = true) { o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = recv; } }); return o; }

// ---------------------------------------------------------------- lights
export function makeORLights(scene) {
  scene.background = new THREE.Color(0x0d1115);
  scene.fog = new THREE.Fog(0x0d1115, 14, 40);
  // studio-style procedural environment for the metal reflections (no renderer needed; three PMREMs equirects itself)
  const env = canvasTex(512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#9fb4c8'); gr.addColorStop(0.5, '#4a5560'); gr.addColorStop(1, '#1c2228');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.fillRect(w * 0.15, h * 0.08, w * 0.22, h * 0.16);   // overhead softboxes
    g.fillRect(w * 0.60, h * 0.05, w * 0.25, h * 0.2);
    g.fillStyle = '#9fc4e8'; g.fillRect(w * 0.42, h * 0.3, w * 0.06, h * 0.3); // cool strip
    g.fillStyle = '#fff2e0'; g.fillRect(0, h * 0.4, w * 0.05, h * 0.2);
  });
  env.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = env;
  scene.environmentIntensity = 0.9;

  const key = new THREE.SpotLight(0xe9f3ff, 85, 0, 0.62, 0.55, 1.6); // cool-white key from above
  key.position.set(1.2, 9, 2.2);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.02; key.shadow.radius = 5;
  key.shadow.camera.near = 3; key.shadow.camera.far = 20;
  const fill = new THREE.HemisphereLight(0xcfe0f2, 0x1a1410, 0.3);
  const rim = new THREE.DirectionalLight(0xbcd4ff, 0.5); rim.position.set(-6, 4, -5);
  const warm = new THREE.PointLight(0xffe2c8, 14, 14, 1.8); warm.position.set(-3.5, 3, 4);
  const g = new THREE.Group(); g.name = 'ORLights';
  g.add(key, key.target, fill, rim, warm);
  scene.add(g);
  return { group: g, key, fill, rim, dispose() { scene.remove(g); } }; // renderer.shadowMap.enabled must be true
}

// ---------------------------------------------------------------- drape / table
export function makeDrape(w = 16, d = 12) {
  const tex = canvasTex(512, 512, (g, W, H) => {
    g.fillStyle = '#1f5a4b'; g.fillRect(0, 0, W, H);
    const r = rand(3);
    for (let i = 0; i < 5000; i++) { const v = r(); g.fillStyle = `rgba(${v > .5 ? 255 : 0},${v > .5 ? 255 : 30},${v > .5 ? 255 : 20},0.04)`; g.fillRect(r() * W, r() * H, 2 + r() * 6, 1 + r() * 2); }
  }, { repeat: [w / 2, d / 2] });
  const bump = canvasTex(256, 256, (g, W, H) => { const r = rand(11); g.fillStyle = '#888'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 700; i++) { const v = 100 + r() * 100 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * W, r() * H, 3 + r() * 30, 2); } },
    { linear: true, repeat: [w / 2, d / 2] });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshPhysicalMaterial({ map: tex, bumpMap: bump, bumpScale: 0.6, roughness: 0.92, sheen: 0.6, sheenColor: new THREE.Color(0x6fbfa6) }));
  m.rotation.x = -Math.PI / 2; m.receiveShadow = true; m.name = 'drape';
  return m;
}

// ---------------------------------------------------------------- tissue pad
function roundedRectShape(w, d, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** makeTissuePad({width=6, depth=4, thickness=0.35, drape=true}) -> Group.
 *  userData: {width, depth, thickness, surfaceY, top (mesh), toUV(x,z)->{u,v}, contains(x,z)}. Pad centred on x=z=0. */
export function makeTissuePad(o = {}) {
  const width = o.width ?? 6, depth = o.depth ?? 4, th = o.thickness ?? 0.35;
  const group = new THREE.Group(); group.name = 'TissuePad';
  const pink = new THREE.Color(0xe9b9ad);
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: pink, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.5, sheen: 1, sheenColor: new THREE.Color(0xff9a95), sheenRoughness: 0.5 });
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(width, depth, 0.28), { depth: th - 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 4, curveSegments: 12 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, 0.03, 0);
  const body = new THREE.Mesh(geo, bodyMat); body.name = 'padBody';
  group.add(body);
  const surfaceY = th + 0.0005;
  // printed top surface: skin colour, mottling, rulers and registration marks
  const pxm = 320; // px per unit
  const tex = canvasTex(Math.round(width * pxm / 2) * 2, Math.round(depth * pxm / 2) * 2, (g, W, H) => {
    g.fillStyle = '#ebbdb0'; g.fillRect(0, 0, W, H);
    const r = rand(5);
    for (let i = 0; i < 260; i++) { const x = r() * W, y = r() * H, rad = 20 + r() * 90; const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const c = r() > .5 ? '255,205,195' : '215,150,140'; gr.addColorStop(0, `rgba(${c},0.10)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    for (let i = 0; i < 7000; i++) { g.fillStyle = `rgba(120,60,60,${r() * 0.05})`; g.fillRect(r() * W, r() * H, 1.5, 1.5); }
    g.strokeStyle = 'rgba(40,60,90,0.55)'; g.fillStyle = 'rgba(40,60,90,0.65)'; g.lineWidth = 1.5; g.font = '15px Inter, Arial, sans-serif';
    const mm = pxm / 10; // 1 mm in px
    const m = 28; // ruler inset
    for (let i = 0; i * mm < W - 2 * m; i++) { const x = m + i * mm, L = i % 10 === 0 ? 14 : i % 5 === 0 ? 9 : 5;
      g.beginPath(); g.moveTo(x, m); g.lineTo(x, m + L); g.moveTo(x, H - m); g.lineTo(x, H - m - L); g.stroke();
      if (i % 10 === 0 && i) g.fillText(String(i / 10), x - 4, m + 28); }
    for (let i = 0; i * mm < H - 2 * m; i++) { const y = m + i * mm, L = i % 10 === 0 ? 14 : i % 5 === 0 ? 9 : 5;
      g.beginPath(); g.moveTo(m, y); g.lineTo(m + L, y); g.moveTo(W - m, y); g.lineTo(W - m - L, y); g.stroke(); }
    g.setLineDash([3, 9]); g.strokeStyle = 'rgba(40,60,90,0.22)';
    g.beginPath(); g.moveTo(W / 2, m + 20); g.lineTo(W / 2, H - m - 20); g.moveTo(m + 20, H / 2); g.lineTo(W - m - 20, H / 2); g.stroke();
    g.setLineDash([]); g.strokeStyle = 'rgba(40,60,90,0.5)';
    for (const [cx, cy] of [[W / 2, H / 2]]) { g.beginPath(); g.arc(cx, cy, 10, 0, 7); g.moveTo(cx - 18, cy); g.lineTo(cx + 18, cy); g.moveTo(cx, cy - 18); g.lineTo(cx, cy + 18); g.stroke(); }
  });
  const bump = canvasTex(256, 256, (g, W, H) => { const r = rand(21); g.fillStyle = '#808080'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 3000; i++) { const v = 110 + r() * 50 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * W, r() * H, 2, 2); } }, { linear: true, repeat: [width, depth] });
  const top = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.12, depth - 0.12),
    new THREE.MeshPhysicalMaterial({ map: tex, bumpMap: bump, bumpScale: 0.25, roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.45, sheen: 1, sheenColor: new THREE.Color(0xff9a95), sheenRoughness: 0.5 }));
  top.rotation.x = -Math.PI / 2; top.position.y = surfaceY; top.name = 'padTop';
  group.add(top);
  if (o.drape !== false) { const d = makeDrape(); d.position.y = -0.002; group.add(d); }
  shadowAll(group);
  Object.assign(group.userData, {
    width, depth, thickness: th, surfaceY, top,
    toUV: (x, z) => ({ u: x / (width - 0.12) + 0.5, v: z / (depth - 0.12) + 0.5 }),
    contains: (x, z) => Math.abs(x) <= (width - 0.12) / 2 && Math.abs(z) <= (depth - 0.12) / 2,
  });
  return group;
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
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = surfaceY + 0.002; mesh.renderOrder = 2; mesh.name = 'incisionDecal';
  pad.add(mesh);
  const compose = () => { og.clearRect(0, 0, cw, ch); og.drawImage(guideC, 0, 0); og.drawImage(cutC, 0, 0); og.drawImage(markC, 0, 0); tex.needsUpdate = true; dirty = false; };
  compose();
  mesh.onBeforeRender = () => { if (dirty) compose(); };
  const api = {
    mesh, texture: tex,
    setGuide(pts, { color = '#1d4f9a', dashed = true, width: lw = 3 } = {}) {
      gg.clearRect(0, 0, cw, ch); if (!pts || pts.length < 2) { dirty = true; return; }
      gg.strokeStyle = color; gg.lineWidth = lw; gg.lineCap = 'round'; gg.lineJoin = 'round'; gg.globalAlpha = 0.85;
      if (dashed) gg.setLineDash([12, 9]);
      gg.beginPath(); pts.forEach((p, i) => (i ? gg.lineTo(px(p.x), py(p.z)) : gg.moveTo(px(p.x), py(p.z)))); gg.stroke();
      gg.setLineDash([]); gg.globalAlpha = 1;
      for (const p of [pts[0], pts[pts.length - 1]]) { gg.fillStyle = color; gg.beginPath(); gg.arc(px(p.x), py(p.z), 6, 0, 7); gg.fill(); }
      dirty = true;
    },
    addPoint(x, z, d = 0.5) {
      const p = { x: px(x), y: py(z) };
      if (last) {
        const w = 2.5 + d * 4;
        const seg = (c, lw, a, off = 0) => { cg.strokeStyle = c; cg.lineWidth = lw; cg.globalAlpha = a; cg.lineCap = 'round'; cg.beginPath(); cg.moveTo(last.x + off, last.y + off); cg.lineTo(p.x + off, p.y + off); cg.stroke(); };
        seg('rgba(255,235,228,1)', w + 3.5, 0.55, 0.9);  // lit lip of the slit
        seg('rgba(70,25,28,1)', w + 1.8, 0.55);           // groove shoulder
        seg('rgba(12,4,6,1)', w, 0.95);                   // groove core
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
      const gr = mg.createRadialGradient(px(x), py(z), 0, px(x), py(z), 28); gr.addColorStop(0, 'rgba(210,40,40,0.55)'); gr.addColorStop(1, 'rgba(210,40,40,0)');
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
  const holder = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.28), steel(0.3)); holder.position.set(0, 0.125, 0.72); g.add(holder);
  const handle = latheAlongZ([[0.85, 0.035], [0.95, 0.052], [1.3, 0.07], [1.9, 0.075], [2.3, 0.055], [2.35, 0.0]], steel(0.3));
  handle.scale.set(0.8, 1, 1); handle.position.y = 0.13; g.add(handle);
  for (let i = 0; i < 12; i++) { // grip rings
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.073, 0.007, 8, 24), steel(0.35)); ring.scale.set(0.8, 1, 1);
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
    const shank = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 1.0), steel(0.28)); shank.position.set(sgn * 0.015, 0, 0.5);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 12, 32), steel(0.25)); ring.rotation.x = Math.PI / 2; ring.scale.set(0.8, 1, 1.15);
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
  const shaft = latheAlongZ([[0.14, 0.032], [0.2, 0.032], [L, 0.032], [L, 0]], steel(0.22), 20); g.add(shaft);
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
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.5, 8, 16), handleMat()); body.rotation.x = Math.PI / 2; body.position.z = hz + 0.3; g.add(body);
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
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, t, Dp), new THREE.MeshPhysicalMaterial({ map: floorTex, roughness: 0.7, clearcoat: 0.1 })); floor.position.y = -t / 2; g.add(floor);
  const box = (w, h, d, x, y, z, m = shell) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  const backMat = new THREE.MeshPhysicalMaterial({ color: 0x15181c, roughness: 0.85 });
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
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(portR + 0.02, portR + 0.02, 0.5, 32, 1, true), new THREE.MeshPhysicalMaterial({ color: 0x2a2d33, roughness: 0.35, metalness: 0.4, side: THREE.DoubleSide }));
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
  const m = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25, sheen: 0.4 }));
  m.name = 'Peg'; shadowAll(m); m.userData = { radius: r, height: h, color: c, kind: 'peg' };
  return m;
}
/** makePost(color) -> base disc + vertical pin (transfer target). Base at y=0, pin top at y=0.45. userData.top */
export function makePost(color = 'blue') {
  const c = typeof color === 'string' && TRAIN[color] !== undefined ? TRAIN[color] : color;
  const g = new THREE.Group(); g.name = 'Post';
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 32), new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.4, clearcoat: 0.4 })); base.position.y = 0.025;
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.45, 16), steel(0.3)); pin.position.y = 0.25;
  g.add(base, pin); shadowAll(g); g.userData = { top: new THREE.Vector3(0, 0.45, 0), height: 0.45, kind: 'post' };
  return g;
}
/** makeVessel(path) -> red vessel strip (tube) following array of {x,y,z}. userData: {curve, radius, distanceTo(p)->world-agnostic local distance to centreline} */
export function makeVessel(path, radius = 0.045) {
  const pts = path.map(V3);
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, pts.length * 14), radius, 14),
    new THREE.MeshPhysicalMaterial({ color: 0xb3151c, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.5, sheenColor: new THREE.Color(0xff6a6a) }));
  m.name = 'Vessel'; shadowAll(m);
  const samples = curve.getSpacedPoints(120);
  m.userData = { curve, radius, kind: 'vessel', samples,
    distanceTo(p) { const q = V3(p); let best = Infinity; for (const s of samples) best = Math.min(best, s.distanceTo(q)); return best; } };
  m.setHighlight = (on) => { m.material.emissive.set(on ? 0xff2a2a : 0x000000); m.material.emissiveIntensity = on ? 0.6 : 0; };
  return m;
}
