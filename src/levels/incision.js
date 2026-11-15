// LEVELS — Drill 1: Precision Incision.
// Hold the mouse to engage the blade and trace the marked curve. Depth comes from how slowly you move
// (a lingering blade sinks deeper), so a steady, even pace gives an even cut.
import * as THREE from 'three';
import {
  MM, fromArt, setCamera, addLightsIfNeeded, disposeGroup, makeDot, makeRing, polyline, closestOnPolyline,
  Ribbon, buildPatientField, makeReporter, steadyOf, gradeDrill, runBot, clamp, r1, r2,
} from './_common.js';

const ID = 'incision';
const ART_SCALE = 10 / 6;      // ART pad is 6 art-units wide; we want a 100 mm (10 unit) pad
const TOOL_SCALE = 3.4;         // ART instruments: 1 art unit = 10 cm; slightly shrunk for a readable view
const DEPTH_BAND = [1.5, 5.0]; // mm: shallower = scratch, deeper = too deep
const OFFLINE_MM = 2.0;

/** Depth the blade settles at for a given hand speed (mm/s): slow = deep, fast = shallow. */
const depthForSpeed = (v) => 1.0 + 6.0 * Math.exp(-v / 25);

function makeCurve() {
  const pts = [];
  for (let i = 0; i <= 160; i++) {
    const x = -3.6 + (7.2 * i) / 160;
    pts.push(new THREE.Vector3(x, 0, 0.95 * Math.sin(x * 0.85) - 0.15 * Math.sin(x * 2.1)));
  }
  return pts;
}

