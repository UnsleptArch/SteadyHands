// SURGERY — Chest tube insertion (tube thoracostomy), "The Safe Triangle". Draped lateral chest wall, arm raised. No gore.
// Steps: palpate ribs + muscle edges and mark the site in the safe triangle -> local anaesthetic -> incise over the rib below
//        -> blunt dissection OVER THE TOP of the rib (scroll = depth, stiff notches, firm click = pleural pop, spread)
//        -> finger sweep -> tube aimed posterior-superior (apex) -> connect to underwater seal, secure, watch it swing.
// Side insets (DOM canvases): a sagittal cross-section of the intercostal space and a chest X-ray whose lung re-expands.
import * as THREE from 'three';
import { createSurgery, holdTargets, dragDrop, clickTargets, MM, botClick } from './steps.js';
import { makeRing, makeDot, Ribbon } from '../levels/_common.js';

const ID = 'chest_tube';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- chest-wall anatomy (1 unit = 10 cm)
// Screen up (-z) = toward the axilla, screen right (+x) = posterior (latissimus), left (-x) = anterior (pectoralis).
const Y0 = 0.8;            // skin surface height
const P = 0.27;            // rib pitch (2.7 cm)
const RW = 0.062;          // rib half-width
const Z5 = -0.05;          // rib 5 centre at x = 0
const SLOPE = -0.1;        // ribs descend anteriorly
const ribZ = (k, x) => Z5 + (k - 5) * P + SLOPE * x;
const icsZ = (k, x) => ribZ(k, x) + P / 2;          // centre of intercostal space k (between rib k and k+1)
const APEX = { x: 0.1, z: -0.95 }, PEC = { x: -0.8, z: 0.6 }, LAT = { x: 0.95, z: 0.6 };
const SITE_X = 0.1;        // mid-axillary line
const baseZ = (x) => ribZ(6, x) - RW;               // triangle base: top edge of rib 6 (5th space / nipple level)
const side = (a, b, x, z, sgn) => sgn * ((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x));
const pecIn = (x, z) => side(APEX, PEC, x, z, -1) / Math.hypot(PEC.x - APEX.x, PEC.z - APEX.z);   // >0 behind the pec edge
const latIn = (x, z) => side(APEX, LAT, x, z, 1) / Math.hypot(LAT.x - APEX.x, LAT.z - APEX.z);  // >0 in front of the lat edge
const segDist = (a, b, x, z) => {
  const abx = b.x - a.x, abz = b.z - a.z, t = clamp(((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz), 0, 1);
  return Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
};
const NIP = { x: -1.05, z: icsZ(5, -1.05) };

function skinHeight(x, z) {
  const pec = sstep(-0.06, 0.16, -pecIn(x, z)), lat = sstep(-0.06, 0.18, -latIn(x, z));
  const muscle = Math.max(pec, lat);
  let h = 0.03 * pec + 0.036 * lat;
  let rib = 0;
  for (let k = 2; k <= 9; k++) { const d = (z - ribZ(k, x)) / 0.06; rib += Math.exp(-d * d); }
  h += rib * 0.02 * (1 - 0.6 * muscle);               // ribs palpable, muffled under the muscle bellies
  const nd = Math.hypot(x - NIP.x, z - NIP.z);
  h += 0.008 * Math.exp(-((nd / 0.05) ** 2));
  // blend to flat at the drape window so the hem stays on top
  const edge = sstep(0, 0.14, 1.3 - Math.abs(x)) * sstep(0, 0.14, 1.0 - Math.abs(z));
  return h * edge - 0.012 * (1 - edge);
}

// ---------------------------------------------------------------- audio: pleural pop + rush of air
let actx = null;
function playPop() {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime, sr = actx.sampleRate;
    const buf = actx.createBuffer(1, Math.floor(sr * 1.1), sr), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = actx.createBufferSource(); src.buffer = buf;
    const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(2400, t); bp.frequency.exponentialRampToValueAtTime(700, t + 1.0);
    const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
    src.connect(bp).connect(g).connect(actx.destination); src.start(t);
    const o = actx.createOscillator(); o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    const og = actx.createGain(); og.gain.setValueAtTime(0.35, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(og).connect(actx.destination); o.start(t); o.stop(t + 0.16);
  } catch { /* audio is optional */ }
}

// ---------------------------------------------------------------- side panel: cross-section + chest X-ray
const PANEL_CSS = `
.ctp{position:fixed;right:18px;top:50%;transform:translateY(-42%);z-index:35;pointer-events:none;display:flex;flex-direction:column;gap:10px;
  font-family:Inter,system-ui,sans-serif;color:#e8edf2}
.ctp-card{background:rgba(11,15,19,.88);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px 10px 10px;box-shadow:0 8px 24px rgba(0,0,0,.35)}
.ctp-card h4{margin:0 0 6px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8b98a5;font-weight:600;display:flex;justify-content:space-between;gap:8px}
.ctp-card h4 b{color:#3EC5B5;font-weight:700;letter-spacing:.04em}
.ctp canvas{display:block;border-radius:6px}
`;

function createPanel(parent, st) {
  if (!document.getElementById('ctp-style')) { const s = document.createElement('style'); s.id = 'ctp-style'; s.textContent = PANEL_CSS; document.head.appendChild(s); }
  const root = document.createElement('div'); root.className = 'ctp';
  root.innerHTML = `<div class="ctp-card" data-k="xsec" style="display:none"><h4>Cross-section · intercostal space <b data-k="depth">skin</b></h4><canvas width="250" height="180"></canvas></div>
    <div class="ctp-card"><h4>Chest X-ray · R pneumothorax <b data-k="lung">35%</b></h4><canvas width="250" height="230"></canvas></div>`;
  parent.appendChild(root);
  const [xc, cc] = root.querySelectorAll('canvas');
  const xs = xc.getContext('2d'), cx = cc.getContext('2d');
  const $ = (k) => root.querySelector(`[data-k="${k}"]`);
  let lastLung = '', lastDepth = '';

  function drawCXR() {
    const W = 250, H = 230, e = st.lung;
    cx.fillStyle = '#050607'; cx.fillRect(0, 0, W, H);
    const g = cx.createRadialGradient(W / 2, H * 0.55, 30, W / 2, H * 0.55, 150); g.addColorStop(0, '#3a3d40'); g.addColorStop(1, '#141618');
    cx.fillStyle = g; cx.beginPath(); cx.ellipse(W / 2, H * 0.58, 112, 108, 0, 0, Math.PI * 2); cx.fill();
    const shift = (1 - e) * 12; // tension: mediastinum pushed away from the collapsed side (patient right = viewer left)
    const hemi = (sx) => { cx.beginPath(); cx.moveTo(W / 2 + sx * 14, 40); cx.bezierCurveTo(W / 2 + sx * 70, 30, W / 2 + sx * 104, 90, W / 2 + sx * 100, 196); cx.quadraticCurveTo(W / 2 + sx * 60, 176, W / 2 + sx * 18, 192); cx.closePath(); };
    cx.fillStyle = '#0b0c0d'; hemi(-1); cx.fill(); hemi(1); cx.fill();
    // left lung (viewer right): normal markings
    cx.save(); hemi(1); cx.clip(); cx.fillStyle = '#1b1f22'; cx.fill(); cx.strokeStyle = 'rgba(160,170,178,.2)'; cx.lineWidth = 1;
    for (let i = 0; i < 14; i++) { cx.beginPath(); cx.moveTo(W / 2 + 22, 110); cx.lineTo(W / 2 + 30 + i * 5, 40 + i * 11); cx.stroke(); }
    cx.restore();
    // right lung (viewer left): collapsed toward the hilum, scaled by e
    const hx = W / 2 - 24 - shift * 0.4, hy = 112;
    cx.save(); hemi(-1); cx.clip();
    cx.translate(hx, hy); cx.scale(0.32 + 0.68 * e, 0.4 + 0.6 * e); cx.translate(-hx, -hy);
    hemi(-1); cx.fillStyle = '#1b1f22'; cx.fill();
    cx.strokeStyle = 'rgba(160,170,178,.2)'; for (let i = 0; i < 14; i++) { cx.beginPath(); cx.moveTo(W / 2 - 22, 110); cx.lineTo(W / 2 - 30 - i * 5, 40 + i * 11); cx.stroke(); }
    if (e < 0.97) { hemi(-1); cx.strokeStyle = 'rgba(230,236,240,.8)'; cx.lineWidth = 1.6; cx.stroke(); } // visceral pleural line
    cx.restore();
    cx.fillStyle = '#8e9398'; cx.fillRect(W / 2 - 7 + shift, 22, 14, 190);
    cx.fillStyle = '#b9bdc1'; cx.beginPath(); cx.ellipse(W / 2 + 22 + shift, 150, 40, 38, -0.3, 0, Math.PI * 2); cx.fill();
    cx.strokeStyle = '#2a2d30'; cx.lineWidth = 6; cx.beginPath(); cx.moveTo(W / 2, 10); cx.quadraticCurveTo(W / 2 + shift, 40, W / 2 + shift * 1.2, 82); cx.stroke();
    cx.strokeStyle = 'rgba(205,210,214,.5)'; cx.lineWidth = 2.2;
    for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) {
      const y = 48 + i * 17; cx.beginPath(); cx.moveTo(W / 2 + sx * 10, y - 6); cx.quadraticCurveTo(W / 2 + sx * 95, y - 12, W / 2 + sx * 104, y + 22); cx.stroke();
    }
    cx.lineWidth = 3.5; cx.strokeStyle = 'rgba(220,224,228,.7)';
    for (const sx of [-1, 1]) { cx.beginPath(); cx.moveTo(W / 2 + sx * 10, 40); cx.quadraticCurveTo(W / 2 + sx * 50, 26, W / 2 + sx * 92, 32); cx.stroke(); }
    if (st.tube) {
      const ex = W / 2 - 101, ey = 128, ang = st.tube.ang, L = st.tube.depth * 4.2;
      const dx = Math.cos(ang), dy = -Math.sin(ang);
      cx.strokeStyle = '#f2f4f6'; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(ex - 14, ey + 10); cx.lineTo(ex, ey);
      cx.lineTo(ex + dx * L, ey + dy * L); cx.stroke();
      cx.fillStyle = '#050607'; for (let k = 1; k <= 3; k++) { const u = (L - k * 7) / L; if (u > 0) { cx.beginPath(); cx.arc(ex + dx * L * u, ey + dy * L * u, 1.3, 0, 7); cx.fill(); } }
    }
    cx.fillStyle = '#7d8a94'; cx.font = '600 10px Inter, Arial'; cx.fillText('R', 10, 16); cx.fillText('L', W - 16, 16);
    if (e < 0.6) { cx.fillStyle = '#ff9b9e'; cx.fillText('TENSION · trachea shifted', 10, H - 8); }
    else if (e > 0.97) { cx.fillStyle = '#3EC5B5'; cx.fillText('LUNG FULLY RE-EXPANDED', 10, H - 8); }
    else { cx.fillStyle = '#c9d3da'; cx.fillText('Lung re-expanding…', 10, H - 8); }
    const t = Math.round(e * 100) + '%'; if (t !== lastLung) { lastLung = t; $('lung').textContent = t; }
  }

  function drawXsec() {
    const W = 250, H = 180, d = st.dis;
    xs.fillStyle = '#0f1316'; xs.fillRect(0, 0, W, H);
    const k = 300, Y = (z) => H / 2 + (z - d.zc) * k;
    const L = { skin: 16, mus: 84, rib0: 96, rib1: 150, pl: 182 };
    xs.fillStyle = '#d6a98e'; xs.fillRect(L.skin, 0, 8, H);
    xs.fillStyle = '#e2c27a'; xs.fillRect(L.skin + 8, 0, L.mus - L.skin - 8, H);
    xs.fillStyle = '#9c4e4a'; xs.fillRect(L.mus, 0, L.pl - L.mus, H);
    xs.fillStyle = '#cfd8df'; xs.fillRect(L.pl, 0, 3, H);
    const lungX = L.pl + 3 + (1 - st.lung) * 40;
    xs.fillStyle = '#1a1f23'; xs.fillRect(L.pl + 3, 0, W, H);
    xs.fillStyle = '#c98f94'; xs.fillRect(lungX, 0, W, H);
    xs.fillStyle = 'rgba(255,255,255,.6)'; xs.font = '600 9px Inter, Arial';
    xs.fillText('SKIN', 1, 10); xs.fillText('FAT', L.skin + 14, 10); xs.fillText('MUSCLE', L.mus + 4, 10); xs.fillText('PLEURA', L.pl - 16, H - 4);
    if (lungX < W - 30) xs.fillText('LUNG', lungX + 4, 22);
    xs.fillStyle = 'rgba(62,197,181,.25)'; xs.fillRect(L.skin + 8, Y(d.green[0]), L.pl - L.skin - 5, Y(d.green[1]) - Y(d.green[0]));
    if (d.showRed) { xs.fillStyle = 'rgba(229,72,77,.35)'; xs.fillRect(L.skin + 8, Y(d.red[0]), L.pl - L.skin - 5, Y(d.red[1]) - Y(d.red[0])); }
    for (let r = d.k - 1; r <= d.k + 2; r++) {
      const y = Y(ribZ(r, d.x));
      if (y < -30 || y > H + 30) continue;
      xs.fillStyle = '#eef0ea'; xs.beginPath(); xs.ellipse((L.rib0 + L.rib1) / 2, y, (L.rib1 - L.rib0) / 2, RW * k, 0, 0, Math.PI * 2); xs.fill();
      xs.fillStyle = '#7f868a'; xs.font = '600 9px Inter, Arial'; xs.fillText('rib ' + r, L.rib0 + 14, y + 3);
      const by = y + RW * k - 2, bx = L.rib1 - 22;
      [['#4a74d8', 0], ['#e5484d', 7], ['#f2d04a', 14]].forEach(([c, o]) => { xs.fillStyle = c; xs.beginPath(); xs.arc(bx + o, by, 3, 0, Math.PI * 2); xs.fill(); });
    }
    xs.fillStyle = 'rgba(255,255,255,.55)'; xs.fillText('V A N', L.rib1 - 26, Y(ribZ(d.k, d.x)) + RW * k + 12);
    const tipX = [L.skin + 4, L.skin + 44, L.mus + 30, L.pl - 4, L.pl + 14][d.stage] ?? L.skin;
    const tipY = Y(d.tipZ), sy = Y(d.skinZ);
    xs.strokeStyle = d.bad ? '#ff6b6f' : '#f4f7f9'; xs.lineWidth = 3; xs.lineCap = 'round';
    xs.beginPath(); xs.moveTo(0, sy); xs.lineTo(L.skin + 4, sy);
    if (d.stage > 0) xs.quadraticCurveTo(L.skin + 30, sy, Math.min(tipX, L.mus - 6), tipY);
    xs.lineTo(tipX, tipY); xs.stroke();
    xs.fillStyle = d.bad ? '#ff6b6f' : '#3EC5B5'; xs.beginPath(); xs.arc(tipX, tipY, 4, 0, Math.PI * 2); xs.fill();
    xs.fillStyle = 'rgba(255,255,255,.12)'; xs.fillRect(W - 10, 20, 5, H - 40);
    const r = clamp(d.resist, 0, 1); xs.fillStyle = '#3EC5B5'; xs.fillRect(W - 10, 20 + (H - 40) * (1 - r), 5, (H - 40) * r);
    const dl = ['skin', 'fat', 'intercostals', 'pleura: click', 'pleural space'][d.stage] || '';
    if (dl !== lastDepth) { lastDepth = dl; $('depth').textContent = dl; }
  }

  return {
    showXsec(b) { $('xsec').style.display = b ? 'block' : 'none'; },
    draw() { drawCXR(); if (st.dis && $('xsec').style.display !== 'none') drawXsec(); },
    dispose() { root.remove(); },
  };
}

