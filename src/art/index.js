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

  const key = new THREE.SpotLight(0xe9f3ff, 50, 0, 0.62, 0.55, 1.6); // cool-white key from above
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
    g.fillStyle = '#d9a396'; g.fillRect(0, 0, W, H);
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

// ================================================================ SURGERIES ADDENDUM (low-poly, flat-shaded, no gore)
const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8, metalness: 0.02, ...extra });
const skin = () => mats.skin ||= flat(0xcfc4b3);

/** makeDummy() -> Group: OR table + supine CPR-style mannequin, arms at sides attached at the shoulders. Head at -X, feet at +X, table pad top at y=0.2.
 *  userData: {abdomen: Vector3 (abdomen centre at skin top), skinY, torsoHalfWidth, rightForearm} */
export function makeDummy() {
  const g = new THREE.Group(); g.name = 'Dummy';
  const table = new THREE.Mesh(new THREE.BoxGeometry(22, 0.3, 7), new THREE.MeshPhysicalMaterial({ color: 0x9aa3ab, metalness: 0.9, roughness: 0.35 }));
  table.position.y = -0.15; g.add(table);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(21, 0.2, 6.4), flat(0x2c4a5a)); pad.position.y = 0.1; g.add(pad);
  for (const x of [-8, 8]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 6, 8), flat(0x70787f)); leg.position.set(x, -3.3, 0); g.add(leg); }
  const base = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 3), flat(0x4a5056)); base.position.y = -6.4; g.add(base);
  const add = (geo, x, y, z, mat = skin()) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const alongX = (geo) => { geo.rotateZ(Math.PI / 2); return geo; };
  // torso: elliptical low-poly cylinder, half-width 1.5 (z), half-height 0.8 (y); top at y=1.8
  add(alongX(new THREE.CylinderGeometry(1, 1, 6, 8)), -1, 0.9, 0).scale.set(1, 0.7, 1.5);
  const chest = add(new THREE.SphereGeometry(1, 8, 6), -3.9, 0.9, 0); chest.scale.set(0.9, 0.7, 1.5);
  const hips = add(new THREE.SphereGeometry(1, 8, 6), 2.1, 0.9, 0); hips.scale.set(0.9, 0.7, 1.4);
  // short neck + small round head, face on top (supine)
  add(alongX(new THREE.CylinderGeometry(0.4, 0.45, 0.7, 8)), -5.0, 0.8, 0);
  add(new THREE.IcosahedronGeometry(0.85, 1), -5.95, 1.05, 0);
  const dark = flat(0x2b2f36);
  for (const sz of [-1, 1]) add(new THREE.SphereGeometry(0.09, 6, 4), -6.1, 1.86, sz * 0.3, dark);
  add(new THREE.ConeGeometry(0.12, 0.28, 4), -5.9, 1.98, 0, flat(0xbfb3a1));
  add(new THREE.BoxGeometry(0.06, 0.04, 0.4), -5.55, 1.86, 0, dark);
  for (const sz of [-1, 1]) {
    add(new THREE.SphereGeometry(0.5, 7, 5), -3.7, 1.0, sz * 1.8);                                   // shoulder joint
    add(alongX(new THREE.CylinderGeometry(0.4, 0.34, 3.4, 7)), -2.0, 0.7, sz * 1.95);                  // arm at the side, resting on pad
    add(alongX(new THREE.CylinderGeometry(0.33, 0.27, 2.6, 7)), 0.9, 0.6, sz * 1.95);                  // forearm
    add(new THREE.BoxGeometry(0.9, 0.2, 0.55), 2.5, 0.43, sz * 1.95);                                   // hand
    add(alongX(new THREE.CylinderGeometry(0.62, 0.45, 6.6, 7)), 5.5, 0.82, sz * 0.8);                  // leg
  }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  const skinY = 1.8; // drape level (torso top is at 1.6, leaving room for the cavity)
  g.userData = { abdomen: new THREE.Vector3(-0.5, skinY, 0), skinY, torsoHalfWidth: 1.5, rightForearm: new THREE.Vector3(0.9, 0.6, 1.95), kind: 'dummy' };
  return g;
}

/** makeDrapeWithWindow(w=6,h=5, winW=2.8, winH=2.2) -> {mesh, windowCenter, windowSize, prep, cavity, cavityY}.
 *  Drape follows the body contour (droops over the sides). Mesh local y=0 is skin level: set mesh.position to dummy.userData.abdomen.
 *  Window shows a shallow dark-rimmed cavity (floor at local y=cavityY, organs rest there); `prep` is a tan skin-prep patch covering it (visible by default;
 *  hide it when the incision opens the cavity). */
