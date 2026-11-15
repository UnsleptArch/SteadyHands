// SURGERY — Laceration repair on a forearm: clean -> numb (local anaesthetic) -> 3 interrupted sutures -> dressing. No gore.
import * as THREE from 'three';
import { createSurgery, wipe, holdTargets, sutureBites, dragDrop, MM } from './steps.js';

const ID = 'laceration';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...o });
function call(art, name, ...a) {
  try { return typeof art[name] === 'function' ? art[name](...a) : null; } catch (e) { console.warn('[surgery] art.' + name, e); return null; }
}

export default {
  id: ID,
  title: 'Laceration Repair',
  MM,
  brief: 'Repair a forearm cut in four steps: clean the skin, numb it with local anaesthetic, close it with three stitches, then dress it. ' +
    'Gentle, accurate work keeps the patient calm and builds combos. Hold SHIFT to steady your hand.',

  setup(engine, art) {
    const group = new THREE.Group(); group.name = 'surgery-laceration'; engine.scene.add(group);

    // ---------------- forearm ----------------
    let arm = call(art, 'makeForearm');
    if (arm && !arm.isObject3D) arm = arm.mesh;
    let skinY, w0, w1, pairs, setClosed = () => {};
    if (arm) {
      arm.position.set(0, 0.02, 0); group.add(arm); arm.updateMatrixWorld(true);
      const ud = arm.userData;
      skinY = ud.skinY + 0.02;
      w0 = arm.localToWorld(ud.wound.start.clone()); w1 = arm.localToWorld(ud.wound.end.clone());
      pairs = ud.suturePairs.map((p) => ({ entry: arm.localToWorld(p.entry.clone()), exit: arm.localToWorld(p.exit.clone()) }));
      if (ud.setClosed) setClosed = ud.setClosed;
    } else {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 5, 8), flat(0xcfc4b3)); a.rotation.z = Math.PI / 2; a.scale.set(1, 1, 0.9); a.position.y = 0.8; group.add(a);
      skinY = 1.6; w0 = V(-0.8, skinY, -0.05); w1 = V(0.8, skinY, 0.1);
      const wound = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.12), new THREE.MeshBasicMaterial({ color: 0x7a2e34 })); wound.rotation.x = -Math.PI / 2; wound.position.set(0, skinY + 0.01, 0.02); group.add(wound);
      setClosed = (t) => { wound.scale.y = Math.max(0.05, 1 - t); };
      pairs = [0.2, 0.5, 0.8].map((t) => { const c = w0.clone().lerp(w1, t); return { entry: c.clone().add(V(0, 0, -0.22)), exit: c.clone().add(V(0, 0, 0.22)) }; });
    }
    for (const p of pairs) { p.entry.y = skinY; p.exit.y = skinY; }
    const W = w0.clone().lerp(w1, 0.5).setY(skinY);
    const dir = w1.clone().sub(w0).setY(0).normalize();
    const nrm = V(-dir.z, 0, dir.x);

    let monitor = call(art, 'makeVitalsMonitor');
    if (monitor && monitor.mesh) { monitor.mesh.position.set(W.x - 2.6, skinY - 2.4, W.z - 2.0); monitor.mesh.rotation.y = 0.5; group.add(monitor.mesh); }
    else monitor = null;

    // instrument tray (Mayo stand) at skin height beside the arm: gauze + dressing live here
    const trayZ = W.z + 1.75;
    const tray = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.04, 1.1), new THREE.MeshStandardMaterial({ color: 0xbfc7ce, metalness: 0.8, roughness: 0.35 }));
    tray.position.set(W.x + 0.2, skinY - 0.06, trayZ); group.add(tray);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, skinY, 8), tray.material); pole.position.set(W.x + 0.2, skinY / 2 - 0.06, trayZ + 0.3); group.add(pole);
    const gauze = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.3), flat(0xf4f6f8)); gauze.position.set(W.x - 0.6, skinY - 0.02, trayZ); group.add(gauze);
    const dressing = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.02, 0.7), flat(0xf7f3ea)); dressing.add(pad);
    const core = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.03, 0.36), flat(0xffffff)); core.position.y = 0.012; dressing.add(core);
    dressing.position.set(W.x + 0.55, skinY - 0.02, trayZ); dressing.rotation.y = -Math.atan2(dir.z, dir.x); group.add(dressing);

    const closeCam = (h = 3.0, back = 2.5) => ({ pos: [W.x + 0.2, skinY + h, W.z + back], target: [W.x, skinY - 0.1, W.z + 0.15] });

    const steps = [
      {
        title: 'Clean the wound', tool: null, plane: skinY,
        instr: 'Hold the mouse and rub the gauze over the debris until the skin is clean.',
        cam: closeCam(2.1, 1.5),
        start(S) {
          const specks = [];
          let s = 7;
          const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
          for (let i = 0; i < 22; i++) {
            const a = (rnd() - 0.5) * 1.9, b = (rnd() - 0.5) * 0.75;
            if (Math.abs(b) < 0.07) continue;
            specks.push(W.clone().addScaledVector(dir, a).addScaledVector(nrm, b));
          }
          gauze.userData.home = gauze.position.clone();
          const m = wipe(S, { specks, y: skinY, radius: 0.13, gauze });
          const inner = m.update;
          m.update = (ev, dt) => { const d = inner(ev, dt); if (d) { gauze.visible = false; } return d; };
          return m;
        },
      },
      {
        title: 'Numb the area', tool: 'syringe', plane: skinY,
        instr: 'Local anaesthetic: press and HOLD inside each pulsing teal ring until it fills. Keep the needle still.',
        cam: closeCam(1.9, 1.35),
        start(S) {
          const targets = [
            w0.clone().addScaledVector(dir, -0.18), w1.clone().addScaledVector(dir, 0.18),
            W.clone().addScaledVector(nrm, -0.36), W.clone().addScaledVector(nrm, 0.36),
          ].map((p) => p.setY(skinY));
          return holdTargets(S, { targets, y: skinY, radius: 0.07, holdT: 0.9, label: 'Anaesthetic in' });
        },
      },
      {
        title: 'Close with 3 interrupted sutures', tool: 'driver', plane: skinY,
        instr: 'For each stitch: press on the teal dot, drag across the wound, release on the purple dot.',
        cam: closeCam(1.9, 1.35),
        start(S) {
          S.info('Area numb — patient comfortable');
          return sutureBites(S, { pairs, y: skinY + 0.006, radius: 0.08, onStitch(i) { setClosed((i + 1) / pairs.length); } });
        },
      },
      {
        title: 'Apply the dressing', tool: null, plane: skinY,
        instr: 'Drag the dressing from the tray and drop it centred on the closed wound.',
        cam: { pos: [W.x + 0.2, skinY + 2.9, W.z + 2.9], target: [W.x, skinY - 0.1, W.z + 0.8] },
        start(S) { return dragDrop(S, { obj: dressing, target: W.clone(), y: skinY + 0.01, radius: 0.14, label: 'Wound dressed' }); },
      },
    ];

    const controller = createSurgery({
      id: ID, engine, art, group, steps, monitor, parTime: 55,
      wideCam: { pos: [W.x + 0.9, skinY + 3.2, W.z + 3.4], target: [W.x - 0.7, skinY, W.z - 0.4] },
      summary: { title: 'Patient stable — home today', sub: 'Wound cleaned, anaesthetised, closed with 3 sutures and dressed. Stitches out in 10 days.' },
    });
    return controller;
  },
};
