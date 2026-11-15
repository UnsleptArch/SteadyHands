// SURGERY — Appendectomy (stylized, open approach with a laparoscopic grasper for delivery). Low-poly dummy, no gore.
// Steps: incise RLQ along guide -> retract -> locate & grasp the appendix (fulcrum control, avoid the artery)
//        -> ligate artery + clip base (ordered) -> cut & remove -> close with 3 sutures.
import * as THREE from 'three';
import { createSurgery, traceGuide, dragHandles, clickTargets, sutureBites, MM, botClick } from './steps.js';
import { makeRing } from '../levels/_common.js';

// ANATOMY's full abdominal set (optional): packed neighbouring organs behind the interactive appendix
const anatomy = await import('../art/anatomy.js').catch((e) => { console.warn('[surgery] anatomy set unavailable', e.message); return null; });

const ID = 'appendectomy';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 });

function call(art, name, ...a) {
  try { return typeof art[name] === 'function' ? art[name](...a) : null; } catch (e) { console.warn('[surgery] art.' + name, e); return null; }
}

export default {
  id: ID,
  title: 'Appendectomy',
  MM,
  brief: 'Remove an inflamed appendix in six steps: incise, retract, find and grasp the appendix, ligate and clip, cut, then close. ' +
    'Steady, accurate work earns points and combos; slips raise the patient\'s heart rate. Hold SHIFT to steady your hand.',

  setup(engine, art) {
    const { scene } = engine;
    const group = new THREE.Group(); group.name = 'surgery-appendectomy'; scene.add(group);

    // ---------------- patient, drape, monitor ----------------
    let dummy = call(art, 'makeDummy');
    if (dummy && !dummy.isObject3D) dummy = dummy.mesh;
    let abdomen, skinY;
    if (dummy) {
      dummy.position.y = 0.03; group.add(dummy);
      abdomen = dummy.userData.abdomen.clone().add(V(0, 0.03, 0)); skinY = dummy.userData.skinY + 0.03;
    } else {
      const torso = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 3), flat(0xcfc4b3)); torso.position.set(-1, 0.83, 0); group.add(torso);
      abdomen = V(-0.5, 1.83, 0); skinY = 1.83;
    }
    const WIN_W = 2.8, WIN_H = 2.2;
    const dr = call(art, 'makeDrapeWithWindow', 6, 5, WIN_W, WIN_H);
    let prepY, cavityY;
    let artPrep = null;
    if (dr && dr.mesh) {
      dr.mesh.position.copy(abdomen); group.add(dr.mesh);
      artPrep = dr.prep || dr.mesh.userData.prep;
      cavityY = abdomen.y + (dr.cavityY ?? -0.06);
      prepY = artPrep ? abdomen.y + artPrep.position.y : abdomen.y + 0.11;
    } else {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), flat(0x3e6e8e)); d.rotation.x = -Math.PI / 2; d.position.copy(abdomen).add(V(0, 0.1, 0)); group.add(d);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W, WIN_H), flat(0xb87a70)); floor.rotation.x = -Math.PI / 2; floor.position.copy(abdomen).add(V(0, 0.105, 0)); group.add(floor);
      cavityY = abdomen.y + 0.105; prepY = abdomen.y + 0.12;
    }
    if (artPrep) artPrep.visible = false; // replaced by two halves that part on retraction
    const C = V(abdomen.x, prepY, abdomen.z); // window centre at skin level

    const prepMat = call(art, 'prepSkinMaterial', WIN_W + 0.08, WIN_H + 0.08) || (artPrep && artPrep.material) || new THREE.MeshStandardMaterial({ color: 0xd9b88a, flatShading: true, roughness: 0.8 });
    const fatMat = new THREE.MeshStandardMaterial({ color: 0xe9c983, roughness: 0.55 });
    const dermisMat = new THREE.MeshStandardMaterial({ color: 0xd99c86, roughness: 0.6 });
    const fasciaMat = new THREE.MeshStandardMaterial({ color: 0xe8d6cc, roughness: 0.45 });

    // organs (centred in the window, under the skin)
    let apCurve = null; // world-space appendix centreline
    let arteryPts = null;
    let apMeshes = [];
    // preferred: ANATOMY abdomen set centred on the RLQ (cecum + appendix in the window, liver/bowel/colon around)
    let aset = null;
    try {
      if (anatomy && anatomy.makeAbdomenSet && dr && dr.mesh) {
        aset = anatomy.makeAbdomenSet({ center: 'rlq', highlight: null, omentum: false });
        aset.group.position.copy(dr.mesh.position); group.add(aset.group); aset.group.updateMatrixWorld(true);
        const c = aset.parts.appendixCurve;
        if (!c) throw new Error('no appendixCurve');
        apCurve = new THREE.CatmullRomCurve3(c.getPoints(40).map((q) => aset.group.localToWorld(q.clone())));
        if (aset.parts.appendix) apMeshes = [aset.parts.appendix];
        // appendicular artery along the mesoappendix free edge: offset from the appendix toward the mesoappendix
        let dir = V(0, 0, 1);
        if (aset.parts.mesoappendix) {
          const mc = new THREE.Box3().setFromObject(aset.parts.mesoappendix).getCenter(V(0, 0, 0));
          const mid = apCurve.getPoint(0.5); dir = V(mc.x - mid.x, 0, mc.z - mid.z);
          if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
          dir.normalize();
        }
        arteryPts = [];
        for (let i = 0; i <= 20; i++) { const t = i / 20, q = apCurve.getPoint(t); arteryPts.push(q.clone().addScaledVector(dir, 0.1 * (1 - 0.35 * t)).setY(q.y + 0.005)); }
        const vessel = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arteryPts), 48, 0.011, 8), new THREE.MeshStandardMaterial({ color: 0xa8282c, roughness: 0.35 }));
        aset.group.attach(vessel);
        if (dr.cavity && dr.cavity.children[0]) dr.cavity.children[0].visible = false; // the set brings its own posterior wall
      }
    } catch (e) { console.warn('[surgery] abdomen set failed, using single organ', e); if (aset) aset.group.removeFromParent(); aset = null; apCurve = null; arteryPts = null; apMeshes = []; }
    let organ = aset ? null : call(art, 'makeOrgan', 'appendix');
    if (organ && !organ.isObject3D) organ = organ.mesh;
    if (aset) organ = aset.group; // reveal/hide logic below treats the set as "the organ"
    const ORG_Y = cavityY + 0.02;
    if (organ && !aset) {
      group.add(organ);
      organ.position.set(C.x, ORG_Y, C.z);
      organ.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(organ);
      const sx = b.max.x - b.min.x, sz = b.max.z - b.min.z;
      // whole specimen ~55% of the window (cecum ≈ a quarter of the field), lying BELOW the skin inside the cavity
      const k = Math.min((WIN_W * 0.55) / sx, (WIN_H * 0.6) / sz);
      organ.scale.multiplyScalar(k); organ.updateMatrixWorld(true);
      const b2 = new THREE.Box3().setFromObject(organ);
      organ.position.x += C.x - (b2.min.x + b2.max.x) / 2;
      organ.position.z += C.z - (b2.min.z + b2.max.z) / 2;
      organ.scale.y *= 0.5; // flatter so bowel + appendix fit the shallow cavity (camera is overhead)
      organ.updateMatrixWorld(true);
      if (organ.userData.curve) { // rest the appendix on the cavity floor
        let lo = Infinity; for (const q of organ.userData.curve.getPoints(20)) lo = Math.min(lo, organ.localToWorld(q.clone()).y);
        organ.position.y += cavityY + 0.012 + 0.09 * organ.scale.y - lo;
      } else organ.position.y += cavityY + 0.02 - new THREE.Box3().setFromObject(organ).min.y;
      organ.updateMatrixWorld(true);
      const ud = organ.userData;
      if (ud.curve) {
        const pts = ud.curve.getPoints(40).map((p) => organ.localToWorld(p.clone()));
        apCurve = new THREE.CatmullRomCurve3(pts);
        organ.traverse((o) => {
          if (!o.isMesh) return;
          const gp = o.geometry && o.geometry.parameters;
          if (gp && gp.path === ud.curve) apMeshes.push(o);
          else if (o.geometry && o.geometry.type === 'SphereGeometry' && o.position.distanceTo(ud.curve.getPoint(1)) < 1e-3) apMeshes.push(o);
        });
        // appendicular artery runs along the mesoappendix free edge (ART formula); fall back to an offset of the centreline
        const edge = [];
        for (let i = 0; i <= 20; i++) { const t = i / 20, c = ud.curve.getPoint(t); edge.push(organ.localToWorld(V(c.x + 0.04 * t, 0.035, c.z + 0.38 * (1 - 0.75 * t) * 0.97))); }
        arteryPts = edge;
      }
    }
    if (!apCurve) { // fallback toy anatomy
      const pts = [V(-0.45, 0, 0.05), V(-0.1, 0, -0.1), V(0.25, 0, 0.0), V(0.55, 0, -0.15)].map((p) => p.add(V(C.x, ORG_Y + 0.12, C.z)));
      apCurve = new THREE.CatmullRomCurve3(pts);
      const ap = new THREE.Mesh(new THREE.TubeGeometry(apCurve, 40, 0.07, 10), flat(0xee9a90)); group.add(ap); apMeshes = [ap];
      const cec = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), flat(0xdcb18f)); cec.position.copy(pts[0]).add(V(-0.3, 0, 0.1)); group.add(cec);
      arteryPts = apCurve.getPoints(20).map((p, i) => p.clone().add(V(0, -0.03, 0.28 * (1 - 0.7 * i / 20))));
      const art2 = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arteryPts), 40, 0.015, 6), flat(0xb02e32)); group.add(art2);
    }
    const AP_R = aset ? 0.035 : organ && organ.userData.curve ? 0.09 * organ.scale.y : 0.07;
    const apTop = (t) => apCurve.getPoint(t).clone().add(V(0, AP_R, 0));
    const AP_Y = apCurve.getPoints(10).reduce((a, p) => a + p.y, 0) / 11 + AP_R; // work plane for steps on the appendix
    const arteryDist = (p) => { let best = Infinity; for (const q of arteryPts) best = Math.min(best, Math.hypot(p.x - q.x, p.z - q.z, (p.y - q.y) * 0.5)); return best; };
    // highlight ring that marks the appendix once found
    const findRing = makeRing(0.1, 0.125, 0x3ec5b5, 0, 0); findRing.material.depthTest = false; findRing.renderOrder = 9; group.add(findRing);

    // ---------------- skin with an oblique (McBurney-style) incision over the appendix ----------------
    // The rest of the window stays intact prepped skin; retraction gapes the slit into an elliptical opening with
    // dermis -> fat -> fascia walls, through which the packed abdominal anatomy is seen.
    const apA = apCurve.getPoint(0.05), apB = apCurve.getPoint(0.95);
    const E = apCurve.getPoint(0.45).setY(prepY);
    E.x = Math.max(C.x - WIN_W / 2 + 0.6, Math.min(C.x + WIN_W / 2 - 0.6, E.x));
    E.z = Math.max(C.z - WIN_H / 2 + 0.5, Math.min(C.z + WIN_H / 2 - 0.5, E.z));
    const U = V(apB.x - apA.x, 0, apB.z - apA.z); if (U.lengthSq() < 1e-6) U.set(1, 0, 0); U.normalize();
    const Vp = V(-U.z, 0, U.x);
    const THETA = Math.atan2(-U.z, U.x); // rotation.y mapping local +x -> U, local +z -> Vp
    const HALF_L = Math.max(0.35, apA.distanceTo(apB) / 2 + 0.08), B_MAX = 0.2;
    const sx0 = C.x - WIN_W / 2 - 0.04, sx1 = C.x + WIN_W / 2 + 0.04, sz0 = C.z - WIN_H / 2 - 0.04, sz1 = C.z + WIN_H / 2 + 0.04;
    const skin = new THREE.Mesh(new THREE.BufferGeometry(), prepMat); skin.receiveShadow = true; skin.position.y = prepY; group.add(skin);
    const walls = new THREE.Group(); walls.position.copy(E); walls.rotation.y = THETA; group.add(walls);
    for (const [mat, top, h] of [[dermisMat, 0, 0.022], [fatMat, -0.022, 0.07], [fasciaMat, -0.092, 0.03]]) {
      const g = new THREE.CylinderGeometry(1, 1, h, 56, 1, true); g.scale(-1, 1, 1); g.computeVertexNormals(); // inward-facing
      const m = new THREE.Mesh(g, mat); m.position.y = top - h / 2; walls.add(m);
    }
    let holeA = HALF_L, holeB = 0, builtB = -1, openAmt = 0;
    function buildSkin() {
      const shape = new THREE.Shape();
      shape.moveTo(sx0, -sz0); shape.lineTo(sx1, -sz0); shape.lineTo(sx1, -sz1); shape.lineTo(sx0, -sz1); shape.closePath();
      if (holeB > 0.004) {
        const hole = new THREE.Path();
        for (let k = 0; k <= 56; k++) {
          const ang = (k / 56) * Math.PI * 2, px = E.x + U.x * holeA * Math.cos(ang) + Vp.x * holeB * Math.sin(ang), pz = E.z + U.z * holeA * Math.cos(ang) + Vp.z * holeB * Math.sin(ang);
          if (k === 0) hole.moveTo(px, -pz); else hole.lineTo(px, -pz);
        }
        shape.holes.push(hole);
      }
      const g = new THREE.ShapeGeometry(shape, 1); g.rotateX(-Math.PI / 2);
      const pos = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - sx0) / (sx1 - sx0), 1 - (pos.getZ(i) - sz0) / (sz1 - sz0));
      skin.geometry.dispose(); skin.geometry = g; builtB = holeB;
      walls.visible = holeB > 0.004; walls.scale.set(holeA, 1, Math.max(0.004, holeB));
    }
    const setOpen = (t) => {
      openAmt = t; holeB = t <= 0 ? 0 : 0.012 + (B_MAX - 0.012) * Math.min(1, t); holeA = HALF_L * (0.96 + 0.04 * Math.min(1, t));
      if (Math.abs(holeB - builtB) > 0.003 || (holeB === 0) !== (builtB === 0)) buildSkin();
    };
    buildSkin();

    let monitor = call(art, 'makeVitalsMonitor');
    if (monitor && monitor.mesh) { monitor.mesh.position.set(C.x - 2.5, prepY - 2.3, C.z - 2.2); monitor.mesh.rotation.y = 0.5; group.add(monitor.mesh); }
    else monitor = null;

    // ---------------- retractor props ----------------
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xd7dade, metalness: 1, roughness: 0.28, side: THREE.DoubleSide });
    // Army-Navy style blade: J-profile thin steel (lip down into the wound, hooked over the edge, shank out to a finger hole)
    function bladeGeometry() {
      const P = [[0.03, -0.135], [-0.008, -0.118], [-0.012, -0.06], [-0.012, 0]];
      for (let k = 1; k <= 6; k++) { const a = Math.PI - (k / 6) * Math.PI / 2; P.push([0.01 + 0.022 * Math.cos(a), 0.022 * Math.sin(a)]); }
      P.push([0.12, 0.028], [0.26, 0.045], [0.4, 0.065]);
      const T = 0.006, L = [], R = [];
      for (let i = 0; i < P.length; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
        let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
        L.push(new THREE.Vector2(P[i][0] - ty * T, P[i][1] + tx * T)); R.push(new THREE.Vector2(P[i][0] + ty * T, P[i][1] - tx * T));
      }
      const g = new THREE.ExtrudeGeometry(new THREE.Shape([...L, ...R.reverse()]), { depth: 0.16, bevelEnabled: false, curveSegments: 4 });
      g.rotateY(-Math.PI / 2); g.translate(0.08, 0, 0); g.computeVertexNormals();
      return g;
    }
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xd7dade, metalness: 1, roughness: 0.28 });
    const bladeGeo = bladeGeometry();
    const retractors = [-1, 1].map((s) => {
      const r = new THREE.Group();
      r.add(new THREE.Mesh(bladeGeo, steelMat));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 8, 20), steelMat);
      ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.068, 0.44); r.add(ring);
      r.rotation.y = THETA + (s > 0 ? 0 : Math.PI);
      r.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      r.visible = false; group.add(r); r.userData.s = s;
      return r;
    });

    const incPts = [];
    for (let i = 0; i <= 30; i++) { const u = -1 + (2 * i) / 30; incPts.push(E.clone().addScaledVector(U, u * HALF_L * 0.92).addScaledVector(Vp, 0.012 * (1 - u * u))); }
    let incMech = null;

    // framing keeps the action in the upper ~70% of the screen (HUD hint + focus meter sit at the bottom)
    const closeCam = (dx = 0, dz = 0, h = 3.0, back = 2.4) => ({ pos: [C.x + dx + 0.15, prepY + h, C.z + dz + back + 0.25 * h / 2], target: [C.x + dx, prepY - 0.05, C.z + dz + 0.25 * h / 2] });
    const tipFocus = apTop(0.6);

    // ---------------- steps ----------------
    const steps = [
      {
        title: 'Mark & incise the right lower quadrant', tool: 'scalpel', plane: prepY,
        instr: 'Press on the green dot and draw the blade along the purple marker line. Hold SHIFT to steady.',
        cam: closeCam(E.x - C.x, E.z - C.z, 1.7, 1.05),
        start(S) { incMech = traceGuide(S, { pts: incPts, y: prepY + 0.006, tolMm: 4 }); incMech.keep = true; return incMech; },
      },
      {
        title: 'Retract the wound edges', tool: null, plane: prepY,
        instr: 'Grab each white handle ring and pull the retractor out to its teal target.',
        cam: closeCam(E.x - C.x, E.z - C.z - 0.05, 1.9, 1.1),
        start(S) {
          const y = prepY;
          retractors.forEach((r) => { r.visible = true; });
          const handles = retractors.map((r) => {
            const s = r.userData.s;
            return { obj: r, from: E.clone().setY(y).addScaledVector(Vp, s * 0.03), to: E.clone().setY(y).addScaledVector(Vp, s * B_MAX) };
          });
          return dragHandles(S, {
            handles, y,
            onChange(ts) {
              const t = Math.min(1, (ts[0] + ts[1]) / 2);
              setOpen(t);
              if (organ && t > 0.12) organ.visible = true; // organs lie below the skin; revealed as the edges part
              if (incMech && t > 0.1) incMech.group.visible = false;
            },
          });
        },
      },
      {
        title: 'Locate & grasp the appendix', tool: 'grasper', plane: AP_Y,
        instr: 'Laparoscopic grasper: controls are MIRRORED (fulcrum effect). Find the appendix tip, then hold to grasp. Avoid the artery.',
        cam: closeCam(tipFocus.x - C.x, tipFocus.z - C.z + 0.05, 1.8, 1.15),
        start(S) {
          if (organ) organ.visible = true;
          const y = AP_Y;
          const target = apTop(0.97);
          const pivot = V(C.x + 2.6, prepY + 1.3, C.z - 0.6); // port: shaft leaves the frame to the right, handle off-screen
          const centre = V(tipFocus.x, y, tipFocus.z);
          const GAIN = 0.9;
          const tip = new THREE.Vector3();
          const handRing = makeRing(0.035, 0.05, 0xffffff, y, 0.5); handRing.material.depthTest = false; group.add(handRing);
          let found = false, holdT = 0, near = false, touchArmed = true, attempts = 0;
          const mech = {
            hideMarker: true, tip, toolLook: pivot, mirrored: true,
            // pointer (hand) position that puts the mirrored grasper tip on the appendix tip; press and hold 0.8 s there
            targets: () => [{ label: 'hand-press-and-hold', p: V(centre.x - (target.x - centre.x) / GAIN, y, centre.z - (target.z - centre.z) / GAIN), holdSec: 0.8 }],
            frac: () => (found ? 0.5 : 0) + 0.5 * Math.min(1, holdT / 0.8),
            update(ev, dt) {
              tip.set(centre.x - (ev.p.x - centre.x) * GAIN, y - 0.03, centre.z - (ev.p.z - centre.z) * GAIN);
              { // the shaft can only reach through the opening
                const du = (tip.x - E.x) * U.x + (tip.z - E.z) * U.z, dv = (tip.x - E.x) * Vp.x + (tip.z - E.z) * Vp.z;
                const q = (du / (holeA * 1.05)) ** 2 + (dv / (Math.max(holeB, 0.05) * 1.05)) ** 2;
                if (q > 1) { const k = 1 / Math.sqrt(q); tip.x = E.x + (U.x * du + Vp.x * dv) * k; tip.z = E.z + (U.z * du + Vp.z * dv) * k; }
              }
              handRing.position.set(ev.p.x, y, ev.p.z);
              const d = Math.hypot(tip.x - target.x, tip.z - target.z);
              const da = arteryDist(tip);
              if (!found && d < 0.3) { found = true; S.award(100, 'Appendix located'); S.setInstr('Now close the jaws on the appendix tip: hold the mouse button steady'); }
              findRing.position.set(target.x, target.y + 0.01, target.z);
              findRing.material.opacity = found ? 0.55 + 0.4 * Math.sin(performance.now() / 180) : 0;
              // artery proximity
              if (da < 0.03) {
                if (touchArmed) { touchArmed = false; S.error(1, 'Artery touched! Ease off'); }
              } else if (da < 0.075) { if (!near) { near = true; S.warn('Careful — artery nearby'); } }
              else { near = false; if (da > 0.07) touchArmed = true; }
              mech.toolOpen = ev.down ? 0 : 0.6;
              if (ev.pressed) {
                attempts++;
                if (d > 0.08) { S.m.missedActions++; S.warn('Jaws closed on nothing — line up with the appendix tip'); }
              }
              if (ev.down && d < 0.08) {
                holdT += dt;
                if (holdT >= 0.8) {
                  S.precision(d / MM);
                  S.award(d / MM < 3 && attempts <= 1 ? 250 : 180, d / MM < 3 ? 'Perfect grasp!' : 'Appendix grasped');
                  handRing.visible = false; findRing.visible = false;
                  return true;
                }
              } else holdT = 0;
              return false;
            },
            async bot(bot) {
              const hand = (p) => V(centre.x - (p.x - centre.x) / GAIN, y, centre.z - (p.z - centre.z) / GAIN);
              const a = arteryPts[arteryPts.length - 1], away = V(target.x - a.x, 0, target.z - a.z).normalize();
              await bot.moveTo(hand(V(target.x + away.x * 0.3, 0, target.z + away.z * 0.3)), 0.7);
              await bot.wait(0.3);
              await bot.moveTo(hand(target), 0.35);
              await bot.wait(0.3); bot.down(true); await bot.wait(1.0); bot.down(false);
            },
            dispose() {},
          };
          return mech;
        },
      },
      {
        title: 'Ligate the artery & clip the base', tool: 'driver', plane: AP_Y + 0.01,
        instr: 'Click the numbered rings in order: 1 ties off the appendicular artery, 2 clips the appendix base.',
        cam: closeCam(apTop(0.25).x - C.x, apTop(0.25).z - C.z + 0.05, 1.5, 0.95),
        start(S) {
          const y = AP_Y + 0.01;
          const a = arteryPts[Math.round(arteryPts.length * 0.15)];
          const t1 = V(a.x, y, a.z), t2 = apTop(0.2).setY(y);
          const clipMat = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 0.9, roughness: 0.25 });
          return clickTargets(S, {
            targets: [t1, t2], y, radius: 0.06, label: 'Clip placed', comboLabel: 'Perfect clip',
            onHit(i) {
              const p = i === 0 ? arteryPts[Math.round(arteryPts.length * 0.15)] : apCurve.getPoint(0.2);
              const tan = i === 0 ? arteryPts[Math.round(arteryPts.length * 0.15) + 1].clone().sub(p) : apCurve.getTangent(0.2);
              const clip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, i === 0 ? 0.12 : 0.24), clipMat);
              clip.position.copy(p).add(V(0, 0.03, 0)); clip.rotation.y = Math.atan2(tan.x, tan.z) + Math.PI / 2; group.add(clip); deep.push(clip);
              if (i === 0) S.info('Artery ligated');
            },
          });
        },
      },
      {
        title: 'Cut & remove the appendix', tool: 'scalpel', plane: AP_Y + 0.01,
        instr: 'Cut across the appendix along the short purple line, just beyond the clip.',
        cam: closeCam(apTop(0.3).x - C.x, apTop(0.3).z - C.z + 0.05, 1.5, 0.95),
        start(S) {
          const y = AP_Y + 0.01;
          const c = apCurve.getPoint(0.32), tan = apCurve.getTangent(0.32);
          const n = V(-tan.z, 0, tan.x).normalize();
          const pts = []; for (let i = 0; i <= 8; i++) pts.push(c.clone().addScaledVector(n, -0.13 + 0.26 * i / 8).setY(y));
          const m = traceGuide(S, { pts, y, tolMm: 5 });
          const inner = m.update;
          m.update = (ev, dt) => {
            const done = inner(ev, dt);
            if (done) removeSpecimen(S);
            return done;
          };
          return m;
        },
      },
      {
        title: 'Close with 3 sutures', tool: 'driver', plane: prepY,
        instr: 'Edges are approximated. For each stitch: press on the teal dot, drag across, release on the purple dot.',
        cam: closeCam(E.x - C.x, E.z - C.z, 1.7, 1.05),
        start(S) {
          retractors.forEach((r) => { r.visible = false; });
          if (organ) organ.visible = false;
          deep.forEach((o) => { o.visible = false; });
          // ease the skin back together
          const t0 = performance.now(), from = openAmt;
          const tick = () => { if (disposedFlag) return; const u = Math.min(1, (performance.now() - t0) / 900); setOpen(from + (0.02 - from) * u); if (u < 1) requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
          const pairs = [-0.5, 0, 0.5].map((k) => { const c = E.clone().addScaledVector(U, k * HALF_L * 0.8); return { entry: c.clone().addScaledVector(Vp, 0.11), exit: c.clone().addScaledVector(Vp, -0.11) }; });
          return sutureBites(S, {
            pairs, y: prepY + 0.006, radius: 0.08,
            onStitch(i) { setOpen(i >= 2 ? 0 : 0.02 * (1 - (i + 1) / 3)); },
          });
        },
      },
    ];

    let disposedFlag = false;
    const deep = []; // clips + stump, hidden when the wound is closed
    function removeSpecimen(S) {
      // distal appendix lifts out into the specimen dish; a short stump remains
      const mat = (apMeshes[0] && apMeshes[0].material) || flat(0xee9a90);
      const stumpPts = []; for (let i = 0; i <= 8; i++) stumpPts.push(apCurve.getPoint(0.3 * i / 8));
      const specPts = []; for (let i = 0; i <= 20; i++) specPts.push(apCurve.getPoint(0.34 + 0.66 * i / 20));
      const r = aset ? 0.055 : organ ? 0.09 * organ.scale.x : 0.07;
      const stump = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stumpPts), 12, r, 10), mat);
      const specGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(specPts), 30, r, 10);
      const mid = specPts[10].clone(); specGeo.translate(-mid.x, -mid.y, -mid.z);
      const spec = new THREE.Mesh(specGeo, mat); spec.position.copy(mid);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat); cap.position.copy(specPts[20]).sub(mid); spec.add(cap);
      for (const m of apMeshes) m.visible = false;
      group.add(stump, spec); deep.push(stump);
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.12, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xc9d0d6, metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide }));
      const dishPos = V(C.x + 2.0, prepY + 0.05, C.z + 1.6); dish.position.copy(dishPos); group.add(dish);
      const from = spec.position.clone(), t0 = performance.now();
      const tick = () => {
        if (disposedFlag) return;
        const u = Math.min(1, (performance.now() - t0) / 1400);
        const e = u * u * (3 - 2 * u);
        spec.position.lerpVectors(from, dishPos, e); spec.position.y += Math.sin(e * Math.PI) * 0.6;
        spec.rotation.y = e * 1.2;
        if (u < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      setTimeout(() => { if (!disposedFlag) S.award(200, 'Specimen removed'); }, 900);
    }

    setOpen(0);
    if (organ) organ.visible = false; // revealed when the wound is retracted
    const controller = createSurgery({
      id: ID, engine, art, group, steps, monitor, parTime: 75,
      wideCam: { pos: [C.x + 0.9, prepY + 3.4, C.z + 3.4], target: [C.x - 0.7, prepY + 0.1, C.z - 0.5] },
      summary: { title: 'Patient stable — discharged in 24 h', sub: 'Appendix removed, wound closed with 3 interrupted sutures.' },
    });
    const baseDispose = controller.dispose;
    controller.dispose = () => { disposedFlag = true; if (artPrep) artPrep.visible = true; baseDispose(); };
    return controller;
  },
};
