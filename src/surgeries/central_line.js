// SURGERY — Ultrasound-guided central venous line (right internal jugular). No gore.
// Split view: 3D neck field (drapes, prep, probe, needle) + a live B-mode ULTRASOUND panel rendered on a 2D canvas
// (speckle, compressible oval vein vs round pulsatile artery, needle tip echo only when it sits in the beam plane).
// Steps: sterile bundle + probe placement -> compression test (pick the vein) -> needle under US (flash)
//        -> guidewire (never let go) -> dilate, catheter, wire out, flush.
import * as THREE from 'three';
import { createSurgery, MM } from './steps.js';
import { makeRing } from '../levels/_common.js';

const ID = 'central_line';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, ...o });
function call(art, name, ...a) {
  try { return typeof art[name] === 'function' ? art[name](...a) : null; } catch (e) { console.warn('[surgery] art.' + name, e); return null; }
}

// ---------------------------------------------------------------- anatomy (mm, relative to field centre C; vessels run along X)
const VEIN = { z: 6, d: 14, rx: 7.2, ry: 5.0 };     // internal jugular: lateral, larger, oval, thin wall
const ART = { z: -8, d: 17.5, r: 4.0 };              // common carotid: medial, deeper, round, thick wall
const PROBE_X = 0.05;                                // target band (world, relative to C.x): apex of the SCM triangle
const US_W = 304, US_H = 320, PX = 8;                // canvas px, 8 px per mm -> 38 mm wide, 40 mm deep

// ---------------------------------------------------------------- styles for the US panel + checklist
const CSS = `
.cvl-us{position:fixed;right:22px;top:118px;width:470px;z-index:35;pointer-events:auto;font-family:Inter,system-ui,sans-serif;color:#e8edf2;
  background:#0b0f13;border:1px solid rgba(255,255,255,.1);border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.4);overflow:hidden;transition:width .3s ease,right .3s ease}
.cvl-us.big{right:calc(50% - min(430px,calc(50vw - 20px)));width:min(860px,calc(100vw - 40px))}
.cvl-hd{display:flex;align-items:center;gap:10px;padding:8px 12px;font-size:12px;color:#8b98a5;letter-spacing:.06em;border-bottom:1px solid rgba(255,255,255,.06);white-space:nowrap}
.cvl-hd b{color:#e8edf2;font-weight:700;letter-spacing:.12em}.cvl-hd .sp{flex:1}.cvl-hd .k{color:#3EC5B5;font-weight:600}
.cvl-scr{position:relative;background:#000;line-height:0}
.cvl-scr canvas{width:100%;height:auto;display:block;cursor:crosshair}
.cvl-tag{position:absolute;left:10px;bottom:10px;line-height:1.2;font-size:12px;color:#c9d4dd;background:rgba(0,0,0,.6);padding:4px 8px;border-radius:6px}
.cvl-ft{padding:10px 12px 12px;display:flex;flex-direction:column;gap:9px;font-size:13px}
.cvl-row{display:flex;align-items:center;gap:10px}
.cvl-lab{font-size:11px;letter-spacing:.1em;color:#8b98a5;font-weight:600;text-transform:uppercase;white-space:nowrap;min-width:78px}
.cvl-syr{flex:1;height:14px;border-radius:7px;border:1px solid rgba(255,255,255,.25);background:rgba(170,210,235,.12);position:relative;overflow:hidden}
.cvl-syr i{position:absolute;left:0;top:0;bottom:0;width:0;background:#5a0f18}
.cvl-val{font-variant-numeric:tabular-nums;font-weight:600;min-width:118px;text-align:right;white-space:nowrap}
.cvl-val.bad{color:#ff8a8d}.cvl-val.ok{color:#3EC5B5}
.cvl-g{flex:1;height:12px;border-radius:6px;background:rgba(255,255,255,.08);position:relative}
.cvl-g .band{position:absolute;top:0;bottom:0;background:rgba(62,197,181,.35);border-left:2px solid #3EC5B5;border-right:2px solid #3EC5B5}
.cvl-g .dz{position:absolute;top:0;bottom:0;right:0;background:rgba(229,72,77,.28);border-radius:0 6px 6px 0}
.cvl-g .mk{position:absolute;top:-4px;bottom:-4px;width:4px;margin-left:-2px;background:#fff;border-radius:2px}
.cvl-chips{display:flex;gap:6px}.cvl-chips span{font-size:11px;font-weight:600;letter-spacing:.06em;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,.06);color:#8b98a5}
.cvl-chips span.on{background:#3EC5B5;color:#0b0f13}.cvl-chips span.done{color:#3EC5B5}
.cvl-btn{pointer-events:auto;font:600 13px Inter,system-ui,sans-serif;color:#0b0f13;background:#3EC5B5;border:0;border-radius:8px;padding:7px 14px;cursor:pointer}
.cvl-ck{position:fixed;left:22px;top:150px;width:300px;z-index:35;pointer-events:auto;font-family:Inter,system-ui,sans-serif;color:#e8edf2;
  background:rgba(11,15,19,.92);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:14px;box-shadow:0 8px 28px rgba(0,0,0,.4)}
.cvl-ck h4{margin:0 0 4px;font-size:12px;letter-spacing:.12em;color:#8b98a5}.cvl-ck .t{font-size:12px;color:#8b98a5;margin-bottom:10px}
.cvl-ck button{display:flex;align-items:center;gap:10px;width:100%;margin-top:7px;padding:9px 10px;border-radius:9px;cursor:pointer;text-align:left;
  font:500 15px Inter,system-ui,sans-serif;color:#e8edf2;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}
.cvl-ck button:hover{border-color:#3EC5B5}
.cvl-ck button i{font-style:normal;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:700;background:rgba(255,255,255,.1)}
.cvl-ck button.done{color:#3EC5B5;border-color:rgba(62,197,181,.4)}.cvl-ck button.done i{background:#3EC5B5;color:#0b0f13}
`;