export default {
  id: ID,
  title: 'Precision Incision',
  brief: 'Hold the mouse button to engage the scalpel and cut along the dashed line from the green dot to the end dot. ' +
    'Keep a steady pace: lingering lets the blade sink too deep, rushing makes a shallow scratch. Hold SHIFT to steady your hand.',

  setup(engine, art) {
    const { scene } = engine;
    const group = new THREE.Group();
    group.name = 'level-incision';
    scene.add(group);
    addLightsIfNeeded(scene, group);
    setCamera(engine, [0, 10.4, 8.6], [0, 0, 0.3]);

    // ---------- surgical field on the patient ----------
    const field = buildPatientField(engine, art, group, { padW: 10 });
    const { pad, padTop, toLocal } = field;
    engine.setWorkPlane(padTop);

    // ---------- marked line + cut groove ----------
    const curvePts = makeCurve();
    const pl = polyline(curvePts);
    const L = pl.length;
    let decal = null;
    if (pad.userData && pad.userData.surfaceY !== undefined) decal = fromArt(art, 'incisionDecal', pad);
    let ribbon = null;
    if (decal) {
      decal.setGuide(curvePts.map((p) => { const [x, z] = toLocal(p.x, p.z); return { x, z }; }), { color: '#5a3aa0', dashed: true, width: 4 });
    } else {
      const guide = new Ribbon(200, padTop + 0.003);
      const purple = new THREE.Color(0x5a3aa0);
      for (let i = 0; i < curvePts.length - 1; i += 2) guide.seg(curvePts[i], curvePts[i + 1], 0.03, 0.03, purple);
      group.add(guide.mesh);
    }
    const lip = new Ribbon(6000, padTop + 0.004, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }));
    ribbon = new Ribbon(6000, padTop + 0.006, new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false }));
    group.add(lip.mesh, ribbon.mesh);
    const startDot = makeDot(0.16, 0x2fbf71, padTop + 0.01);
    startDot.position.set(curvePts[0].x, padTop + 0.01, curvePts[0].z);
    const startRing = makeRing(0.22, 0.28, 0x2fbf71, padTop + 0.01, 0.8);
    startRing.position.copy(startDot.position);
    const endRing = makeRing(0.14, 0.2, 0x5a3aa0, padTop + 0.01, 0.9);
    const endP = curvePts[curvePts.length - 1];
    endRing.position.set(endP.x, padTop + 0.01, endP.z);
    group.add(startDot, startRing, endRing);

    // error flash halo (subtle red, no gore)
    const halo = makeDot(0.5, 0xd8332f, padTop + 0.012, 0);
    group.add(halo);

    // ---------- scalpel ----------
    let tool = fromArt(art, 'makeScalpel');
    let toolMesh;
    if (tool) { toolMesh = tool.mesh; toolMesh.scale.setScalar(TOOL_SCALE); }
    else {
      toolMesh = new THREE.Group();
      const steel = new THREE.MeshStandardMaterial({ color: 0xc8d0d8, metalness: 0.9, roughness: 0.25 });
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.6, 2.5), steel);
      blade.position.set(0, 0.3, 1.25);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 8), steel);
      handle.position.set(0, 0.6, 6.5);
      toolMesh.add(blade, handle);
    }
    toolMesh.rotation.order = 'YXZ';
    toolMesh.rotation.x = -0.75;
    toolMesh.rotation.y = -Math.PI / 2;
    group.add(toolMesh);

    // ---------- state ----------
    const report = makeReporter(engine, ID);
    const st = {
      started: false, done: false, cutting: false, time: 0, strokeT: 0,
      sMax: 0, depth: 0, speed: 0, devSum: 0, devN: 0, devMax: 0,
      dSum: 0, dSq: 0, dN: 0, inBand: 0, offLine: 0, offArmed: true, pauses: 0, stillT: 0, pauseCounted: false,
      cutEnd: new THREE.Vector3(), hasCutEnd: false, deep: 0, deepArmed: true, strokes: 0, pathLen: 0, lastCut: null, flashT: 0, hint: '',
    };
    const prevRaw = new THREE.Vector3().copy(engine.input.worldRaw);
    const tip = new THREE.Vector3();
    const tmpA = new THREE.Vector3();
    const groove = new THREE.Color(0x2a0c10), grooveBad = new THREE.Color(0xa0262a), lipCol = new THREE.Color(0x8a3a3a);

    function addCutPoint(p, devMm) {
      const dn = clamp((st.depth - 1) / 5, 0, 1);
      if (st.lastCut) {
        const w = 0.012 + dn * 0.022;
        lip.seg(st.lastCut, p, w + 0.018, w + 0.018, lipCol);
        ribbon.seg(st.lastCut, p, w, w, devMm > OFFLINE_MM ? grooveBad : groove);
      }
      st.cutEnd.copy(p); st.hasCutEnd = true;
      if (st.lastCut) st.pathLen += Math.hypot(p.x - st.lastCut.x, p.z - st.lastCut.z);
      st.lastCut = (st.lastCut || new THREE.Vector3()).copy(p);
    }

    function endStroke() {
      st.cutting = false;
      st.lastCut = null;
    }

    function metrics() {
      const mean = st.devN ? st.devSum / st.devN : 0;
      const dMean = st.dN ? st.dSum / st.dN : 0;
      const dVar = st.dN ? Math.sqrt(Math.max(0, st.dSq / st.dN - dMean * dMean)) : 0;
      const covered = Math.max(1e-6, st.sMax);
      return {
        meanDeviationMm: r2(mean / MM),
        maxDeviationMm: r2(st.devMax / MM),
        depthVariability: r2(dVar),
        meanDepthMm: r2(dMean),
        depthInBandPct: st.dN ? r2(st.inBand / st.dN) : 0,
        offLineEvents: st.offLine,
        pauses: st.pauses,
        tooDeepWarnings: st.deep,
        pathRatio: r2(st.pathLen / covered),
        completionPct: r2(clamp(st.sMax / L, 0, 1)),
        timeSec: r1(st.time),
        accuracy: r2(clamp(1 - mean / MM / 4, 0, 1)),
      };
    }

    function finish() {
      if (st.done) return;
      endStroke();
      st.done = true;
      controller._done = true;
      const m = metrics();
      const grade = gradeDrill(ID, m);
      report(1, `Incision complete: ${m.meanDeviationMm} mm mean deviation`, { accuracy: m.accuracy }, true);
      engine.emit('level:score', { id: ID, metrics: m, grade });
    }

    const controller = {
      _done: false,
      update(dt, input) {
        const raw = input.worldRaw;
        tip.set(input.world.x, padTop, input.world.z);
        // hand speed (raw pointer, so tremor jitter does not count as speed)
        const v = dt > 0 ? Math.hypot(raw.x - prevRaw.x, raw.z - prevRaw.z) / MM / dt : 0;
        prevRaw.copy(raw);
        st.speed += (v - st.speed) * Math.min(1, dt / 0.15);

        const c = closestOnPolyline(pl, tip);
        const devMm = c.dist / MM;
        const down = input.pointer.down && !st.done;

        if (!st.done && st.started) st.time += dt;

        // engage / disengage
        if (down && !st.cutting) {
          const nearStart = tip.distanceTo(curvePts[0].clone().setY(padTop)) < 0.5;
          const nearResume = st.started && devMm < 5 && (Math.abs(c.s - st.sMax) < 1.5 ||
            (st.hasCutEnd && Math.hypot(tip.x - st.cutEnd.x, tip.z - st.cutEnd.z) < 0.8));
          if ((!st.started && nearStart) || nearResume) {
            if (st.started && st.strokes > 0) st.pauses++; // lifting the blade mid-cut is a hesitation
            st.started = true;
            st.cutting = true;
            st.strokes++;
            st.strokeT = 0;
            st.depth = 0.5;
            st.stillT = 0;
            st.pauseCounted = false;
          }
        } else if (!down && st.cutting) {
          endStroke();
        }

        let hint;
        if (st.cutting) {
          st.strokeT += dt;
          const target = depthForSpeed(st.speed);
          st.depth += (target - st.depth) * Math.min(1, dt / 0.25);
          if (!st.lastCut || tip.distanceTo(st.lastCut) > 0.03) addCutPoint(tip, devMm);
          if (st.strokeT > 0.3) {
            st.devSum += c.dist; st.devN++; st.devMax = Math.max(st.devMax, c.dist);
            st.dSum += st.depth; st.dSq += st.depth * st.depth; st.dN++;
            if (st.depth >= DEPTH_BAND[0] && st.depth <= DEPTH_BAND[1]) st.inBand++;
          }
          if (devMm < 4 && c.s - st.sMax < 3.0) st.sMax = Math.max(st.sMax, c.s);
          // off-line events (with hysteresis)
          if (devMm > OFFLINE_MM && st.offArmed) {
            st.offLine++; st.offArmed = false; st.flashT = 0.6;
            halo.position.set(tip.x, padTop + 0.012, tip.z);
            if (decal && decal.flash) { const [lx, lz] = toLocal(tip.x, tip.z); decal.flash(lx, lz); }
          } else if (devMm < 1.5) st.offArmed = true;
          // too deep
          if (st.depth > DEPTH_BAND[1] && st.deepArmed && st.strokeT > 0.6) { st.deep++; st.deepArmed = false; }
          else if (st.depth < DEPTH_BAND[1] - 0.5) st.deepArmed = true;
          // pauses: blade parked in tissue
          if (st.speed < 1.5) {
            st.stillT += dt;
            if (st.stillT > 1.5 && !st.pauseCounted) { st.pauses++; st.pauseCounted = true; }
          } else { st.stillT = 0; st.pauseCounted = false; }

          if (st.depth > DEPTH_BAND[1]) hint = 'Too deep! Keep the blade moving';
          else if (devMm > OFFLINE_MM) hint = `Off the line by ${devMm.toFixed(1)} mm: steer back`;
          else if (st.strokeT > 0.4 && st.depth < DEPTH_BAND[0]) hint = 'Too fast: the cut is only a scratch';
          else if (!steadyOf(input) && input.focus > 0.3 && devMm > 1) hint = 'Hold SHIFT for a steady breath';
          else hint = 'Good. Even pace, follow the line to the end dot';
          const atEnd = Math.hypot(tip.x - endP.x, tip.z - endP.z) < 0.5;
          const meanMm = st.devN ? st.devSum / st.devN / MM : 0;
          if (st.sMax >= L - 0.15 || (atEnd && st.sMax > L * 0.5 && meanMm < 4)) { st.sMax = L; finish(); }
        } else if (!st.done) {
          hint = st.started ? 'Blade lifted: press again where your cut ended' : 'Press and hold on the green dot to engage the blade';
        }

        // ---------- visuals ----------
        const k = Math.min(1, dt * 12);
        const yTarget = st.cutting ? padTop - Math.min(st.depth, 7) * MM * 0.6 : padTop + (st.done ? 0.45 : 0.25);
        if (st.done) { // set the scalpel down off to the side
          toolMesh.position.x += (endP.x + 4 - toolMesh.position.x) * k * 0.3;
          toolMesh.position.z += (endP.z + 2 - toolMesh.position.z) * k * 0.3;
        } else {
          toolMesh.position.x = tip.x;
          toolMesh.position.z = tip.z;
        }
        toolMesh.position.y += (yTarget - toolMesh.position.y) * k;
        // yaw along the line's tangent near the blade
        const i = Math.min(c.i, curvePts.length - 2);
        tmpA.subVectors(curvePts[i + 1], curvePts[i]);
        const yaw = Math.atan2(-tmpA.x, -tmpA.z);
        toolMesh.rotation.y += (yaw - toolMesh.rotation.y) * Math.min(1, dt * 6);
        toolMesh.rotation.x = st.cutting ? -0.62 : -0.75;

        const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 220);
        startRing.material.opacity = st.started ? 0 : pulse;
        endRing.material.opacity = st.sMax > L * 0.8 ? pulse : 0.6;
        st.flashT = Math.max(0, st.flashT - dt);
        halo.material.opacity = st.flashT * 0.5;
        halo.material.transparent = true;

        if (!st.done) {
          const mean = st.devN ? st.devSum / st.devN / MM : 0;
          report(st.sMax / L, hint, { accuracy: clamp(1 - mean / 4, 0, 1), depthMm: r1(st.depth), deviationMm: r1(devMm) });
        }
      },
      metrics,
      dispose() {
        if (decal && decal.dispose) decal.dispose();
        field.dispose();
        disposeGroup(group);
      },
      async autoplay() {
        return runBot(engine, controller, async (bot) => {
          const p0 = curvePts[0].clone().setY(padTop);
          await bot.start(new THREE.Vector3(p0.x - 1.5, padTop, p0.z + 1.5));
          await bot.moveTo(p0, 3);
          await bot.wait(0.3);
          bot.down(true);
          await bot.wait(0.25);
          // constant ~22 mm/s keeps depth at ~3.5 mm (inside the ideal band)
          const pts = curvePts.slice(1).map((p) => p.clone().setY(padTop));
          pts.push(pts[pts.length - 1].clone().add(new THREE.Vector3(0.1, 0, 0)));
          await bot.path(pts, 2.2);
          bot.down(false);
          await bot.moveTo(new THREE.Vector3(endP.x + 0.8, padTop, endP.z + 1.0), 3);
        });
      },
    };
    return controller;
  },
};