export function makeDrapeWithWindow(w = 6, h = 5, winW = 2.8, winH = 2.2) {
  const nx = 48, nz = 40, pos = [], idx = [], rim = 0.12;
  const prof = (z, x) => { const az = Math.abs(z), ax = Math.abs(x);
    let y = az < 1.5 ? rim : az < 2.3 ? rim - 0.77 * ((az - 1.5) / 0.8) ** 1.5 : -0.65 - (az - 2.3) * 1.2;
    if (ax > 2.2) y -= (ax - 2.2) * 0.8; return y; };
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = -w / 2 + w * i / nx, z = -h / 2 + h * j / nz; pos.push(x, prof(z, x), z); }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const cx = -w / 2 + w * (i + 0.5) / nx, cz = -h / 2 + h * (j + 0.5) / nz;
    if (Math.abs(cx) < winW / 2 && Math.abs(cz) < winH / 2) continue; // window
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2f8f74, flatShading: true, roughness: 0.9, side: THREE.DoubleSide }));
  mesh.receiveShadow = true; mesh.castShadow = true; mesh.name = 'DrapeWindow';
  // cavity: dark-rimmed shallow recess
  const cavityY = -0.06, cavity = new THREE.Group(); cavity.name = 'cavity';
  const tex = canvasTex(256, 256, (c, W, H) => { const gr = c.createRadialGradient(W / 2, H / 2, W * 0.15, W / 2, H / 2, W * 0.75); gr.addColorStop(0, '#d79a8a'); gr.addColorStop(0.7, '#a86a62'); gr.addColorStop(1, '#4a2a2c'); c.fillStyle = gr; c.fillRect(0, 0, W, H); });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.position.y = cavityY; floor.receiveShadow = true; cavity.add(floor);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a3335, flatShading: true, roughness: 1 }), wh = rim - cavityY;
  for (const [sx, sz, len, ry] of [[0, -1, winW, 0], [0, 1, winW, 0], [-1, 0, winH, Math.PI / 2], [1, 0, winH, Math.PI / 2]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, wh, 0.05), wallMat); wall.rotation.y = ry;
    wall.position.set(sx * winW / 2, cavityY + wh / 2, sz * winH / 2); cavity.add(wall); }
  mesh.add(cavity);
  const prep = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), new THREE.MeshStandardMaterial({ color: 0xd9b88a, flatShading: true, roughness: 0.8 }));
  prep.rotation.x = -Math.PI / 2; prep.position.y = rim - 0.01; mesh.add(prep); mesh.userData.prep = prep;
  return { mesh, prep, cavity, cavityY, windowCenter: new THREE.Vector3(0, 0, 0), windowSize: { w: winW, h: winH } };
}