function labelSprite(text, color = '#3EC5B5') {
  const c = document.createElement('canvas'); c.width = 128; c.height = 48;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(11,15,19,.78)'; x.beginPath(); x.roundRect(4, 6, 120, 36, 10); x.fill();
  x.fillStyle = color; x.font = '700 24px Inter, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 64, 25);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(0.14, 0.0525, 1); s.renderOrder = 12;
  return s;
}

export default {
  id: ID,
  title: 'Chest Tube Insertion',
  MM,
  brief: 'Tension pneumothorax: decompress the chest through the safe triangle. Palpate the ribs and muscle edges, mark the 5th ' +
    'intercostal space, numb, incise over the rib below, then dissect bluntly OVER THE TOP of the rib (the nerve and vessels run ' +
    'under each rib), pop the pleura, sweep, place the tube toward the apex and connect it to an underwater seal. Hold SHIFT to steady.',

  setup(engine, art) {
    const { scene } = engine;
    const group = new THREE.Group(); group.name = 'surgery-chest-tube'; scene.add(group);
    const timers = [];
    let disposedFlag = false, wheelOff = null, Sref = null;
    const later = (fn, ms) => timers.push(setTimeout(() => { if (!disposedFlag) fn(); }, ms));

    // ---------------- field: prepped lateral chest wall in blue drapes
    const WIN_W = 2.6, WIN_H = 2.0;
    let field = null;
    try { if (typeof art.makeSurgicalField === 'function') field = art.makeSurgicalField({ w: WIN_W, h: WIN_H, surfaceY: Y0 }); } catch (e) { console.warn('[chest_tube] field', e); }
    let skin = null, drapeMat = null;
    if (field && field.mesh) {
      group.add(field.mesh);
      skin = field.mesh.userData.top || null;
      let best = 0;
      field.mesh.traverse((o) => {
        if (!o.isMesh || o === skin || !o.geometry.attributes.position) return;
        const n = o.geometry.attributes.position.count;
        if (n > best && o.geometry.type !== 'BoxGeometry') { best = n; drapeMat = o.material; }
      });
    }
    if (!skin) {
      const body = new THREE.Mesh(new THREE.BoxGeometry(WIN_W + 0.3, Y0, WIN_H + 0.3), new THREE.MeshStandardMaterial({ color: 0xc99a7c }));
      body.position.y = Y0 / 2 - 0.01; group.add(body);
      skin = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xc99a7c, roughness: 0.6 })); group.add(skin);
      const dm = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), new THREE.MeshStandardMaterial({ color: 0x3d6f9c, roughness: 0.9 }));
      dm.rotation.x = -Math.PI / 2; dm.position.y = Y0 - 0.002; group.add(dm);
    }
    drapeMat ||= new THREE.MeshStandardMaterial({ color: 0x3d6f9c, roughness: 0.9 });
    {
      const geo = new THREE.PlaneGeometry(WIN_W + 0.3, WIN_H + 0.3, 200, 160);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, Y0 + 0.0005 + skinHeight(pos.getX(i), pos.getZ(i)));
      geo.computeVertexNormals();
      if (skin.geometry) skin.geometry.dispose();
      skin.geometry = geo; skin.rotation.set(0, 0, 0); skin.position.set(0, 0, 0); skin.receiveShadow = true;
    }
    const surf = (x, z) => Y0 + 0.0005 + skinHeight(x, z);
    const areola = new THREE.Mesh(new THREE.CircleGeometry(0.07, 32), new THREE.MeshStandardMaterial({ color: 0x9a6250, roughness: 0.7, transparent: true, opacity: 0.8, depthWrite: false }));
    areola.rotation.x = -Math.PI / 2; areola.position.set(NIP.x, surf(NIP.x, NIP.z) + 0.003, NIP.z); group.add(areola);
    // draped arm abducted above the head (top-right)
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 3.0, 8, 24), drapeMat);
    arm.rotation.set(Math.PI / 2, 0, 0); arm.rotation.z = 0; arm.position.set(0.9, Y0 + 0.02, -2.95);
    const armPivot = new THREE.Group(); armPivot.add(arm); armPivot.rotation.y = -0.35; group.add(armPivot);

    // ---------------- vitals: pneumothorax physiology overrides HR / BP / SpO2 shown on the banner + monitor
    const phys = { lung: 0.35, lungTarget: 0.35, spo2: 91, popped: false, t: 0, bleed: 0, lac: 0, hrX: 26, sysX: -18 };
    const adjust = (v) => ({ ...v, hr: v.hr + phys.hrX + phys.bleed * 25, sys: (v.sys ?? 118) + phys.sysX - phys.bleed * 20, dia: (v.dia ?? 76) + phys.sysX * 0.5 - phys.bleed * 10, spo2: phys.spo2 });
    let monitorReal = null;
    try { monitorReal = typeof art.makeVitalsMonitor === 'function' ? art.makeVitalsMonitor() : null; } catch { monitorReal = null; }
    let monitor = null;
    if (monitorReal && monitorReal.mesh) {
      monitorReal.mesh.position.set(-3.6, Y0 - 2.3, -3.6); monitorReal.mesh.rotation.y = 0.6; group.add(monitorReal.mesh);
      monitor = {
        mesh: monitorReal.mesh,
        setVitals(o) {
          const [s, d] = String(o.bp || '118/76').split('/').map(Number);
          monitorReal.setVitals({ hr: o.hr + phys.hrX + phys.bleed * 25, spo2: phys.spo2, bp: `${Math.round(s + phys.sysX - phys.bleed * 20)}/${Math.round(d + phys.sysX * 0.5 - phys.bleed * 10)}` });
        },
        setAlarm(b) { if (monitorReal.setAlarm) monitorReal.setAlarm(b || phys.spo2 < 90); },
      };
    }
    function tickPhys(dt) {
      phys.t += dt;
      phys.lung += (phys.lungTarget - phys.lung) * Math.min(1, dt * 0.55);
      let target = !phys.popped ? Math.max(84, 91 - phys.t / 15) : 87 + 12 * sstep(0.35, 0.98, phys.lung);
      target -= phys.lac * 5;
      phys.spo2 += (target - phys.spo2) * Math.min(1, dt * 0.8);
      const sick = clamp((1 - phys.lung) / 0.65, 0, 1);
      phys.hrX = 26 * sick; phys.sysX = -18 * sick;
      phys.bleed = Math.max(0, phys.bleed - dt / 25);
      pst.lung = phys.lung;
    }

    const pst = { lung: phys.lung, tube: null, dis: null };
    const panel = createPanel(document.getElementById('ui') || document.body, pst);

    const site = { x: SITE_X, z: icsZ(5, SITE_X), k: 5 };
    const hole = V(SITE_X, Y0, ribZ(6, SITE_X));
    let siteMark = null;
    const incGroup = new THREE.Group(); group.add(incGroup);

    // ---------------- palpation highlights: rib + muscle-edge segments light up near the fingertips
    const palp = new THREE.Group(); group.add(palp);
    const ribSegs = [], edgeSegs = [];
    const felt = { ribs: new Set(), edges: new Set() };
    const segMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false });
    const ribGeo = new THREE.PlaneGeometry(0.095, 0.022), edgeGeo = new THREE.PlaneGeometry(0.045, 0.014);
    for (let k = 2; k <= 9; k++) {
      for (let x = -WIN_W / 2 + 0.05; x < WIN_W / 2; x += 0.1) {
        const z = ribZ(k, x);
        if (Math.abs(z) > WIN_H / 2 - 0.02) continue;
        const m = new THREE.Mesh(ribGeo, segMat(0xbff3ea));
        m.rotation.set(-Math.PI / 2, 0, -Math.atan(SLOPE));
        m.position.set(x, surf(x, z) + 0.004, z); m.renderOrder = 4; palp.add(m);
        ribSegs.push({ m, k, x, z, felt: 0 });
      }
    }
    const edges = [
      { id: 'pec', a: APEX, b: PEC, name: 'Pectoralis major edge' },
      { id: 'lat', a: APEX, b: LAT, name: 'Latissimus dorsi edge' },
      { id: 'base', a: { x: PEC.x - 0.25, z: baseZ(PEC.x - 0.25) }, b: { x: LAT.x + 0.2, z: baseZ(LAT.x + 0.2) }, name: 'Nipple line (5th space)' },
    ];
    for (const e of edges) {
      const L = Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z), n = Math.ceil(L / 0.07), ang = Math.atan2(e.b.z - e.a.z, e.b.x - e.a.x);
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n, x = e.a.x + (e.b.x - e.a.x) * u, z = e.a.z + (e.b.z - e.a.z) * u;
        if (Math.abs(x) > WIN_W / 2 - 0.02 || Math.abs(z) > WIN_H / 2 - 0.02) continue;
        const m = new THREE.Mesh(edgeGeo, segMat(0xffc27a));
        m.rotation.set(-Math.PI / 2, 0, -ang); m.position.set(x, surf(x, z) + 0.005, z); m.renderOrder = 4; palp.add(m);
        edgeSegs.push({ m, e, x, z, felt: 0 });
      }
    }
    const fingertips = makeRing(0.11, 0.122, 0xffffff, Y0 + 0.03, 0); fingertips.material.depthTest = false; fingertips.renderOrder = 11; group.add(fingertips);
    function palpate(p) {
      fingertips.position.set(p.x, surf(p.x, p.z) + 0.02, p.z);
      fingertips.material.opacity = 0.4;
      for (const s of ribSegs) {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        const live = Math.max(0, 1 - d / 0.26) ** 1.5;
        const muffled = 1 - 0.45 * Math.max(sstep(-0.02, 0.09, -pecIn(s.x, s.z)), sstep(-0.02, 0.1, -latIn(s.x, s.z)));
        if (live * muffled > 0.4 && Math.abs(p.z - s.z) < 0.07) {
          s.felt = 1;
          if (!felt.ribs.has(s.k)) {
            felt.ribs.add(s.k);
            const lab = labelSprite(`rib ${s.k}`); lab.position.set(p.x + 0.16, surf(p.x, s.z) + 0.05, s.z); group.add(lab);
          }
        }
        s.m.material.opacity = Math.max(live * muffled * 0.75, s.felt * 0.16);
      }
      for (const s of edgeSegs) {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        const live = Math.max(0, 1 - d / 0.24) ** 1.5;
        if (live > 0.4 && segDist(s.e.a, s.e.b, p.x, p.z) < 0.06 && !felt.edges.has(s.e.id)) {
          felt.edges.add(s.e.id); if (Sref) Sref.info(`Felt: ${s.e.name}`);
          for (const t of edgeSegs) if (t.e === s.e) t.felt = 1;
        }
        s.m.material.opacity = Math.max(live * 0.8, s.felt * 0.34);
      }
    }

    // ---------------- effects
    const camAt = (x, z, h, back, dx = 0) => ({ pos: [x + dx, Y0 + h, z + back], target: [x, Y0, z] });
    const puffs = [];
    function airRush() {
      for (let i = 0; i < 16; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.018 + Math.random() * 0.018, 10, 8), new THREE.MeshBasicMaterial({ color: 0xf4f8fb, transparent: true, opacity: 0.5, depthWrite: false }));
        m.position.copy(hole).add(V(0, 0.02, -0.03)); group.add(m);
        const a = Math.random() * Math.PI * 2;
        puffs.push({ m, v: V(Math.cos(a) * 0.14, 0.3 + Math.random() * 0.3, Math.sin(a) * 0.14), t: 0, life: 0.9 + Math.random() * 0.7 });
      }
      const ring = makeRing(0.02, 0.032, 0xffffff, hole.y + 0.01, 0.8); ring.position.set(hole.x, hole.y + 0.01, hole.z - 0.03); group.add(ring);
      puffs.push({ m: ring, ring: true, t: 0, life: 0.8 });
    }
    function tickPuffs(dt) {
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i]; p.t += dt; const u = p.t / p.life;
        if (u >= 1) { group.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); puffs.splice(i, 1); continue; }
        if (p.ring) { p.m.scale.setScalar(1 + u * 6); p.m.material.opacity = 0.8 * (1 - u); }
        else { p.m.position.addScaledVector(p.v, dt); p.m.scale.setScalar(1 + u * 2.5); p.m.material.opacity = 0.5 * (1 - u); }
      }
    }
    let seep = null;
    function bleedSeep() {
      if (!seep) {
        seep = new THREE.Mesh(new THREE.CircleGeometry(0.03, 24), new THREE.MeshBasicMaterial({ color: 0x6e2a22, transparent: true, opacity: 0.55, depthWrite: false }));
        seep.rotation.x = -Math.PI / 2; seep.position.set(hole.x, hole.y + 0.006, hole.z); seep.renderOrder = 5; group.add(seep);
      }
      seep.userData.t = 0;
    }

    // ---------------- tube (external part) + underwater-seal drain
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0xeef4f6, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.85 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x3a6fd0, roughness: 0.4 });
    let tubeMesh = null, tubeStripe = null;
    const connector = new THREE.Group();
    { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.1, 16), new THREE.MeshStandardMaterial({ color: 0x3ec5b5, roughness: 0.4 })); c.rotation.x = Math.PI / 2; connector.add(c); }
    connector.visible = false; group.add(connector);
    let tubeDir = new THREE.Vector2(0.7, -0.7).normalize();
    function rebuildTube() {
      if (tubeMesh) { group.remove(tubeMesh, tubeStripe); tubeMesh.geometry.dispose(); tubeStripe.geometry.dispose(); }
      const out = V(-tubeDir.x, 0, -tubeDir.y), e = connector.position;
      const a = hole.clone().add(V(0, 0.01, 0)), b = hole.clone().addScaledVector(out, 0.12).add(V(0, 0.06, 0));
      const c = b.clone().addScaledVector(out, 0.12).lerp(e, 0.3).setY(Math.max(e.y, Y0) + 0.05);
      const pts = [a, b, c, c.clone().lerp(e, 0.6).setY((c.y + e.y) / 2 + 0.03), e.clone()];
      const curve = new THREE.CatmullRomCurve3(pts);
      tubeMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.026, 12), tubeMat);
      const sp = curve.getPoints(48).map((p) => p.clone().add(V(0, 0.022, 0)));
      tubeStripe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp), 48, 0.006, 6), stripeMat);
      tubeMesh.castShadow = true; group.add(tubeMesh, tubeStripe);
    }
    const drain = new THREE.Group();
    const drainBase = V(0.95, 0.12, 2.0);
    {
      const shell = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.22), new THREE.MeshStandardMaterial({ color: 0xe9f1f5, roughness: 0.15, transparent: true, opacity: 0.55 }));
      shell.position.y = 0.25; drain.add(shell);
      const water = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.18), new THREE.MeshStandardMaterial({ color: 0x5aa8e6, roughness: 0.2, transparent: true, opacity: 0.85 }));
      water.position.set(-0.17, 0.09, 0); drain.add(water);
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.05), new THREE.MeshStandardMaterial({ color: 0x5aa8e6, roughness: 0.2 }));
      col.position.set(0.02, 0.2, 0.12); drain.add(col); drain.userData.col = col;
      const port = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 16), new THREE.MeshStandardMaterial({ color: 0x1d2127, roughness: 0.5 }));
      port.position.set(-0.17, 0.53, 0); drain.add(port);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.015, 8, 24, Math.PI), new THREE.MeshStandardMaterial({ color: 0x1d2127, roughness: 0.5 }));
      handle.position.set(0.1, 0.5, 0); drain.add(handle);
      drain.position.copy(drainBase); drain.visible = false; group.add(drain);
    }
    const drainPort = drainBase.clone().add(V(-0.17, 0.58, 0));
    let swing = 0;

    // ---------------- steps
    const steps = [
      {
        title: 'Palpate & mark the safe triangle', tool: null, plane: Y0 + 0.01,
        instr: 'Glide over the chest wall to palpate the ribs and the edges of pectoralis and latissimus, then click the 5th intercostal space inside the triangle.',
        cam: { pos: [0.05, Y0 + 2.3, 1.5], target: [0.0, Y0, 0.0] },
        start(S) {
          let done = false;
          return {
            hideMarker: true,
            frac: () => done ? 1 : Math.min(0.9, (felt.ribs.size / 3 + felt.edges.size / 3) * 0.45),
            update(ev) {
              if (done) return true;
              palpate(ev.p);
              const ready = felt.ribs.size >= 3 && felt.edges.size >= 2;
              S.setInstr(`Palpated ${felt.ribs.size} ribs · ${felt.edges.size}/3 landmarks. ` + (ready ? 'Click the 5th intercostal space inside the triangle.' : 'Keep feeling for the ribs and muscle edges.'));
              if (!ev.pressed) return false;
              if (!ready) { S.m.missedActions++; S.warn('Palpate first: count the ribs, find the muscle edges'); return false; }
              const x = ev.p.x;
              const k = clamp(Math.round((ev.p.z - Z5 - SLOPE * x - P / 2) / P) + 5, 2, 8);
              const z = icsZ(k, x);
              if (!siteMark) { siteMark = makeDot(0.02, 0x5a3aa0, 0); const r = makeRing(0.034, 0.044, 0x5a3aa0, 0, 0.95); r.rotation.x = 0; siteMark.add(r); group.add(siteMark); }
              siteMark.position.set(x, surf(x, z) + 0.006, z);
              const inside = pecIn(x, z) > 0 && latIn(x, z) > 0;
              if (k >= 6) { S.error(0.8, 'Too low. Diaphragm, liver and spleen live down there.'); return false; }
              if (!inside) { S.error(0.6, 'Outside the safe triangle.'); return false; }
              if (k <= 3) { S.error(0.5, 'Too high: axillary vessels. Aim for the 4th-5th space.'); return false; }
              const errMm = Math.hypot(x - SITE_X, z - icsZ(5, SITE_X)) / MM;
              S.precision(Math.min(8, errMm / 10));
              S.award(Math.round(200 * clamp(1 - errMm / 200, 0.5, 1)), k === 5 ? 'Safe triangle, 5th space' : 'Safe triangle, 4th space');
              site.x = x; site.z = z; site.k = k;
              hole.set(x, surf(x, ribZ(k + 1, x)), ribZ(k + 1, x));
              done = true; fingertips.visible = false;
              return true;
            },
            async bot(bot) {
              const y = Y0 + 0.01;
              await bot.moveTo(V(-0.35, y, -0.5), 0.9);
              await bot.path([V(0.1, y, -0.62), V(0.55, y, -0.4), V(0.5, y, ribZ(4, 0.5)), V(0.0, y, ribZ(5, 0)), V(-0.4, y, ribZ(6, -0.4)),
                V(-0.48, y, -0.05), V(-0.3, y, baseZ(-0.3)), V(0.3, y, baseZ(0.3)), V(0.62, y, 0.05), V(0.35, y, 0.0)], 0.9);
              await bot.wait(0.3);
              await botClick(bot, V(SITE_X, y, icsZ(5, SITE_X)), 0.5, 0.12);
            },
            dispose() {},
          };
        },
      },
      {
        title: 'Local anaesthetic', tool: 'syringe', plane: Y0 + 0.01,
        instr: 'Press and hold on the marked site for 2 s: infiltrate skin, rib periosteum and pleura.',
        cam: camAt(SITE_X, icsZ(5, SITE_X) + 0.05, 1.5, 0.95),
        start(S) {
          for (const s of ribSegs) s.m.material.opacity = s.k === site.k || s.k === site.k + 1 ? 0.24 : 0.08;
          for (const s of edgeSegs) s.m.material.opacity = 0.3;
          return holdTargets(S, { targets: [V(site.x, Y0, site.z)], y: surf(site.x, site.z), radius: 0.07, holdT: 2.0, label: 'Lidocaine in, site numb' });
        },
      },
      {
        title: 'Incise over the rib below', tool: 'scalpel', plane: Y0 + 0.01,
        instr: 'Drag a 2-3 cm cut ALONG the rib just below your mark. The track will climb over the top of that rib.',
        cam: camAt(SITE_X, icsZ(5, SITE_X) + 0.1, 1.2, 0.75),
        start(S) {
          palp.visible = false;
          const k6 = site.k + 1, cx = site.x;
          const gy = surf(cx, ribZ(k6, cx)) + 0.004;
          const guide = new Ribbon(40, gy, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
          const gc = new THREE.Color(0x5a3aa0);
          for (let i = 0; i < 12; i += 2) { const x0 = cx - 0.15 + i * 0.025, x1 = x0 + 0.025; guide.seg(V(x0, gy, ribZ(k6, x0)), V(x1, gy, ribZ(k6, x1)), 0.006, 0.006, gc); }
          incGroup.add(guide.mesh);
          const cut = new Ribbon(400, gy + 0.002, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
          incGroup.add(cut.mesh);
          const dark = new THREE.Color(0x3a1f26);
          let a = null, last = null, done = false;
          return {
            frac: () => done ? 1 : a ? 0.5 : 0,
            update(ev) {
              if (done) return true;
              if (ev.pressed && !a) {
                const dz = Math.abs(ev.p.z - ribZ(k6, ev.p.x));
                if (dz < 0.05 && Math.abs(ev.p.x - cx) < 0.2) { a = ev.p.clone(); last = V(a.x, gy + 0.002, a.z); S.setInstr('Draw along the rib, release at 2-3 cm'); }
                else { S.m.missedActions++; S.warn('Start the cut on the rib, just below the mark'); }
              }
              if (a && ev.down) {
                const p = V(ev.p.x, gy + 0.002, ev.p.z);
                if (p.distanceTo(last) > 0.006) { cut.seg(last, p, 0.006, 0.006, dark); last = p; }
                S.setInstr(`Incision ${(Math.hypot(p.x - a.x, p.z - a.z) * 10).toFixed(1)} cm (aim 2-3 cm along the rib)`);
              }
              if (a && ev.released) {
                const dx = ev.p.x - a.x, dz = ev.p.z - a.z, Lcm = Math.hypot(dx, dz) * 10;
                let ang = Math.abs(Math.atan2(dz, dx) - Math.atan(SLOPE)) % Math.PI;
                const angDeg = Math.min(ang, Math.PI - ang) * 180 / Math.PI;
                if (Lcm < 1.5 || angDeg > 25) {
                  S.m.retries++; S.warn(Lcm < 1.5 ? 'Too short: a finger must fit, make it 2-3 cm' : 'Cut along the rib, not across it');
                  a = null; cut.n = 0; cut.geo.setDrawRange(0, 0); S.setInstr('Try again: drag 2-3 cm along the rib');
                  return false;
                }
                const ideal = Lcm >= 2 && Lcm <= 3.2 && angDeg <= 10;
                if (Lcm > 4) S.error(0.3, 'Longer than needed: cosmetic penalty');
                S.precision(Math.min(8, Math.abs(Lcm - 2.5) * 4 + angDeg / 5));
                S.award(ideal ? 150 : 100, ideal ? 'Clean 2.5 cm incision' : 'Incision made');
                hole.x = (a.x + ev.p.x) / 2; hole.z = ribZ(k6, hole.x); hole.y = surf(hole.x, hole.z);
                guide.mesh.visible = false;
                const wound = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshStandardMaterial({ color: 0x5b2c2c, roughness: 0.5, transparent: true, opacity: 0.9, depthWrite: false }));
                wound.rotation.set(-Math.PI / 2, 0, -Math.atan(SLOPE)); wound.scale.set(Lcm * 0.05, 0.011, 1);
                wound.position.set(hole.x, hole.y + 0.006, hole.z); wound.renderOrder = 4; incGroup.add(wound);
                cut.mesh.visible = false;
                done = true;
                return true;
              }
              return false;
            },
            async bot(bot) {
              const y = Y0 + 0.01, x0 = cx - 0.125, x1 = cx + 0.125;
              await bot.moveTo(V(x0, y, ribZ(k6, x0)), 0.7); await bot.wait(0.15); bot.down(true); await bot.wait(0.1);
              await bot.path([V(x1, y, ribZ(k6, x1))], 0.22); await bot.wait(0.1); bot.down(false); await bot.wait(0.2);
            },
            dispose() {},
          };
        },
      },
      {
        title: 'Blunt dissection over the top of the rib', tool: 'driver', plane: Y0 + 0.01,
        instr: 'Keep the clamp in the teal band just ABOVE the rib (move up/down). Scroll down (or ↓ / S) to push through each layer; firm click at the pleura.',
        cam: camAt(SITE_X, icsZ(5, SITE_X) + 0.05, 0.95, 0.55),
        start(S) {
          const k5 = site.k, k6 = site.k + 1, x = hole.x;
          const zTop6 = ribZ(k6, x) - RW, zBot5 = ribZ(k5, x) + RW;
          const green = [zTop6 - 0.05, zTop6 + 0.012], red = [zBot5 - 0.02, zBot5 + 0.04];
          const d = { zc: (ribZ(k5, x) + ribZ(k6, x)) / 2 + 0.03, x, k: k5, stage: 0, tipZ: hole.z, skinZ: hole.z, green, red, showRed: false, bad: false, resist: 0 };
          pst.dis = d; panel.showXsec(true);
          const bandMesh = (z0, z1, color, op) => {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, z1 - z0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false }));
            m.rotation.set(-Math.PI / 2, 0, -Math.atan(SLOPE)); m.position.set(x, surf(x, (z0 + z1) / 2) + 0.008, (z0 + z1) / 2); m.renderOrder = 4; group.add(m); return m;
          };
          const band = bandMesh(green[0], green[1], 0x3ec5b5, 0.18), redBand = bandMesh(red[0], red[1], 0xe5484d, 0.28); redBand.visible = false;
          const NOTCH = [150, 200, 260]; // each layer is stiffer
          let pending = 0, acc = 0, popped = false, overAcc = 0, overN = 0, spread = 0, lastX = null, done = false, keyPrev = false, bled = false, inGreen = 0;
          const tip = new THREE.Vector3();
          const zone = (z) => z > green[1] + 0.004 ? 'bone' : z >= green[0] ? 'green' : z > red[1] ? 'mid' : 'red';
          const bleed = () => {
            if (bled) return; bled = true; d.showRed = true; redBand.visible = true; phys.bleed = 1; bleedSeep();
            S.error(1, "Rib's lower edge, that is where the nerve and vessels run.");
          };
          const mech = {
            tip, toolOpen: 0, hideMarker: true,
            frac: () => done ? 1 : (d.stage + (popped ? 1 : 0)) / 5,
            push(delta) { pending += delta; },
            update(ev, dt) {
              if (done) return true;
              const z = clamp(ev.p.z, ribZ(k5, x) - 0.02, ribZ(k6, x) + 0.03);
              const cxp = clamp(ev.p.x, x - 0.07, x + 0.07);
              d.tipZ = z;
              tip.set(cxp, surf(cxp, z) - 0.012 * d.stage, z);
              const zn = zone(z);
              d.bad = zn === 'red';
              band.material.opacity = zn === 'green' ? 0.32 : 0.16;
              const kd = !!(ev.input && (ev.input.keys.has('ArrowDown') || ev.input.keys.has('KeyS')));
              if (kd && !keyPrev) pending += 100;
              keyPrev = kd;
              if (pending > 0) {
                const delta = pending; pending = 0;
                if (popped) {
                  overAcc += delta;
                  if (overAcc >= 100) {
                    overAcc = 0; overN++;
                    if (overN === 2) S.warn('Stop: you are in the chest. Do not push deeper.');
                    if (overN >= 3 && !mech.lac) { mech.lac = true; phys.lac++; S.error(0.8, 'Too deep: lung lacerated'); }
                  }
                } else if (d.stage < 3) {
                  if (zn === 'bone') { S.warn('That is bone: slide up over the top of the rib'); acc = 0; d.resist = 0; }
                  else {
                    acc += delta; d.resist = acc / NOTCH[d.stage];
                    if (acc >= NOTCH[d.stage]) {
                      acc = 0; d.resist = 0;
                      if (zn === 'red') { bleed(); S.setInstr('Back off: drop onto the top of the rib below (teal band) and continue'); }
                      else {
                        d.stage++;
                        if (zn === 'green') { inGreen++; S.precision(Math.abs(z - (zTop6 - 0.02)) / MM); S.comboHit('layer', 'Over the top of the rib', 40); }
                        else { S.precision(Math.abs(z - (zTop6 - 0.02)) / MM + 2); S.warn('Stay above the rib. Vessels run below it.'); }
                        S.info(['Through the fat', 'Through the intercostals', 'At the pleura: firm click to pop'][d.stage - 1]);
                        if (d.stage === 3) S.setInstr('Parietal pleura: one firm click to pop through (stay in the teal band).');
                      }
                    }
                  }
                }
              }
              if (ev.pressed && !popped) {
                if (d.stage < 3) { S.m.missedActions++; S.warn('Not through yet: scroll to push through the layers'); }
                else if (zn === 'red') bleed();
                else {
                  popped = true; phys.popped = true; phys.lungTarget = 0.55; d.stage = 4;
                  playPop(); airRush();
                  S.award(inGreen >= 3 && !bled ? 250 : 170, 'Pop! Rush of air');
                  later(() => S.info('Over the top of the rib, the safe way in.'), 900);
                  S.setInstr('Hold the button and move left-right to spread the jaws and widen the track.');
                  lastX = null;
                }
              }
              if (popped) {
                if (ev.down) {
                  if (lastX !== null) spread += Math.abs(ev.p.x - lastX);
                  lastX = ev.p.x;
                  mech.toolOpen = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(spread * 40));
                } else { lastX = null; mech.toolOpen = 0; }
                if (spread > 0.35) { done = true; S.award(80, 'Track spread'); band.visible = false; redBand.visible = false; return true; }
              }
              return false;
            },
            async bot(bot) {
              const y = Y0 + 0.01, zg = zTop6 - 0.02;
              await bot.moveTo(V(x, y, zg - 0.05), 0.5); await bot.wait(0.3);
              await bot.moveTo(V(x, y, zg), 0.2); await bot.wait(0.4);
              for (let n = 0; n < 3; n++) {
                for (let t = 0; t < 3; t++) { mech.push(100); await bot.wait(0.3); }
                await bot.wait(0.5);
              }
              await bot.wait(0.3); bot.down(true); await bot.wait(0.12); bot.down(false); await bot.wait(1.4);
              bot.down(true);
              for (let i = 0; i < 4; i++) { await bot.moveTo(V(x + 0.05, y, zg), 0.4, false); await bot.moveTo(V(x - 0.05, y, zg), 0.4, false); }
              bot.down(false); await bot.wait(0.2);
            },
            dispose() { group.remove(band, redBand); if (wheelOff) wheelOff(); },
          };
          const onWheel = (e) => { if (e.deltaY > 0) pending += Math.min(150, e.deltaY * (e.deltaMode === 1 ? 33 : 1)); };
          window.addEventListener('wheel', onWheel, { passive: true });
          wheelOff = () => { window.removeEventListener('wheel', onWheel); wheelOff = null; };
          return mech;
        },
      },
      {
        title: 'Finger sweep', tool: null, plane: Y0 + 0.01,
        instr: 'Hold the button and circle once around the opening: a gloved finger checks for adhesions and confirms you are in the pleura.',
        cam: camAt(SITE_X, icsZ(5, SITE_X) + 0.07, 1.05, 0.65),
        start(S) {
          if (wheelOff) wheelOff();
          panel.showXsec(false);
          const finger = new THREE.Group();
          const glove = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.55 });
          const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.22, 6, 16), glove); f.rotation.x = Math.PI / 2 - 0.5; f.position.set(0, 0.07, 0.11); finger.add(f);
          const hand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), glove); hand.scale.set(1, 0.55, 1.2); hand.position.set(0.02, 0.17, 0.32); finger.add(hand);
          group.add(finger);
          const ring = makeRing(0.06, 0.072, 0x3ec5b5, hole.y + 0.01, 0.6); ring.position.set(hole.x, hole.y + 0.01, hole.z); ring.material.depthTest = false; ring.renderOrder = 9; group.add(ring);
          let sum = 0, lastA = null, done = false;
          return {
            hideMarker: true,
            frac: () => Math.min(1, Math.abs(sum) / (Math.PI * 2)),
            update(ev) {
              if (done) return true;
              const dx = ev.p.x - hole.x, dz = ev.p.z - hole.z, r = Math.hypot(dx, dz);
              finger.position.set(ev.p.x, hole.y + (ev.down ? -0.03 : 0.02), ev.p.z);
              ring.material.opacity = 0.4 + 0.3 * Math.sin(performance.now() / 200);
              if (ev.down && r > 0.025 && r < 0.18) {
                const a = Math.atan2(dz, dx);
                if (lastA !== null) { let da = a - lastA; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; sum += da; }
                lastA = a;
              } else lastA = null;
              if (Math.abs(sum) >= Math.PI * 2 * 0.95) { done = true; S.award(100, 'Sweep clear: no adhesions'); finger.visible = false; ring.visible = false; return true; }
              return false;
            },
            async bot(bot) {
              const y = Y0 + 0.01, R = 0.075, pts = [];
              for (let i = 0; i <= 32; i++) { const a = (i / 32) * Math.PI * 2.15; pts.push(V(hole.x + Math.cos(a) * R, y, hole.z + Math.sin(a) * R)); }
              await bot.moveTo(pts[0], 0.5); bot.down(true); await bot.wait(0.1); await bot.path(pts.slice(1), 0.3); bot.down(false); await bot.wait(0.2);
            },
            dispose() { group.remove(finger, ring); },
          };
        },
      },
      {
        title: 'Insert the tube toward the apex', tool: 'driver', plane: Y0 + 0.01,
        instr: 'Pneumothorax: air rises. Press on the opening and drag the clamped tube posterior-superior along the teal guide to 10-14 cm.',
        cam: camAt(SITE_X + 0.12, icsZ(5, SITE_X) - 0.08, 1.45, 0.9),
        start(S) {
          const tgt = new THREE.Vector2(0.72, -0.69).normalize(); // posterior (+x) and superior (-z)
          const y = hole.y + 0.012;
          const guide = new Ribbon(40, y, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
          const tc = new THREE.Color(0x3ec5b5);
          for (let i = 1; i < 18; i += 2) guide.seg(hole.clone().add(V(tgt.x * 0.022 * i, 0, tgt.y * 0.022 * i)), hole.clone().add(V(tgt.x * 0.022 * (i + 1), 0, tgt.y * 0.022 * (i + 1))), 0.008, 0.008, tc);
          guide.mesh.renderOrder = 6; group.add(guide.mesh);
          const zoneR = makeRing(0.05, 0.064, 0x3ec5b5, y, 0.75); zoneR.position.set(hole.x + tgt.x * 0.36, y, hole.z + tgt.y * 0.36); zoneR.material.depthTest = false; zoneR.renderOrder = 9; group.add(zoneR);
          const zl = labelSprite('apex 12 cm'); zl.position.set(zoneR.position.x + 0.12, y + 0.05, zoneR.position.z - 0.04); group.add(zl);
          const preview = new Ribbon(4, y + 0.002, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
          preview.mesh.renderOrder = 7; group.add(preview.mesh);
          const tip = new THREE.Vector3();
          let held = false, done = false;
          const reset = () => { pst.tube = null; preview.n = 0; preview.geo.setDrawRange(0, 0); };
          return {
            tip, toolOpen: 0,
            frac: () => done ? 1 : held ? 0.5 : 0,
            update(ev) {
              if (done) return true;
              tip.copy(ev.p);
              if (ev.pressed && !held) {
                if (Math.hypot(ev.p.x - hole.x, ev.p.z - hole.z) < 0.1) { held = true; S.setInstr('Advance along the guide: posterior and up, toward the apex'); }
                else { S.m.missedActions++; S.warn('Start at the opening'); }
              }
              if (!held) return false;
              const vx = ev.p.x - hole.x, vz = ev.p.z - hole.z, dist = Math.hypot(vx, vz);
              const depth = Math.min(30, dist / 0.03);
              const angErr = dist > 0.01 ? Math.acos(clamp((vx * tgt.x + vz * tgt.y) / dist, -1, 1)) * 180 / Math.PI : 0;
              preview.n = 0; preview.seg(hole, V(ev.p.x, y, ev.p.z), 0.014, 0.014, new THREE.Color(angErr < 25 ? 0xf2f6f8 : 0xff8a8d));
              pst.tube = { ang: Math.atan2(-vz, vx) * 0.9 + 0.25, depth };
              S.setInstr(`Depth ${depth.toFixed(1)} cm · ${angErr < 25 ? 'on line to the apex' : angErr < 45 ? 'drifting off the line' : 'WRONG direction'} (aim 10-14 cm)`);
              if (ev.down) return false;
              held = false;
              if (angErr > 45) { S.error(0.6, 'Wrong direction, it will not drain.'); S.m.retries++; reset(); return false; }
              if (depth < 9) { S.m.retries++; S.warn('Last side hole outside the chest: air leak. Go deeper.'); reset(); return false; }
              if (depth > 16) { S.m.retries++; S.warn('Too deep: the tube will kink at the apex. Pull back.'); reset(); return false; }
              const ideal = angErr < 25 && depth >= 10 && depth <= 14;
              S.precision(Math.min(8, angErr / 6 + Math.abs(depth - 12) * 0.8));
              S.award(ideal ? 200 : 140, ideal ? 'Tube to the apex, all holes inside' : 'Tube placed');
              tubeDir = new THREE.Vector2(vx / dist, vz / dist);
              connector.position.copy(hole).add(V(-0.3, 0.03, 0.45)); connector.visible = true; rebuildTube();
              phys.lungTarget = 0.78;
              guide.mesh.visible = false; zoneR.visible = false; zl.visible = false; preview.mesh.visible = false;
              done = true; return true;
            },
            async bot(bot) {
              const y0 = Y0 + 0.01;
              await bot.moveTo(V(hole.x, y0, hole.z), 0.5); await bot.wait(0.15); bot.down(true); await bot.wait(0.15);
              await bot.path([V(hole.x + tgt.x * 0.36, y0, hole.z + tgt.y * 0.36)], 0.18); await bot.wait(0.3); bot.down(false); await bot.wait(0.2);
            },
            dispose() {},
          };
        },
      },
      {
        title: 'Connect, secure & confirm', tool: null, plane: Y0 + 0.01,
        instr: 'Drag the tube connector onto the underwater-seal drain (kept below the chest).',
        cam: { pos: [SITE_X + 0.45, Y0 + 2.1, 2.75], target: [SITE_X + 0.38, Y0 - 0.25, 0.85] },
        start(S) {
          drain.visible = true;
          const subs = [];
          let phase = 0;
          const makers = [
            () => dragDrop(S, { obj: connector, target: drainPort.clone().setY(Y0 + 0.01), y: Y0 + 0.01, radius: 0.14, label: 'Connected to the water seal',
              onDone() { connector.position.copy(drainPort); rebuildTube(); phys.lungTarget = 0.92; S.info('Bubbling in the water seal: air escaping'); } }),
            () => {
              S.setInstr('Click in order: 1 keep the drain below the chest · 2 suture the tube · 3 occlusive dressing.');
              return clickTargets(S, {
                targets: [drainBase.clone().add(V(0.14, 0, 0)).setY(Y0 + 0.01), hole.clone().add(V(-0.1, 0, 0.06)).setY(Y0 + 0.01), hole.clone().add(V(0.05, 0, -0.06)).setY(Y0 + 0.01)],
                y: Y0 + 0.01, radius: 0.07, label: 'Secured', comboLabel: 'Tidy work',
                onHit(i) {
                  if (i === 0) S.info('Drain below chest level: no backflow');
                  if (i === 1) {
                    const st = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.004, 6, 20), new THREE.MeshStandardMaterial({ color: 0x1d2a5a, roughness: 0.5 }));
                    st.rotation.x = Math.PI / 2; st.position.copy(hole).add(V(0, 0.022, 0)); group.add(st);
                  }
                  if (i === 2) {
                    const dr = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.01, 0.26), new THREE.MeshStandardMaterial({ color: 0xf3f4f1, roughness: 0.9 }));
                    dr.position.copy(hole).add(V(0, 0.014, 0)); dr.rotation.y = -Math.atan(SLOPE); group.add(dr);
                  }
                },
              });
            },
            () => {
              S.setInstr('Hold SHIFT and keep the mouse still for 2 s: watch the water column swing with each breath.');
              let held = 0; const last = new THREE.Vector3(); let has = false;
              return {
                frac: () => held / 2,
                update(ev, dt) {
                  const still = has && Math.hypot(ev.p.x - last.x, ev.p.z - last.z) < 0.012;
                  last.copy(ev.p); has = true;
                  if (ev.input && ev.input.steady && still) held += dt; else held = Math.max(0, held - dt * 2);
                  if (held >= 2) { phys.lungTarget = 1.0; S.award(200, 'Lung re-expanding, sats climbing'); return true; }
                  return false;
                },
                async bot(bot) {
                  bot.down(false);
                  const keys = engine.input && engine.input.keys;
                  if (keys) keys.add('ShiftLeft');
                  try { await bot.wait(2.7); } finally { if (keys) keys.delete('ShiftLeft'); }
                },
                dispose() {},
              };
            },
          ];
          subs[0] = makers[0]();
          return {
            frac: () => (phase + Math.min(1, subs[phase] ? subs[phase].frac() : 0)) / 3,
            update(ev, dt) {
              if (phase >= 3) return true;
              if (phase === 0 && connector.visible) rebuildTube();
              if (subs[phase].update(ev, dt)) {
                if (subs[phase].group) subs[phase].group.visible = false;
                phase++;
                if (phase >= 3) return true;
                subs[phase] = makers[phase]();
              }
              return false;
            },
            async bot(bot) {
              for (let i = 0; i < 3; i++) {
                while (phase < i || !subs[i]) await bot.wait(0.05);
                await subs[i].bot(bot);
                while (phase === i) await bot.wait(0.05);
              }
            },
            dispose() {},
          };
        },
      },
    ];

    const controller = createSurgery({
      id: ID, engine, art, group, steps, monitor, parTime: 100,
      wideCam: { pos: [0.3, Y0 + 2.9, 2.6], target: [0.1, Y0 - 0.05, 0.25] },
      summary: { title: 'Lung re-expanded — SpO₂ 99%', sub: 'Chest tube in the 5th intercostal space, safe triangle, on an underwater seal.' },
    });
    Sref = controller.S;
    const banner = controller.S.banner;
    const bs = banner.setVitals.bind(banner);
    banner.setVitals = (v) => bs(adjust(v));
    const baseUpdate = controller.update;
    let panelT = 0;
    controller.update = (dt, input) => {
      baseUpdate(dt, input);
      if (controller.S.done) phys.lungTarget = 1;
      tickPhys(dt);
      tickPuffs(dt);
      if (seep) { seep.userData.t += dt; seep.scale.setScalar(Math.min(1.4, 0.4 + seep.userData.t * 0.5)); seep.material.opacity = 0.55 * Math.max(0.3, 1 - seep.userData.t / 12); }
      if (drain.visible) { swing += dt; drain.userData.col.position.y = 0.2 + (0.01 + 0.03 * phys.lung) * Math.sin(swing * 1.6); }
      panelT -= dt; if (panelT <= 0) { panelT = 0.06; panel.draw(); }
    };
    const baseDispose = controller.dispose;
    controller.dispose = () => {
      disposedFlag = true; timers.forEach(clearTimeout);
      if (wheelOff) wheelOff();
      panel.dispose(); baseDispose();
    };
    return controller;
  },
};