export default {
  id: ID,
  title: 'Central Line (US-guided)',
  MM,
  brief: 'Place a central venous line in the internal jugular vein under live ultrasound. Press to find the vein that collapses, ' +
    'steer the needle tip on the screen, then thread wire, dilator and catheter (Seldinger). Avoid the pulsing artery; never let go of the wire.',

  setup(engine, art) {
    const group = new THREE.Group(); group.name = 'surgery-central-line'; engine.scene.add(group);
    const uiRoot = document.getElementById('ui') || document.body;
    let disposed = false;

    // ---------------- field: right neck, draped, prepped ----------------
    const FW = 2.4, FH = 1.6;
    const field = call(art, 'makeSurgicalField', { w: FW, h: FH, surfaceY: 0.35 });
    let skinY = 0.35, drapeParts = [];
    if (field && field.mesh) {
      group.add(field.mesh); skinY = field.surfaceY ?? field.mesh.userData.surfaceY ?? 0.35;
      drapeParts = field.mesh.children.filter((c) => c.name !== 'padTop' && !(c.geometry && c.geometry.type === 'BoxGeometry'));
    } else {
      const sk = new THREE.Mesh(new THREE.BoxGeometry(FW, 0.35, FH), std(0xd2a68e, { roughness: 0.6 })); sk.position.y = 0.175; group.add(sk);
      const dr = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), std(0x3d6f9e, { roughness: 0.9 })); dr.rotation.x = -Math.PI / 2; dr.position.y = 0.36;
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), std(0xb9774f)); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.352;
      group.add(dr, hole); drapeParts = [dr];
    }
    const C = V(0, skinY, 0);
    // unprepped skin overlay: fades away when the chlorhexidine prep is applied
    const rawMat = call(art, 'makeSkinMaterial', { w: FW + 0.3, h: FH + 0.3, prep: false }) || std(0xd2a68e, { roughness: 0.6 });
    rawMat.transparent = true;
    const raw = new THREE.Mesh(new THREE.PlaneGeometry(FW + 0.3, FH + 0.3), rawMat);
    raw.rotation.x = -Math.PI / 2; raw.position.set(C.x, skinY + 0.0015, C.z); raw.renderOrder = 1; group.add(raw);
    // the drapes come down when the "full drape" item is ticked
    const drapeY0 = drapeParts.map((d) => d.position.y);
    drapeParts.forEach((d) => { d.visible = false; });
    function dropDrape() {
      const t0 = performance.now();
      drapeParts.forEach((d) => { d.visible = true; });
      const tick = () => { if (disposed) return; const u = Math.min(1, (performance.now() - t0) / 650), e = 1 - (1 - u) ** 3;
        drapeParts.forEach((d, i) => { d.position.y = drapeY0[i] + (1 - e) * 0.9; }); if (u < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }
    // antiseptic stain (painted in overlapping strokes, irregular edge) that appears with the prep
    const stainTex = (() => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 352; const x = c.getContext('2d');
      let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 260; i++) {
        const px = 40 + r() * 432, py = 30 + r() * 292, rad = 30 + r() * 60;
        const g = x.createRadialGradient(px, py, 0, px, py, rad);
        g.addColorStop(0, `rgba(150,72,22,${0.10 + r() * 0.08})`); g.addColorStop(1, 'rgba(150,72,22,0)');
        x.fillStyle = g; x.beginPath(); x.arc(px, py, rad, 0, Math.PI * 2); x.fill();
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const stain = new THREE.Mesh(new THREE.PlaneGeometry(FW + 0.3, FH + 0.3), new THREE.MeshStandardMaterial({ map: stainTex, transparent: true, opacity: 0, roughness: 0.35, depthWrite: false }));
    stain.rotation.x = -Math.PI / 2; stain.position.set(C.x, skinY + 0.002, C.z); stain.renderOrder = 1; group.add(stain);
    function applyPrep() {
      const t0 = performance.now();
      const tick = () => { if (disposed) return; const u = Math.min(1, (performance.now() - t0) / 900); rawMat.opacity = 1 - u; stain.material.opacity = 0.4 * u; if (u < 1) requestAnimationFrame(tick); else raw.visible = false; };
      requestAnimationFrame(tick);
    }
    // skin-marker landmarks: SCM heads + clavicle (the triangle whose apex we scan)
    const inkMat = new THREE.MeshBasicMaterial({ color: 0x4b2f86, transparent: true, opacity: 0.7, depthWrite: false });
    const ink = (pts) => { const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, z]) => V(C.x + x, skinY + 0.003, C.z + z))), 24, 0.006, 4), inkMat); m.renderOrder = 2; group.add(m); return m; };
    ink([[-1.0, -0.02], [-0.3, -0.03], [PROBE_X - 0.05, -0.04], [0.55, -0.24], [1.05, -0.45]]);  // sternal head
    ink([[-1.0, 0.04], [-0.3, 0.06], [PROBE_X - 0.05, 0.08], [0.55, 0.3], [1.05, 0.52]]);        // clavicular head
    ink([[1.1, -0.66], [1.04, 0], [1.1, 0.68]]);                                                 // clavicle

    let monitor = call(art, 'makeVitalsMonitor');
    if (monitor && monitor.mesh) { monitor.mesh.position.set(C.x - 2.8, skinY - 2.6, C.z - 2.4); monitor.mesh.rotation.y = 0.45; group.add(monitor.mesh); }
    else monitor = null;

    // ---------------- ultrasound probe (origin = footprint centre, long axis = local Z) ----------------
    const probe = new THREE.Group(); probe.rotation.order = 'YZX';
    const grey = std(0xa3abb3, { roughness: 0.38, metalness: 0.05 }), dark = std(0x23282e, { roughness: 0.45 });
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.4), dark); lens.position.y = 0.025; probe.add(lens);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.44), grey); head.position.y = 0.15; probe.add(head);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 0.25, 20), grey); neck.scale.z = 1.6; neck.position.y = 0.37; probe.add(neck);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.55, 20), grey); handle.position.y = 0.76; probe.add(handle);
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.03), std(0x3ec5b5, { emissive: 0x1b6d64 })); notch.position.set(0, 0.17, -0.23); probe.add(notch);
    const midTick = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.015, 0.012), std(0xffffff)); midTick.position.set(0, 0.23, 0); probe.add(midTick);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 1.02, 0), V(0, 1.3, -0.05), V(0.15, 1.55, -0.4), V(0.4, 1.7, -1.1)]), 24, 0.025, 8), dark); probe.add(cable);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.125, 1.05, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xdfe9f2, transparent: true, opacity: 0.16, roughness: 0.15, side: THREE.DoubleSide, depthWrite: false }));
    sleeve.scale.z = 2.1; sleeve.position.y = 0.55; sleeve.visible = false; probe.add(sleeve);
    probe.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    probe.scale.setScalar(0.8);
    const probeRest = V(C.x + 0.75, skinY + 0.02, C.z + 1.05);
    probe.position.copy(probeRest); group.add(probe);
    const pr = { yaw: 0.75, fan: 0, press: 0, onSkin: false };
    // target band on the skin
    const band = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.62), new THREE.MeshBasicMaterial({ color: 0x3ec5b5, transparent: true, opacity: 0, depthWrite: false }));
    band.rotation.x = -Math.PI / 2; band.position.set(C.x + PROBE_X, skinY + 0.004, C.z); band.renderOrder = 4; group.add(band);

    // ---------------- needle + syringe (origin = tip, +Z toward the hub) ----------------
    const steel = new THREE.MeshStandardMaterial({ color: 0xd5dbe0, metalness: 0.95, roughness: 0.18 });
    const NL = 0.65;
    const needle = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, NL, 10), steel); shaft.rotation.x = Math.PI / 2; shaft.position.z = NL / 2; needle.add(shaft);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.09, 14), std(0x3fae5a, { roughness: 0.35 })); hub.rotation.x = Math.PI / 2; hub.position.z = NL + 0.045; needle.add(hub);
    const syr = new THREE.Group(); syr.position.z = NL + 0.09; needle.add(syr);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.58, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xeef5fa, transparent: true, opacity: 0.32, roughness: 0.08, side: THREE.DoubleSide, depthWrite: false }));
    barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.32; syr.add(barrel);
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.04, 12), barrel.material); nose.rotation.x = Math.PI / 2; nose.position.z = 0.02; syr.add(nose);
    const saline = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 1, 20), new THREE.MeshStandardMaterial({ color: 0xbfe2f5, transparent: true, opacity: 0.45, roughness: 0.1 }));
    saline.rotation.x = Math.PI / 2; syr.add(saline);
    const flashMat = new THREE.MeshStandardMaterial({ color: 0x4a0f18, roughness: 0.3 });
    const flash = new THREE.Mesh(new THREE.CylinderGeometry(0.057, 0.057, 1, 20), flashMat); flash.rotation.x = Math.PI / 2; flash.visible = false; syr.add(flash);
    const stopper = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 20), dark); stopper.rotation.x = Math.PI / 2; syr.add(stopper);
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.5), std(0xf2f4f6)); syr.add(rod);
    const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.018, 20), std(0xf2f4f6)); thumb.rotation.x = Math.PI / 2; syr.add(thumb);
    const flange = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.02), std(0xf2f4f6)); flange.position.z = 0.6; syr.add(flange);
    const setPlunger = (fill, blood) => { // fill: barrel content length (world), blood: 0..1 fraction of it
      const z0 = 0.05; saline.scale.y = Math.max(0.001, fill * (1 - blood)); saline.position.z = z0 + fill * blood + fill * (1 - blood) / 2;
      flash.visible = blood > 0.01; flash.scale.y = Math.max(0.001, fill * blood); flash.position.z = z0 + fill * blood / 2;
      stopper.position.z = z0 + fill + 0.015; rod.position.z = stopper.position.z + 0.25; thumb.position.z = stopper.position.z + 0.5;
    };
    setPlunger(0.18, 0);
    needle.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    needle.visible = false; group.add(needle);
    const entryRing = makeRing(0.02, 0.03, 0x3ec5b5, skinY + 0.004, 0.9); entryRing.visible = false; group.add(entryRing);
    const aimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(1, 0, 0)]), new THREE.LineDashedMaterial({ color: 0x3ec5b5, dashSize: 0.025, gapSize: 0.018, transparent: true, opacity: 0.8, depthTest: false }));
    aimLine.renderOrder = 8; aimLine.visible = false; aimLine.frustumCulled = false; group.add(aimLine);

    // guidewire, dilator, catheter (dilator/catheter origin = distal tip, body along +Z)
    const wireMat = std(0xe9eef2, { metalness: 0.7, roughness: 0.25 });
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 1, 6), wireMat); wire.visible = false; group.add(wire);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.018, 8, 48), std(0x2f6fd6, { roughness: 0.4 })); hoop.rotation.x = -Math.PI / 2;
    hoop.position.set(C.x - 0.75, skinY + 0.03, C.z + 0.62); hoop.visible = false; group.add(hoop);
    const dil = new THREE.Group();
    { const blue = std(0x5aa0e0, { roughness: 0.3 });
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.006, 0.12, 14), blue); b.rotation.x = Math.PI / 2; b.position.z = 0.06; dil.add(b);
      const s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.6, 14), blue); s2.rotation.x = Math.PI / 2; s2.position.z = 0.42; dil.add(s2);
      const h2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 14), std(0xf2f4f6)); h2.rotation.x = Math.PI / 2; h2.position.z = 0.76; dil.add(h2); }
    dil.visible = false; group.add(dil);
    const cath = new THREE.Group();
    { const white = std(0xf4f5f2, { roughness: 0.35 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.2, 14), white); body.rotation.x = Math.PI / 2; body.position.z = 1.1; cath.add(body);
      const hubC = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.16), white); hubC.position.z = 2.25; cath.add(hubC);
      [[0x2f6fd6, -0.5], [0xf4f5f2, 0], [0x8a5a2b, 0.5]].forEach(([col, a]) => {
        const p = new THREE.Group(); p.position.z = 2.32; p.rotation.y = a * 0.6; cath.add(p);
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.32, 8), std(0xeef2f5)); t.rotation.x = Math.PI / 2; t.position.z = 0.16; p.add(t);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.06, 12), std(col, { roughness: 0.4 })); cap.rotation.x = Math.PI / 2; cap.position.z = 0.34; p.add(cap);
      }); }
    cath.visible = false; group.add(cath);

    // ---------------- needle geometry state ----------------
    const nd = { entry: V(C.x + PROBE_X - 0.16, skinY, C.z + VEIN.z * MM), angle: 30, L: 0, locked: false, flash: 0, fluid: 'none', redirects: 0,
      inVein: false, artArmed: true, pleuraArmed: true, ttArmed: true, tracked: false, lostT: 0 };
    const dir = new THREE.Vector3();
    const tipW = new THREE.Vector3();
    const needleDir = () => { const a = THREE.MathUtils.degToRad(nd.angle); return dir.set(Math.cos(a), -Math.sin(a), 0); };
    const tipPos = () => tipW.copy(nd.entry).addScaledVector(needleDir(), nd.L * MM);
    function placeNeedle(hover = 0) {
      tipPos();
      needle.position.copy(tipW); needle.position.y += hover;
      needle.lookAt(needle.position.clone().sub(dir));
    }
    const tipMm = () => { tipPos(); return { x: (tipW.x - C.x) / MM, z: (tipW.z - C.z) / MM, d: (skinY - tipW.y) / MM }; };
    const qVein = (z, d) => ((z - VEIN.z) / VEIN.rx) ** 2 + ((d - VEIN.d) / VEIN.ry) ** 2;
    const qArt = (z, d) => ((z - ART.z) / ART.r) ** 2 + ((d - ART.d) / ART.r) ** 2;

    // ---------------- probe frame: U = long axis, Vb = beam direction, N = slice normal ----------------
    const U = new THREE.Vector3(), Vb = new THREE.Vector3(), N = new THREE.Vector3();
    function probeFrame() {
      const th = pr.yaw, ph = pr.fan;
      U.set(Math.sin(th), 0, Math.cos(th));
      Vb.set(Math.sin(ph) * Math.cos(th), -Math.cos(ph), -Math.sin(ph) * Math.sin(th));
      N.crossVectors(U, Vb).normalize();
    }
    function placeProbe(lift = 0) {
      probe.rotation.set(0, pr.yaw, pr.fan);
      probe.position.y = skinY + lift - pr.press * 0.025;
    }

    // ---------------- ultrasound renderer ----------------
    const SPK = new Float32Array(512 * 512);
    { const raw0 = new Float32Array(512 * 512);
      for (let i = 0; i < raw0.length; i++) raw0[i] = Math.sqrt(-2 * Math.log(Math.random() + 1e-6));
      for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
        const a = raw0[y * 512 + x], b = raw0[y * 512 + ((x + 1) & 511)], c = raw0[y * 512 + ((x + 511) & 511)], d = raw0[((y + 1) & 511) * 512 + x];
        SPK[y * 512 + x] = (a * 0.4 + b * 0.22 + c * 0.22 + d * 0.16) * 0.82;
      } }
    const NZ = new Float32Array(65536); for (let i = 0; i < NZ.length; i++) NZ[i] = Math.random();

    const css = document.createElement('style'); css.textContent = CSS; document.head.appendChild(css);
    const panel = document.createElement('div'); panel.className = 'cvl-us';
    panel.innerHTML = `<div class="cvl-hd"><b>ULTRASOUND</b><span>L12-4 · B-MODE · 4 cm</span><span class="sp"></span>
        <span data-k="ang">NEEDLE —</span><span class="k" data-k="tilt">TILT 0°</span><span>Q zoom</span></div>
      <div class="cvl-scr"><canvas width="${US_W}" height="${US_H}"></canvas><div class="cvl-tag" data-k="tag">No probe contact</div></div>
      <div class="cvl-ft">
        <div class="cvl-chips" data-k="chips"><span>Needle</span><span>Wire</span><span>Dilator</span><span>Catheter</span></div>
        <div class="cvl-row"><span class="cvl-lab">Syringe</span><div class="cvl-syr"><i data-k="syr"></i></div><span class="cvl-val" data-k="syrv">empty</span></div>
        <div class="cvl-row" data-k="grow" style="display:none"><span class="cvl-lab" data-k="glab">Wire</span><div class="cvl-g"><div class="dz" data-k="gdz"></div><div class="band" data-k="gband"></div><div class="mk" data-k="gmk"></div></div><span class="cvl-val" data-k="gval">0</span></div>
        <div class="cvl-row" data-k="brow" style="display:none"><button class="cvl-btn" data-k="btn">Aspirate &amp; flush</button><span style="color:#8b98a5" data-k="bnote"></span></div>
      </div>`;
    uiRoot.appendChild(panel);
    const $ = (k) => panel.querySelector(`[data-k="${k}"]`);
    const cvs = panel.querySelector('canvas'); const ctx = cvs.getContext('2d');
    const img = ctx.createImageData(US_W, US_H); const pix = img.data;
    let labelsOn = false, usClick = null;
    const setTag = (s) => { const t = $('tag'); if (t.textContent !== s) t.textContent = s; };

    function setGauge(o) {
      if (!o) { $('grow').style.display = 'none'; return; }
      $('grow').style.display = '';
      $('glab').textContent = o.label;
      const pc = (v) => (clamp(v / o.max, 0, 1) * 100) + '%';
      $('gband').style.left = pc(o.band[0]); $('gband').style.width = `calc(${pc(o.band[1])} - ${pc(o.band[0])})`;
      $('gdz').style.left = o.danger != null ? pc(o.danger) : '100%';
      $('gmk').style.left = pc(o.value);
      const v = $('gval'); v.textContent = o.text; v.className = 'cvl-val ' + (o.value > (o.danger ?? 1e9) ? 'bad' : o.value >= o.band[0] && o.value <= o.band[1] ? 'ok' : '');
    }
    function setChip(i) { [...$('chips').children].forEach((c, k) => { c.className = k < i ? 'done' : k === i ? 'on' : ''; }); }
    function setSyringe() {
      const s = $('syr'), v = $('syrv');
      if (nd.fluid === 'vein') { s.style.width = (30 + 50 * nd.flash) + '%'; s.style.background = '#5a0f18'; v.textContent = 'dark, steady'; v.className = 'cvl-val ok'; }
      else if (nd.fluid === 'artery') { const p = 0.5 + 0.5 * Math.sin(performance.now() / 130); s.style.width = (45 + 35 * p) + '%'; s.style.background = '#e0262f'; v.textContent = 'BRIGHT, PULSING'; v.className = 'cvl-val bad'; }
      else if (nd.fluid === 'flush') { s.style.width = '80%'; s.style.background = '#bfe2f5'; v.textContent = 'flushed'; v.className = 'cvl-val ok'; }
      else { s.style.width = '0%'; v.textContent = nd.L > 0 && needle.visible ? 'aspirating…' : 'empty'; v.className = 'cvl-val'; }
    }

    // vessel posture this frame
    const ves = { vRy: VEIN.ry, vD: VEIN.d, aR: ART.r, pulse: 0 };
    let wireIn = 0, cathIn = 0, wireVisibleUS = false, cathVisibleUS = false;
    function updateVessels(t) {
      const beat = (t * 1.25) % 1; ves.pulse = beat < 0.18 ? Math.sin(beat / 0.18 * Math.PI) : 0;
      ves.aR = ART.r * (1 + 0.1 * ves.pulse);
      let c = pr.press; // compression: vein collapses from the top (keeps its floor)
      if (needle.visible && nd.L > 0 && !nd.inVein) { // needle tenting the anterior wall before it pops through
        const m = tipMm(); const top = VEIN.d - VEIN.ry;
        if (Math.abs(m.z - VEIN.z) < VEIN.rx * 0.85 && m.d > top - 3 && m.d < VEIN.d) c = Math.max(c, clamp((m.d - (top - 3)) / 6, 0, 0.55));
      }
      const ry = VEIN.ry * (1 - 0.88 * c) * (1 + 0.04 * Math.sin(t * 0.9));
      ves.vRy = ry; ves.vD = VEIN.d + VEIN.ry - ry;
    }
    function renderUS() {
      const off = (Math.random() * 65536) | 0;
      if (!pr.onSkin) {
        for (let i = 0, p = 0; i < US_W * US_H; i++, p += 4) { const v = NZ[(i + off) & 65535] * 14; pix[p] = pix[p + 1] = pix[p + 2] = v; pix[p + 3] = 255; }
        ctx.putImageData(img, 0, 0); drawOverlay(false, 0); return;
      }
      probeFrame();
      const Pz = (probe.position.z - C.z) / MM;
      const uz = U.z, vz = Vb.z, vy = -Vb.y;
      const { vRy, vD, aR, pulse } = ves;
      const vRx = VEIN.rx, aD = ART.d, press = pr.press * 2.5;
      for (let py = 0; py < US_H; py++) {
        const d = py / PX;
        const att = 1.18 - d / 62;
        for (let px = 0; px < US_W; px++) {
          const w = (px - US_W / 2) / PX;
          const z = Pz + w * uz + d * vz, dep = d * vy + press;
          let b;
          // layered soft tissue: skin, subcutis, SCM (striated), fascia, deep tissue, thyroid edge
          if (dep < 0.8) b = 2.1;
          else if (dep < 3.4) b = 0.55 + (Math.sin(z * 0.9 + dep * 3.1) > 0.93 ? 0.9 : 0);
          else if (dep < 10.5 && z > -15 && z < 19) b = 0.5 + (Math.sin(dep * 1.6 + 1.1 * Math.sin(z * 0.11) + 0.4 * Math.sin(z * 0.37)) > 0.9 ? 0.75 : 0);
          else if (dep < 11.3 && z > -15 && z < 19) b = 1.7;
          else if (z < -16 && dep > 4 && dep < 21) b = 1.15;
          else b = 0.7;
          // transverse process + acoustic shadow (deep, medial)
          const tp = 33 + 0.05 * (z + 13) * (z + 13);
          if (z > -20 && z < -6) { if (dep > tp && dep < tp + 1.1) b = 1.9; else if (dep > tp + 1.1) b = 0.35; }
          // vessels: artery thick bright wall, vein thin wall, posterior acoustic enhancement
          const qa = ((z - ART.z) / aR) ** 2 + ((dep - aD) / aR) ** 2;
          const qv = ((z - VEIN.z) / vRx) ** 2 + ((dep - vD) / vRy) ** 2;
          let lumen = false;
          if (qa < 1) lumen = true; else if (qa < 1.55) b = 2.0 + pulse * 0.4;
          else if (qv < 1) lumen = true; else if (qv < 1.28) b = 1.35;
          else {
            if (dep > aD && Math.abs(z - ART.z) < aR) b *= 1.3;
            if (dep > vD && Math.abs(z - VEIN.z) < vRx * 0.9) b *= 1.35;
          }
          const si = ((((dep * 6) | 0) & 511) << 9) | ((((z + 80) * 5) | 0) & 511);
          const n = NZ[(py * US_W + px + off) & 65535];
          const sp = SPK[si];
          let val = lumen ? 0.025 + 0.04 * n : b * sp * sp * att * 0.27 * (0.9 + 0.2 * n);
          if (val > 1) val = 1;
          const p = (py * US_W + px) << 2;
          const g = val * 255;
          pix[p] = g; pix[p + 1] = g; pix[p + 2] = g * 1.03; pix[p + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      drawOverlay(true, Pz);
    }
    const toPx = (wmm, dmm) => [US_W / 2 + wmm * PX, dmm * PX];
    function echo(x, y, r, tail, a = 1) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
      g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.45, `rgba(255,255,255,${0.75 * a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();
      for (let k = 1; k <= tail; k++) { ctx.fillStyle = `rgba(255,255,255,${0.5 * a / k})`; ctx.fillRect(x - r * 1.2, y + k * 5, r * 2.4, 1.6); }
    }
    const tmpE = new THREE.Vector3();
    function drawOverlay(on, Pz) {
      ctx.fillStyle = '#9fb0bd'; ctx.font = '600 10px Inter, Arial, sans-serif';
      for (let cm = 1; cm <= 3; cm++) { ctx.fillRect(US_W - 10, cm * 10 * PX, 8, 1); ctx.fillText(String(cm), US_W - 20, cm * 10 * PX + 4); }
      for (let mm = 5; mm < 40; mm += 5) ctx.fillRect(US_W - 6, mm * PX, 4, 1);
      ctx.fillStyle = '#3EC5B5'; ctx.beginPath(); ctx.arc(10, 10, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(US_W / 2 - 0.5, 0, 1, 7);
      if (!on) return;
      probeFrame();
      const P = probe.position, py0 = skinY - pr.press * 0.025;
      const proj = (Q) => { const dx = Q.x - P.x, dy = Q.y - py0, dz = Q.z - P.z; return { w: (dx * U.x + dy * U.y + dz * U.z) / MM, d: (dx * Vb.x + dy * Vb.y + dz * Vb.z) / MM, s: (dx * N.x + dy * N.y + dz * N.z) / MM }; };
      nd.tracked = false;
      // needle: the TIP echo only inside the beam slice; otherwise the shaft crossing (a classic trap) or nothing
      if (needle.visible && nd.L > 0.5) {
        tmpE.copy(nd.entry); tipPos();
        const a = proj(tmpE), b = proj(tipW);
        const BEAM = 1.6;
        if (Math.abs(b.s) < BEAM && b.d > 0) { const [x, y] = toPx(b.w, b.d); echo(x, y, 3.2, 4, 1); nd.tracked = true; }
        else if (a.s * b.s < 0) { const k = a.s / (a.s - b.s); const w = a.w + (b.w - a.w) * k, d = a.d + (b.d - a.d) * k; if (d > 0) { const [x, y] = toPx(w, d); echo(x, y, 2.4, 1, 0.8); } }
      }
      const vesselPx = (zmm, dmm) => toPx((zmm - Pz) / Math.max(0.2, U.z), dmm);
      if (wireVisibleUS) { const [x, y] = vesselPx(VEIN.z + 0.5, ves.vD + 0.6); echo(x, y, 2.2, 3, 0.95); }
      if (cathVisibleUS) { const [x, y] = vesselPx(VEIN.z + 0.5, ves.vD + 0.6); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke(); }
      if (labelsOn) {
        ctx.font = '700 12px Inter, Arial, sans-serif';
        let [x, y] = vesselPx(VEIN.z, VEIN.d - VEIN.ry - 2.2); ctx.fillStyle = '#8fc0ff'; ctx.fillText('IJV', x - 10, y);
        [x, y] = vesselPx(ART.z, ART.d - ART.r - 2.6); ctx.fillStyle = '#ff8a8d'; ctx.fillText('CA', x - 8, y);
      }
      if (usClick) { const [x, y] = usClick; ctx.strokeStyle = '#3EC5B5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke(); }
    }
    function updatePanel() {
      $('tilt').textContent = `TILT ${Math.round(THREE.MathUtils.radToDeg(pr.fan))}°`;
      const okAng = nd.angle >= 30 && nd.angle <= 60;
      $('ang').innerHTML = needle.visible ? `NEEDLE <b style="color:${okAng ? '#3EC5B5' : '#ff8a8d'}">${Math.round(nd.angle)}°</b> · ${nd.L.toFixed(0)} mm` : 'NEEDLE —';
      setSyringe();
    }
    let big = false, keyE = false, wheelAcc = 0;
    const onKey = (e) => { if (e.code === 'KeyQ') { big = !big; panel.classList.toggle('big', big); } if (e.code === 'KeyE') keyE = true; };
    const onWheel = (e) => { e.preventDefault(); wheelAcc += Math.sign(e.deltaY) * Math.min(3, Math.max(1, Math.abs(e.deltaY) / 100)); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: false });
    let usClickHandler = null;
    cvs.addEventListener('pointerdown', (e) => {
      const r = cvs.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * US_W, y = (e.clientY - r.top) / r.height * US_H;
      if (usClickHandler) usClickHandler(x, y);
    });
    const takeWheel = () => { const w = wheelAcc; wheelAcc = 0; return w; };

    // sterile checklist (step 1)
    const ck = document.createElement('div'); ck.className = 'cvl-ck';
    const ITEMS = ['Hand hygiene', 'Full-body sterile drape', 'Sterile probe cover', 'Chlorhexidine skin prep'];
    ck.innerHTML = `<h4>STERILE BUNDLE</h4><div class="t" data-k="ckt">Tick in order · 12 s budget</div>` + ITEMS.map((s, i) => `<button data-i="${i}"><i>${i + 1}</i>${s}</button>`).join('');
    ck.style.display = 'none'; uiRoot.appendChild(ck);
    let ckHandler = null;
    ck.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => ckHandler && ckHandler(+b.dataset.i, b)));

    const summary = { title: 'Line in — tip at the cavo-atrial junction', sub: 'Right IJ central line placed under ultrasound with the Seldinger technique.' };
    const extra = { infection: 0, arterial: 0, lostWire: 0, pleura: 0 };
    const camAt = (x, h, back, tx) => ({ pos: [C.x + x, skinY + h, C.z + back], target: [C.x + x + tx, skinY - 0.05, C.z - 0.02] });
    const P0 = () => probe.position;

    let T = 0;
    function common() {
      updateVessels(T);
      placeProbe(pr.onSkin ? 0 : 0.03);
      renderUS();
      updatePanel();
    }

    // ---------------- steps ----------------
    const steps = [
      {
        title: 'Sterile bundle & probe placement', tool: null, plane: skinY,
        instr: 'Tick the sterile bundle in order (left). Then drag the probe onto the teal band and scroll to rotate it square (0°).',
        cam: camAt(0.1, 3.3, 2.5, 0.75),
        start(S) {
          ck.style.display = '';
          let next = 0, t0 = 0, held = false, aligned = 0, warnedT = false;
          const grab = new THREE.Vector3();
          const fx = [() => S.info('Hands scrubbed'), () => dropDrape(), () => { sleeve.visible = true; }, () => applyPrep()];
          ckHandler = (i, btn) => {
            if (i < next) return;
            if (i !== next) { extra.infection++; S.error(0.4, 'Sterile barrier first.', 'miss'); return; }
            btn.classList.add('done'); fx[i](); S.award(40, ITEMS[i]); next++;
            if (next === 4) {
              if (t0 < 12) S.comboHit('bundle', 'Full bundle', 40); else S.warn('Bundle took over 12 s');
              S.setInstr('Now drag the probe onto the teal band across the neck, then scroll to rotate it until it reads 0°.');
              setTimeout(() => { if (!disposed) ck.style.display = 'none'; }, 700);
            }
          };
          const mech = {
            hideMarker: true,
            frac: () => next / 8 + (aligned ? 0.5 : 0),
            update(ev, dt) {
              common();
              if (next < 4) {
                t0 += dt; setTag('No probe contact');
                ck.querySelector('[data-k="ckt"]').textContent = `Tick in order · ${Math.max(0, 12 - t0).toFixed(0)} s left`;
                if (t0 > 12 && !warnedT) { warnedT = true; S.warn('Keep the bundle brisk'); }
                return false;
              }
              band.material.opacity = 0.38 + 0.2 * Math.sin(performance.now() / 260);
              if (ev.pressed && Math.hypot(ev.p.x - probe.position.x, ev.p.z - probe.position.z) < 0.32) { held = true; grab.set(probe.position.x - ev.p.x, 0, probe.position.z - ev.p.z); }
              else if (ev.pressed) { S.m.missedActions++; S.setInstr('Press on the probe and drag it onto the teal band'); }
              if (held) {
                probe.position.x = ev.p.x + grab.x; probe.position.z = ev.p.z + grab.z;
                if (!ev.down) held = false;
              }
              const w = takeWheel(); if (w) pr.yaw = clamp(pr.yaw + w * THREE.MathUtils.degToRad(4), -1.6, 1.6);
              const inField = Math.abs(probe.position.x - C.x) < FW / 2 - 0.08 && Math.abs(probe.position.z - C.z) < FH / 2 - 0.2;
              pr.onSkin = inField && !held;
              const deg = THREE.MathUtils.radToDeg(pr.yaw);
              const onBand = Math.abs(probe.position.x - (C.x + PROBE_X)) < 0.07 && Math.abs(probe.position.z - C.z) < 0.1;
              setTag(pr.onSkin ? `Probe ${Math.round(deg)}° ${Math.abs(deg) <= 10 ? '· square' : '· scroll to rotate'}` : 'No probe contact');
              if (onBand && !held) S.setInstr(`On the band. Scroll to rotate the probe: ${Math.round(deg)}° → 0° (±10°)`);
              if (onBand && !held && Math.abs(deg) <= 10) {
                aligned += dt;
                if (aligned > 0.35) {
                  const err = Math.abs(probe.position.x - (C.x + PROBE_X)) / MM;
                  S.precision(err); S.award(Math.abs(deg) < 4 ? 120 : 80, Math.abs(deg) < 4 ? 'Probe square, transverse view' : 'Probe placed');
                  band.visible = false; setTag('Transverse view · right IJ');
                  return true;
                }
              } else aligned = 0;
              return false;
            },
            async bot(bot) {
              for (let i = 0; i < 4; i++) { await bot.wait(0.45); ck.querySelectorAll('button')[i].click(); }
              await bot.wait(0.9);
              await bot.moveTo(probe.position.clone().setY(skinY), 0.9);
              await bot.wait(0.15); bot.down(true); await bot.wait(0.1);
              await bot.moveTo(V(C.x + PROBE_X, skinY, C.z), 0.7);
              await bot.wait(0.15); bot.down(false);
              const y0 = pr.yaw; for (let k = 1; k <= 20; k++) { pr.yaw = y0 * (1 - k / 20); await bot.wait(0.04); }
              await bot.wait(0.6);
            },
            dispose() { ck.style.display = 'none'; ckHandler = null; },
          };
          return mech;
        },
      },
      {
        title: 'Vein or artery? Compression test', tool: null, plane: skinY,
        instr: 'Hold the mouse button to press the probe down for a second. Watch which vessel collapses, then click the VEIN on the ultrasound.',
        cam: camAt(0.1, 3.0, 2.25, 0.7),
        start(S) {
          pr.onSkin = true;
          let held = 0, compressed = false, done = false, wrong = 0;
          usClickHandler = (x, y) => {
            if (done) return;
            if (!compressed) { S.warn('Compress first: hold the mouse button on the field'); return; }
            const w = (x - US_W / 2) / PX, d = y / PX;
            probeFrame(); const z = (probe.position.z - C.z) / MM + w * U.z;
            usClick = [x, y]; setTimeout(() => { usClick = null; }, 700);
            if (qVein(z, d) < 1.4) {
              done = true; labelsOn = true;
              S.precision(Math.hypot(z - VEIN.z, d - VEIN.d) * 0.5);
              S.award(wrong ? 80 : 150, wrong ? 'Vein identified' : 'Compressible and oval: vein confirmed');
            } else if (qArt(z, d) < 1.8) { wrong++; S.error(0.5, 'That one pulses. Try compression.', 'miss'); }
            else { S.m.missedActions++; S.warn('Click inside a vessel'); }
          };
          const mech = {
            hideMarker: true,
            frac: () => (compressed ? 0.5 : held * 0.5) + (done ? 0.5 : 0),
            update(ev, dt) {
              common();
              pr.press += ((ev.down && !done ? 1 : 0) - pr.press) * Math.min(1, dt * 7);
              if (ev.down) { held += dt; if (held > 1 && !compressed) { compressed = true; S.info('Vein collapses, artery keeps pulsing'); S.setInstr('Now click the vessel that collapsed (the vein) on the ultrasound screen →'); } }
              else held = 0;
              setTag(ev.down && !done ? 'Compressing…' : done ? 'IJV identified' : compressed ? 'Click the vein' : 'Transverse view · right IJ');
              if (done) usClick = null;
              return done && pr.press < 0.05;
            },
            async bot(bot) {
              bot.down(true); await bot.wait(1.6); bot.down(false); await bot.wait(0.8);
              probeFrame();
              const w = (VEIN.z - (probe.position.z - C.z) / MM) / U.z;
              usClickHandler(US_W / 2 + w * PX, VEIN.d * PX);
              await bot.wait(0.3);
            },
            dispose() { usClickHandler = null; usClick = null; },
          };
          return mech;
        },
      },
      {
        title: 'Needle under ultrasound', tool: null, plane: skinY,
        instr: 'Move = entry point · scroll = needle angle (30–60°) · hold mouse = advance, Space = withdraw · A / D tilt the beam to keep the TIP in view.',
        cam: camAt(-0.1, 2.75, 2.05, 0.65),
        start(S) {
          needle.visible = true; entryRing.visible = true; aimLine.visible = true; setChip(0);
          let done = false, lastAngL = -1, steer = 0, startT = 0;
          const mech = {
            hideMarker: true,
            frac: () => (done ? 1 : clamp(nd.L / 20, 0, 0.9)),
            update(ev, dt) {
              startT += dt;
              const keys = ev.input.keys;
              const w = takeWheel();
              if (w) {
                nd.angle = clamp(nd.angle - w * 2.5, 15, 75);
                if (nd.L > 3 && Math.abs(nd.L - lastAngL) > 1) { lastAngL = nd.L; nd.redirects++; if (nd.redirects > 1) S.warn('Redirecting inside tissue: withdraw before changing angle'); }
              }
              const fanIn = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
              if (fanIn) pr.fan = clamp(pr.fan + fanIn * dt * 0.6, -0.5, 0.5);
              if (!nd.locked) nd.entry.set(clamp(ev.p.x, C.x - FW / 2 + 0.1, P0().x - 0.02), skinY, clamp(ev.p.z, C.z - FH / 2 + 0.1, C.z + FH / 2 - 0.1));
              const withdraw = keys.has('Space') || keys.has('KeyS') || steer < 0;
              const advance = (ev.down || steer > 0) && !withdraw;
              const rate = ev.input.steady ? 5 : 7;
              if (advance) { nd.L = Math.min(48, nd.L + rate * dt); nd.locked = true; }
              if (withdraw) { nd.L = Math.max(0, nd.L - 14 * dt); if (nd.L === 0) { nd.locked = false; nd.lostT = 0; } }
              placeNeedle(nd.L > 0 ? 0 : 0.02);
              entryRing.position.set(nd.entry.x, skinY + 0.004, nd.entry.z);
              const ap = aimLine.geometry.attributes.position;
              ap.setXYZ(0, nd.entry.x, skinY + 0.005, nd.entry.z); ap.setXYZ(1, nd.entry.x + 0.6, skinY + 0.005, nd.entry.z); ap.needsUpdate = true; aimLine.computeLineDistances();
              aimLine.visible = !nd.locked; entryRing.visible = !nd.locked;
              // true 3D anatomy at the tip
              const m = tipMm();
              const inV = m.d > 0 && qVein(m.z, m.d) < 0.78, inA = m.d > 0 && qArt(m.z, m.d) < 1;
              nd.inVein = inV;
              if (inA) {
                nd.fluid = 'artery'; flashMat.color.setHex(0xd8222c);
                if (nd.artArmed) { nd.artArmed = false; extra.arterial++; S.m.retries++; S.error(1, 'Pulsatile. That is the artery, withdraw and hold pressure.'); S.setInstr('Withdraw (Space) all the way out, then re-aim at the vein'); }
              } else if (inV) { nd.fluid = 'vein'; flashMat.color.setHex(0x4a0f18); }
              else if (nd.fluid !== 'none' && nd.L < 2) nd.fluid = 'none';
              if (nd.L < 2) nd.artArmed = true;
              if (m.d > VEIN.d + VEIN.ry + 2 && Math.abs(m.z - VEIN.z) < VEIN.rx && nd.ttArmed) { nd.ttArmed = false; S.error(0.4, 'Through and through: back out slowly into the lumen'); }
              if (m.d > 35 && nd.pleuraArmed) { nd.pleuraArmed = false; extra.pleura++; S.error(0.8, 'Too deep. Pleura is near.'); }
              if (m.d < 20) nd.pleuraArmed = true;
              const bloodK = nd.fluid === 'vein' ? 0.55 : nd.fluid === 'artery' ? 0.55 + 0.35 * ves.pulse : 0;
              nd.flash += (bloodK - nd.flash) * Math.min(1, dt * 4);
              setPlunger(0.18 + (nd.L > 0 ? 0.04 : 0), nd.fluid === 'none' ? 0 : nd.flash);
              common();
              if (nd.L > 6 && !nd.tracked) { nd.lostT += dt; if (nd.lostT > 1.8 && !done) S.setInstr('Tip not on screen: tilt the beam with A / D until the bright dot appears'); } else nd.lostT = 0;
              setTag(nd.tracked ? 'Needle TIP in view' : nd.L > 0 ? 'Tip out of plane' : 'Aim: probe centre tick = middle of the screen');
              if (inV && !done) {
                done = true;
                const latErr = Math.abs(m.z - VEIN.z);
                S.precision(latErr);
                const okAng = nd.angle >= 30 && nd.angle <= 60, good = latErr < 2.5 && okAng;
                S.award(good ? 220 : 140, good ? 'Dark flash, vein confirmed. Textbook angle.' : 'Dark flash: vein entered');
                if (nd.tracked) S.comboHit('track', 'Tip tracked', 50);
                S.setInstr(startT < 25 ? 'Flash in under 25 s. Hold the needle still.' : 'Hold the needle still.');
              }
              return done && nd.flash > 0.4;
            },
            async bot(bot) {
              const target = V(P0().x - 0.13, skinY, C.z + VEIN.z * MM);
              await bot.moveTo(target, 0.6);
              for (let k = 0; k < 20; k++) { nd.angle += (45 - nd.angle) * 0.25; await bot.wait(0.03); }
              nd.angle = 45; await bot.wait(0.3);
              steer = 1;
              while (!done) {
                const m = tipMm(); const Px = (P0().x - C.x) / MM;
                const want = m.d > 2 ? clamp(Math.atan2(m.x - Px, m.d), -0.5, 0.5) : 0;
                pr.fan += (want - pr.fan) * 0.35;
                await bot.wait(0.03);
              }
              steer = 0;
              await bot.wait(0.6);
            },
            dispose() { steer = 0; },
          };
          return mech;
        },
      },
      {
        title: 'Guidewire: Seldinger technique', tool: null, plane: skinY,
        instr: 'Syringe off. HOLD the mouse button and drag DOWN to feed the J-wire (SHIFT = gentle). Aim for 12–18 cm. Never let go of the wire.',
        cam: camAt(-0.1, 2.75, 2.05, 0.65),
        start(S) {
          setChip(1); syr.visible = false; hoop.visible = true; wire.visible = true; nd.fluid = 'none';
          let lastZ = null, needleOut = false, done = false, ectopy = false, fastArmed = true, wOut = 0, everLost = false;
          const L0 = nd.L;
          const mech = {
            hideMarker: true,
            frac: () => clamp(wireIn / 15, 0, 1) * 0.8 + (needleOut ? 0.2 : 0),
            update(ev, dt) {
              pr.fan += (0 - pr.fan) * Math.min(1, dt * 3);
              if (ev.down) {
                if (lastZ !== null) {
                  const dcm = (ev.p.z - lastZ) * 24;
                  wireIn = clamp(wireIn + dcm, 0, 25);
                  const sp = Math.abs(dcm) / Math.max(dt, 1e-3);
                  if (sp > 14 && !ev.input.steady && fastArmed && dcm > 0) { fastArmed = false; S.error(0.3, 'Feed the wire gently: hold SHIFT'); }
                  if (sp < 6) fastArmed = true;
                }
                lastZ = ev.p.z;
              } else {
                if (lastZ !== null && wireIn > 0.5 && !done) {
                  extra.lostWire++; everLost = true; S.m.retries++; S.error(1, 'Lost the wire! Always keep a hand on it.');
                  wireIn = 0; if (needleOut) { needleOut = false; wOut = 0; S.setInstr('Wire reset: re-access, hold and feed again.'); }
                }
                lastZ = null;
              }
              if (wireIn > 20 && !ectopy) { ectopy = true; S.error(0.8, 'Wire too deep, ectopy on the monitor. Pull back.'); if (monitor) monitor.setAlarm(true); }
              if (wireIn < 19 && ectopy) { ectopy = false; if (monitor) monitor.setAlarm(false); }
              wireVisibleUS = wireIn > 2;
              if ((keyE || ev.input.keys.has('KeyE')) && !needleOut) {
                if (wireIn >= 10) { needleOut = true; S.info('Needle out over the wire'); }
                else S.warn('Feed at least 10 cm before removing the needle');
              }
              keyE = false;
              if (needleOut) wOut = Math.min(1, wOut + dt * 1.6);
              nd.L = L0 * (1 - wOut);
              needle.visible = wOut < 1;
              placeNeedle(); if (needleOut) needle.position.addScaledVector(dir, -wOut * 0.3);
              const out = clamp((25 - wireIn) * 0.045, 0.08, 1.2);
              const d2 = needleDir().clone().negate();
              const a = needleOut ? nd.entry.clone() : tipW.clone().addScaledVector(d2, NL + 0.09);
              const b = a.clone().addScaledVector(d2, out);
              wire.position.copy(a).lerp(b, 0.5); wire.scale.y = out; wire.quaternion.setFromUnitVectors(V(0, 1, 0), d2);
              setGauge({ label: 'Wire', value: wireIn, max: 25, band: [12, 18], danger: 20, text: `${wireIn.toFixed(1)} cm` });
              common();
              setTag(wireIn > 2 ? 'Wire in the vein (bright echo)' : 'Feed the wire');
              if (wireIn >= 10 && !needleOut) S.setInstr('Keep holding the wire and press E to slide the needle out over it');
              if (needleOut && wOut >= 1 && wireIn >= 12 && wireIn <= 18 && ev.down && !done) {
                done = true; setChip(2);
                S.precision(Math.abs(wireIn - 15) * 0.6);
                S.award(everLost ? 100 : 200, everLost ? 'Wire placed' : 'Wire stayed in your hand the whole time.');
              }
              if (needleOut && wOut >= 1 && !done) S.setInstr(wireIn > 18 ? 'Pull the wire back to 12–18 cm (drag up)' : 'Feed to 12–18 cm (drag down)');
              return done;
            },
            async bot(bot) {
              engine.input.keys.add('ShiftLeft');
              const p0 = bot.pos.clone();
              bot.down(true); await bot.wait(0.2);
              await bot.moveTo(p0.clone().add(V(0, 0, 0.47)), 0.13);
              await bot.wait(0.3); keyE = true; await bot.wait(0.9);
              await bot.moveTo(p0.clone().add(V(0, 0, 0.635)), 0.12);
              await bot.wait(0.5);
              engine.input.keys.delete('ShiftLeft');
            },
            dispose() { engine.input.keys.delete('ShiftLeft'); },
          };
          return mech;
        },
      },
      {
        title: 'Dilate, thread catheter, confirm', tool: null, plane: skinY,
        instr: 'Dilator over the wire: hold and drag DOWN into the teal band (skin and tract only), then release.',
        cam: camAt(-0.1, 2.75, 2.05, 0.65),
        start(S) {
          setChip(2); dil.visible = true; wire.visible = true; needle.visible = false;
          let phase = 0, D = 0, lastZ = null, lacArmed = true, done = false, lockT = 0, ectArmed = true;
          const btn = $('btn');
          const flushNow = () => {
            if (phase !== 3) return;
            phase = 4; nd.fluid = 'vein'; nd.flash = 0.6;
            S.info('Dark venous return on all lumens');
            setTimeout(() => { if (disposed) return; nd.fluid = 'flush'; $('brow').style.display = 'none';
              S.award(150, 'Line flushed and secured'); done = true; }, 900);
          };
          btn.onclick = flushNow;
          const dragZ = (ev) => { let d = 0; if (ev.down) { if (lastZ !== null) d = ev.p.z - lastZ; lastZ = ev.p.z; } else lastZ = null; return d; };
          const mech = {
            hideMarker: true,
            frac: () => (done ? 1 : phase / 4),
            update(ev, dt) {
              const d2 = needleDir().clone().negate();
              const E = nd.entry;
              if (phase === 0) { // dilator
                D = clamp(D + dragZ(ev) * 100, 0, 40);
                dil.position.copy(E).addScaledVector(dir, D * MM); dil.lookAt(dil.position.clone().add(d2));
                setGauge({ label: 'Dilator', value: D, max: 40, band: [15, 25], danger: 30, text: `${D.toFixed(0)} mm` });
                if (D > 30 && lacArmed) { lacArmed = false; S.error(1, 'Too deep with the dilator: vein wall injury. Back off.'); }
                if (ev.released) {
                  if (D >= 15 && D <= 25) {
                    phase = 1; dil.visible = false; setChip(3);
                    S.precision(Math.abs(D - 20) * 0.3); S.award(lacArmed ? 120 : 60, 'Tract dilated');
                    S.setInstr('Catheter over the wire: SCROLL to feed it to 14–17 cm, then click to lock it.');
                  } else if (D < 15) S.setInstr('Not through the tract yet: drag a little further, release in the band');
                  else S.setInstr('Back the dilator out into the band (drag up), then release');
                }
              } else if (phase === 1) { // catheter by scroll
                const w = takeWheel(); if (w) cathIn = clamp(cathIn - w * 0.5, 0, 22);
                cath.visible = true; cathVisibleUS = cathIn > 3;
                cath.position.copy(E).addScaledVector(dir, cathIn * 0.1); cath.lookAt(cath.position.clone().add(d2));
                setGauge({ label: 'Catheter', value: cathIn, max: 22, band: [14, 17], danger: 20, text: `${cathIn.toFixed(1)} cm` });
                if (cathIn > 20 && ectArmed) { ectArmed = false; S.error(0.8, 'Catheter too long: ectopy. Pull back.'); }
                if (cathIn < 18) ectArmed = true;
                if (ev.pressed) {
                  if (cathIn >= 14 && cathIn <= 17) {
                    phase = 2; lockT = 0; S.precision(Math.abs(cathIn - 15.5));
                    S.award(Math.abs(cathIn - 15.5) < 0.8 ? 180 : 120, 'Catheter at 15–16 cm: cavo-atrial junction');
                    S.setInstr('Remove the wire: hold and drag UP until it is out.');
                  } else S.warn(cathIn < 14 ? 'Too short: feed to 14–17 cm' : 'Too long: pull back to 14–17 cm');
                }
              } else if (phase === 2) { // wire out
                lockT += dt;
                if (lockT > 0.25) wireIn = clamp(wireIn + dragZ(ev) * 24, 0, 25);
                setGauge({ label: 'Wire out', value: wireIn, max: 25, band: [0, 0.6], text: `${wireIn.toFixed(1)} cm` });
                if (wireIn <= 0.05) {
                  phase = 3; wire.visible = false; hoop.visible = false; wireVisibleUS = false; setGauge(null);
                  S.award(80, 'Wire out, accounted for'); $('brow').style.display = ''; $('bnote').textContent = 'confirm venous return';
                  S.setInstr('Click "Aspirate & flush" under the ultrasound to confirm dark venous return.');
                }
              }
              if (wire.visible) { // wire runs out of the skin (through the catheter hub once it is in)
                const out = clamp((25 - wireIn) * 0.045, 0.08, 1.2) + (phase >= 1 && cath.visible ? 2.35 - cathIn * 0.1 : 0);
                const a = E.clone(), b = a.clone().addScaledVector(d2, out);
                wire.position.copy(a).lerp(b, 0.5); wire.scale.y = out; wire.quaternion.setFromUnitVectors(V(0, 1, 0), d2);
              }
              common();
              setTag(['Dilator over the wire', 'Catheter in the vein (ring echo)', 'Withdrawing the wire', 'Confirm placement', 'Flushing'][phase]);
              if (done) {
                const parts = [];
                if (extra.arterial) parts.push(`${extra.arterial} arterial puncture${extra.arterial > 1 ? 's' : ''}`);
                if (extra.lostWire) parts.push('wire lost once');
                if (extra.infection) parts.push(`infection risk +${extra.infection} (bundle order)`);
                summary.sub = parts.length ? 'Line placed. Debrief: ' + parts.join(', ') + '.' : 'Clean bundle, no arterial puncture, wire controlled throughout.';
                setChip(4);
              }
              return done;
            },
            async bot(bot) {
              const p0 = bot.pos.clone();
              bot.down(true); await bot.wait(0.15);
              await bot.moveTo(p0.clone().add(V(0, 0, 0.2)), 0.12); await bot.wait(0.2); bot.down(false);
              await bot.wait(0.6);
              while (cathIn < 15.5) { wheelAcc -= 1; await bot.wait(0.07); }
              await bot.wait(0.4); bot.down(true); await bot.wait(0.12); bot.down(false); await bot.wait(0.5);
              const p1 = bot.pos.clone(); bot.down(true); await bot.wait(0.35);
              await bot.moveTo(p1.clone().add(V(0, 0, -(wireIn / 24) - 0.05)), 0.25); await bot.wait(0.2); bot.down(false);
              await bot.wait(0.6); flushNow(); await bot.wait(1.4);
            },
            dispose() { btn.onclick = null; },
          };
          return mech;
        },
      },
    ];

    const controller = createSurgery({
      id: ID, engine, art, group, steps, monitor, parTime: 95,
      wideCam: { pos: [C.x + 0.3, skinY + 4.6, C.z + 3.6], target: [C.x + 0.95, skinY, C.z] },
      summary,
    });
    const baseUpdate = controller.update;
    controller.update = (dt, input) => {
      T += dt;
      baseUpdate(dt, input);
      if (controller.stepIndex < 0 && !disposed) common();
    };
    const baseDispose = controller.dispose;
    controller.dispose = () => {
      disposed = true;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
      panel.remove(); ck.remove(); css.remove();
      baseDispose();
    };
    return controller;
  },
};