function tubeAlong(pts, r, mat, seg = 6) { return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(V3)), pts.length * 6, r, seg), mat); }
const smooth = (color, extra = {}) => flat(color, { flatShading: false, roughness: 0.6, ...extra });
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Haustrated colon segment along Z (z from z0 to z1) at axis height y, gentle lateral bend; with 3 taeniae coli and small epiploic fat appendages. */
function colonSegment(z0, z1, y, x0 = 0, bendAmp = 0.08) {
  const g = new THREE.Group(), len = z1 - z0, mat = smooth(0xdcb18f, { roughness: 0.55 });
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
  const fat = smooth(0xf2d27c);
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
    const cec = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 18), smooth(0xdcb18f, { roughness: 0.55 })); cec.position.set(-0.95, 0.25, 0.4); cec.scale.set(1, 0.8, 1.05); g.add(cec);
    g.add(colonSegment(-1.2, 0.35, 0.25, -0.95, 0.04));
    const il = tubeAlong([{ x: -2.1, y: 0.18, z: 1.1 }, { x: -1.75, y: 0.2, z: 0.8 }, { x: -1.4, y: 0.24, z: 0.42 }], 0.1, smooth(0xe9a698), 12); g.add(il);
    const jn = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.03, 8, 16), smooth(0xcf8f82)); jn.position.set(-1.43, 0.24, 0.42); jn.lookAt(-1.43 + 1, 0.24 - 0.12, 0.42 - 0.35); g.add(jn);
    const pts = [{ x: -0.55, y: 0.14, z: 0.3 }, { x: -0.2, y: 0.17, z: 0.05 }, { x: 0.25, y: 0.17, z: 0.18 }, { x: 0.65, y: 0.15, z: -0.05 }];
    const curve = new THREE.CatmullRomCurve3(pts.map(V3)), pm = smooth(0xee9a90, { roughness: 0.5 });
    const ap = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.09, 12), pm); g.add(ap);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), pm); tip.position.copy(curve.getPoint(1)); g.add(tip);
    // mesoappendix fan + appendicular artery on its free edge
    const N = 24, fv = [], fi = [], edge = [];
    for (let i = 0; i <= N; i++) { const t = i / N, c = curve.getPoint(t), w = 0.38 * (1 - 0.75 * t); fv.push(c.x, c.y - 0.05, c.z, c.x + 0.04 * t, 0.03, c.z + w); edge.push(new THREE.Vector3(c.x + 0.04 * t, 0.035, c.z + w * 0.97));
      if (i < N) { const k = i * 2; fi.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fv, 3)); fg.setIndex(fi); fg.computeVertexNormals();
    g.add(new THREE.Mesh(fg, smooth(0xf4dcae, { side: THREE.DoubleSide, roughness: 0.7 })));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 40, 0.014, 6), smooth(0xb02e32, { roughness: 0.4 })));
    anchor.set(0.2, 0.17, 0.15); radius = 0.15; extra.base = new THREE.Vector3(-0.55, 0.14, 0.3); extra.curve = curve; g.scale.setScalar(0.75);
  } else if (kind === 'colon') {
    g.add(colonSegment(-1.2, 1.2, 0.25, 0, 0.12));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), smooth(0xdcb18f)); cap.position.set(0, 0.25, 1.28); cap.scale.set(1, 0.9, 0.9); g.add(cap);
    anchor.set(0, 0.25, -0.95); radius = 0.27; g.scale.setScalar(0.55);
  } else if (kind === 'gallbladder') {
    const m = smooth(0x6f9d4a, { roughness: 0.35, clearcoat: 0.5 });
    // pear-shaped sac along X: fundus (x<0) -> body -> neck (x>0)
    const prof = []; for (let i = 0; i <= 40; i++) { const t = i / 40, x = -0.5 + 1.05 * t; const r = 0.33 * Math.sin(Math.PI * Math.pow(t, 0.8)) ** 0.7 * (1 - 0.65 * ss(0.5, 1, t)) + 0.045 * ss(0.8, 1, t); prof.push([x, Math.max(r, 0.001)]); }
    const sac = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([x, r]) => new THREE.Vector2(r, x)), 28), m); sac.geometry.rotateZ(-Math.PI / 2); sac.scale.set(1, 0.8, 0.85); g.add(sac);
    const dm = smooth(0xc3b85c, { roughness: 0.45 });
    g.add(tubeAlong([{ x: 0.55, y: 0, z: 0 }, { x: 0.72, y: 0.03, z: 0.06 }, { x: 0.95, y: 0.06, z: 0.1 }], 0.035, dm, 10));            // cystic duct
    g.add(tubeAlong([{ x: 1.25, y: 0.07, z: -0.6 }, { x: 1.05, y: 0.065, z: -0.2 }, { x: 0.95, y: 0.06, z: 0.1 }], 0.045, dm, 10));        // common hepatic duct
    g.add(tubeAlong([{ x: 0.95, y: 0.06, z: 0.1 }, { x: 0.9, y: 0.05, z: 0.45 }, { x: 0.85, y: 0.04, z: 0.85 }], 0.05, dm, 10));          // common bile duct
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), smooth(0x7d2f2b, { roughness: 0.3, clearcoat: 0.6 })); lobe.scale.set(1.0, 0.2, 0.55); lobe.position.set(-0.15, 0.3, -0.5); g.add(lobe); // underside of right liver lobe
    anchor.set(0.9, 0.05, 0.1); radius = 0.38;
  } else if (kind === 'liver') {
    const geo = new THREE.SphereGeometry(1, 48, 28), pa = geo.attributes.position;
    const sy = (x) => 1 - 0.5 * ss(-0.2, -1, x), sz = (x) => 1 - 0.55 * ss(-0.2, -1, x);
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      pa.setXYZ(i, x * 1.9 + 0.15, y > 0 ? y * 0.5 * sy(x) : y * 0.12 * sy(x), z * 0.95 * sz(x) - (y < 0 ? 0 : 0)); }
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, smooth(0x7a2b27, { roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.25 })));
    const fx = -0.2 * 1.9 + 0.15, fp = []; for (let i = 0; i <= 20; i++) { const z = -0.55 + 1.1 * i / 20, xs = (fx - 0.15) / 1.9; const zz = z / (0.95 * sz(xs)); fp.push(new THREE.Vector3(fx, 0.5 * sy(xs) * Math.sqrt(Math.max(0, 1 - xs * xs - zz * zz)) + 0.006, z)); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fp), 30, 0.025, 6), smooth(0xd7b69a)));
    anchor.set(0, 0.4, 0); radius = 1;
  } else if (kind === 'artery') {
    const pts = [{ x: -1.6, y: 0.1, z: 0.12 }, { x: -0.8, y: 0.12, z: -0.08 }, { x: 0.3, y: 0.1, z: 0.1 }, { x: 1.2, y: 0.12, z: -0.05 }, { x: 1.7, y: 0.1, z: 0.1 }];
    g.add(tubeAlong(pts, 0.1, smooth(0xa52a30, { roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, sheen: 0.4 }), 20));
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
  const arm = new THREE.CylinderGeometry(0.7, 0.95, 5, 8); arm.rotateZ(Math.PI / 2); // wrist at -? thin end at +X (hand)
  const m1 = new THREE.Mesh(arm, skin()); m1.position.set(0, R * 0.9, 0); m1.scale.set(1, 0.9, 1); g.add(m1);
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
