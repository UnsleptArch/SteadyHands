// LEVELS — Drill 2: Suturing.
// Four entry -> exit target pairs straddle a wound. Press on the entry dot to bite, then sweep the pointer along the
// needle's curve (the faint X-ray arc shows its path under the skin). The needle rotates about its own centre exactly
// like a real wrist-pronation drive; dragging off the curve twists the needle and tears tissue.
import * as THREE from 'three';
import {
  MM, fromArt, setCamera, addLightsIfNeeded, disposeGroup, makeDot, makeRing, makeReporter, steadyOf,
  gradeDrill, runBot, clamp, r1, r2,
} from './_common.js';

const ID = 'suture';
const ART_SCALE = 10 / 6;
const R = 0.6;                    // needle radius (cm): bite = 12 mm across the wound
const ARC = Math.PI * 0.8;        // needle is a 144-degree arc
const N_SAMP = 64;                // samples along the tip's path
const ENTRY_TOL_MM = 6;
const TEAR_MM = 3;
const PAIRS_Z = [-2.1, -0.7, 0.7, 2.1];
const DIR = new THREE.Vector3(1, 0, 0);   // bite direction: left edge -> right edge (wound runs toward the camera)
const UP = new THREE.Vector3(0, 1, 0);
const SIDE = new THREE.Vector3().crossVectors(DIR, UP); // +z

export default {
  id: ID,
  title: 'Suturing',
  brief: 'Press on the glowing entry dot to bite, then sweep along the needle\'s curve (the faint arc) until it exits at the far dot. ' +
    'Follow the curve: dragging off it twists the needle and tears tissue. Release early and the needle is withdrawn (a retry). Four bites close the wound.',

  setup(engine, art) {
    const { scene, camera } = engine;
    const group = new THREE.Group();
    group.name = 'level-suture';
    scene.add(group);
    addLightsIfNeeded(scene, group);
    setCamera(engine, [0, 6.2, 7.6], [0, 0, 0.1]);

    // ---------- pad + wound ----------
    let pad = fromArt(art, 'makeTissuePad', { drape: true });
    let padTop, toLocal = (x, z) => [x / ART_SCALE, z / ART_SCALE];
    let decal = null;
    if (pad) {
      pad = pad.mesh;
      pad.scale.setScalar(ART_SCALE);
      group.add(pad);
      padTop = pad.userData.surfaceY * ART_SCALE;
      decal = fromArt(art, 'incisionDecal', pad);
    } else {
      pad = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 6.6), new THREE.MeshStandardMaterial({ color: 0xe2b4a8, roughness: 0.6 }));
      pad.position.y = 0.3;
      group.add(pad);
      padTop = 0.6;
    }
    engine.setWorkPlane(padTop);
    if (decal) {
      for (let i = 0; i <= 120; i++) {
        const z = -2.9 + (5.8 * i) / 120;
        const [lx, lz] = toLocal(0.04 * Math.sin(z * 3.1), z);
        decal.addPoint(lx, lz, 0.9);
      }
      decal.endStroke();
    } else {
      const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 5.8), new THREE.MeshBasicMaterial({ color: 0x2a0c10 }));
      slit.rotation.x = -Math.PI / 2; slit.position.y = padTop + 0.004;
      group.add(slit);
    }

    // ---------- targets ----------
    const pairs = PAIRS_Z.map((z) => {
      const entry = new THREE.Vector3(-R, padTop, z);
      const exit = new THREE.Vector3(R, padTop, z);
      const eDot = makeDot(0.09, 0x2f7fd8, padTop + 0.01); eDot.position.x = entry.x; eDot.position.z = z;
      const xDot = makeDot(0.09, 0xf08a24, padTop + 0.01); xDot.position.x = exit.x; xDot.position.z = z;
      const ring = makeRing(0.16, 0.21, 0x2f7fd8, padTop + 0.011, 0);
      ring.position.copy(eDot.position);
      const xRing = makeRing(0.16, 0.21, 0xf08a24, padTop + 0.011, 0);
      xRing.position.copy(xDot.position);
      group.add(eDot, xDot, ring, xRing);
      return { z, entry, exit, eDot, xDot, ring, xRing };
    });

    // X-ray guide arc for the current bite (drawn through the pad)
    const guideMat = new THREE.MeshBasicMaterial({ color: 0x8fc4ff, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false });
    const guide = new THREE.Mesh(new THREE.BufferGeometry(), guideMat);
    guide.renderOrder = 10;
    guide.frustumCulled = false;
    group.add(guide);

    // ---------- needle (+ driver) ----------
    const frame = new THREE.Group();      // basis: X = bite dir, Y = up, Z = along wound
    frame.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(DIR, UP, SIDE));
    const pivot = new THREE.Group();
    frame.add(pivot);
    const steel = new THREE.MeshStandardMaterial({ color: 0xd5dde4, metalness: 0.95, roughness: 0.18 });
    const needle = new THREE.Mesh(new THREE.TorusGeometry(R, 0.022, 8, 48, ARC), steel);
    const tipCone = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.09, 8), steel);
    tipCone.position.set(R * Math.cos(ARC), R * Math.sin(ARC), 0);
    tipCone.rotation.z = ARC; // tangent direction at the tip (increasing angle)
    pivot.add(needle, tipCone);
    const drv = fromArt(art, 'makeNeedleDriver');
    if (drv) {
      const d = drv.mesh;
      d.scale.setScalar(1.8);
      const a = 0.35;
      d.position.set(R * Math.cos(a), R * Math.sin(a), 0);
      if (d.setOpen) d.setOpen(0);
      pivot.add(d);
    }
    group.add(frame);

    // stitches + flash
    const threadMat = new THREE.MeshStandardMaterial({ color: 0x2a2f8f, roughness: 0.55 });
    const halo = makeDot(0.45, 0xd8332f, padTop + 0.013, 0);
    halo.material.transparent = true;
    group.add(halo);

    // ---------- state ----------
    const report = makeReporter(engine, ID);
    const st = {
      started: false, done: false, time: 0, pair: 0, mode: 'hover', // hover | drive | pull
      k: 0, kMax: 0, phi: 0, c: new THREE.Vector3(), entryAct: new THREE.Vector3(),
      offSum: 0, offN: 0, offArmed: true, trauma: 0, retries: 0, entryErrs: [], exitErrs: [], entryXs: [],
      pullT: 0, flashT: 0, mmPerNdc: 1,
    };
    const samples = new Array(N_SAMP + 1).fill(0).map(() => new THREE.Vector3());
    const sNdc = new Array(N_SAMP + 1).fill(0).map(() => new THREE.Vector2());
    const v3 = new THREE.Vector3(), v3b = new THREE.Vector3(), pNdc = new THREE.Vector2();

    /** tip position for rotation phi (0 = at entry, PI = at exit) around centre c */
    function tipAt(c, phi, out) {
      return out.copy(c).addScaledVector(DIR, -R * Math.cos(phi)).addScaledVector(UP, -R * Math.sin(phi));
    }
    function buildSamples(entry) {
      const c = v3b.copy(entry).addScaledVector(DIR, R);
      for (let i = 0; i <= N_SAMP; i++) {
        tipAt(c, (Math.PI * i) / N_SAMP, samples[i]);
        v3.copy(samples[i]).project(camera);
        sNdc[i].set(v3.x, v3.y);
      }
      guide.geometry.dispose();
      guide.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(samples.map((p) => p.clone())), 48, 0.014, 6);
      // mm per NDC unit near this bite
      const a = v3.copy(entry).project(camera).clone();
      const b = v3.copy(entry).addScaledVector(SIDE, 1).project(camera);
      st.mmPerNdc = 10 / Math.max(1e-6, Math.hypot(b.x - a.x, b.y - a.y));
    }
    function setNeedle(c, phi, lift = 0) {
      frame.position.copy(c).addScaledVector(UP, lift);
      pivot.rotation.z = phi + Math.PI - ARC;
    }
    function addStitch(entry, exit) {
      const mid = entry.clone().lerp(exit, 0.5);
      const pts = [
        exit.clone().setY(padTop + 0.01),
        exit.clone().lerp(mid, 0.5).setY(padTop + 0.12).addScaledVector(SIDE, 0.05),
        mid.clone().setY(padTop + 0.16).addScaledVector(SIDE, 0.06),
        entry.clone().lerp(mid, 0.5).setY(padTop + 0.12).addScaledVector(SIDE, 0.05),
        entry.clone().setY(padTop + 0.01),
      ];
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.018, 6), threadMat);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), threadMat);
      knot.position.copy(mid).setY(padTop + 0.15).addScaledVector(SIDE, 0.08);
      const tail1 = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.35, 5), threadMat);
      tail1.position.copy(knot.position).addScaledVector(SIDE, 0.16); tail1.rotation.z = Math.PI / 2 + 0.3;
      group.add(tube, knot, tail1);
    }
    function flash(at) {
      st.flashT = 0.6;
      halo.position.set(at.x, padTop + 0.013, at.z);
      if (decal && decal.flash) { const [lx, lz] = toLocal(at.x, at.z); decal.flash(lx, lz); }
    }

    const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
    function metrics() {
      const errs = [...st.entryErrs, ...st.exitErrs];
      const sp = [];
      for (let i = 1; i < st.entryXs.length; i++) sp.push((st.entryXs[i] - st.entryXs[i - 1]) / MM);
      const spMean = mean(sp);
      const spSd = sp.length ? Math.sqrt(mean(sp.map((v) => (v - spMean) ** 2))) : 0;
      const mErr = mean(errs);
      return {
        meanTargetErrorMm: r2(mErr),
        entryErrorMm: r2(mean(st.entryErrs)),
        exitErrorMm: r2(mean(st.exitErrs)),
        needleOffCurveMm: r2(st.offN ? st.offSum / st.offN : 0),
        spacingSdMm: r2(spSd),
        traumaEvents: st.trauma,
        retries: st.retries,
        bites: st.entryErrs.length,
        timeSec: r1(st.time),
        accuracy: r2(clamp(1 - mErr / 5, 0, 1)),
      };
    }
    function finish() {
      st.done = true;
      controller._done = true;
      const m = metrics();
      const grade = gradeDrill(ID, m);
      report(1, `Wound closed: ${m.meanTargetErrorMm} mm average target error`, { accuracy: m.accuracy }, true);
      engine.emit('level:score', { id: ID, metrics: m, grade });
    }

    buildSamples(pairs[0].entry);
    const tip = new THREE.Vector3();

    const controller = {
      _done: false,
      update(dt, input) {
        if (st.started && !st.done) st.time += dt;
        tip.set(input.world.x, padTop, input.world.z);
        const P = pairs[Math.min(st.pair, pairs.length - 1)];
        const down = input.pointer.down;
        let hint = '';

        if (st.mode === 'hover') {
          // needle tip follows the pointer, held just above the skin
          st.c.copy(tip).addScaledVector(DIR, R);
          setNeedle(st.c, 0, 0.18);
          if (st.done) { setNeedle(st.c, 0, 1.0); }
          else if (down && !st.wasDown) {
            const errMm = Math.hypot(tip.x - P.entry.x, tip.z - P.entry.z) / MM;
            if (errMm <= ENTRY_TOL_MM) {
              st.started = true;
              st.mode = 'drive';
              st.entryAct.copy(tip);
              st.c.copy(tip).addScaledVector(DIR, R);
              buildSamples(st.entryAct);
              st.k = 0; st.kMax = 0; st.phi = 0;
              st.curEntryErr = errMm;
            } else {
              hint = 'Bite at the blue entry dot';
            }
          }
          if (!hint) hint = st.done ? '' : `Bite ${st.pair + 1}/4: press on the blue entry dot`;
        } else if (st.mode === 'drive') {
          // project pointer (with tremor) to screen; find nearest arc sample near the current progress
          v3.copy(tip).project(camera);
          pNdc.set(v3.x, v3.y);
          let best = Infinity, bk = st.k;
          for (let i = Math.max(0, st.k - 10); i <= Math.min(N_SAMP, st.k + 10); i++) {
            const d = pNdc.distanceTo(sNdc[i]);
            if (d < best) { best = d; bk = i; }
          }
          st.k = Math.min(bk, st.k + 6);
          const offMm = best * st.mmPerNdc;
          if (st.k > 0) { st.offSum += offMm; st.offN++; }
          // tears: yanking off the curve or driving the needle backwards
          if (offMm > TEAR_MM && st.offArmed && st.k > 1) { st.trauma++; st.offArmed = false; flash(tipAt(st.c, st.phi, v3b)); }
          else if (offMm < TEAR_MM * 0.6) st.offArmed = true;
          if (st.k < st.kMax - 10) { st.trauma++; st.kMax = st.k; flash(tipAt(st.c, st.phi, v3b)); hint = 'Backing the needle out tears tissue'; }
          st.kMax = Math.max(st.kMax, st.k);
          const target = (Math.PI * st.k) / N_SAMP;
          st.phi += (target - st.phi) * Math.min(1, dt * 18);
          setNeedle(st.c, st.phi);

          if (st.k >= N_SAMP - 1) {
            // exit point: lateral drift of the hand twists the needle plane
            const drift = (tip.z - st.entryAct.z) * 0.5;
            const exitAct = v3b.copy(st.entryAct).addScaledVector(DIR, 2 * R).addScaledVector(SIDE, drift).clone();
            st.entryErrs.push(st.curEntryErr);
            st.exitErrs.push(Math.hypot(exitAct.x - P.exit.x, exitAct.z - P.exit.z) / MM);
            st.entryXs.push((st.entryAct.z + exitAct.z) / 2);
            addStitch(st.entryAct.clone(), exitAct);
            st.mode = 'pull'; st.pullT = 0;
          } else if (!down) {
            st.retries++;
            st.mode = 'hover';
            hint = 'Needle withdrawn: re-enter at the dot (counts as a retry)';
          } else if (!hint) {
            if (offMm > TEAR_MM * 0.7) hint = `Off the curve by ${offMm.toFixed(1)} mm: follow the arc`;
            else if (!steadyOf(input) && input.focus > 0.3 && offMm > 1.2) hint = 'Hold SHIFT for a steady breath';
            else hint = 'Sweep along the arc: rotate the needle through';
          }
        } else if (st.mode === 'pull') {
          // pull the needle out along its curve, then reset to hover
          st.pullT += dt;
          st.phi = Math.PI + (ARC + 0.2) * Math.min(1, st.pullT / 0.5);
          setNeedle(st.c, st.phi, Math.max(0, st.pullT - 0.5) * 2);
          hint = 'Nice bite. Pulling the suture through';
          if (st.pullT > 0.7) {
            st.pair++;
            st.mode = 'hover';
            if (st.pair >= pairs.length) finish();
            else buildSamples(pairs[st.pair].entry);
          }
        }
        st.wasDown = down;

        // visuals
        const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 200);
        pairs.forEach((p, i) => {
          const cur = i === st.pair && !st.done;
          p.ring.material.opacity = cur && st.mode === 'hover' ? pulse : 0;
          p.xRing.material.opacity = cur && st.mode === 'drive' ? pulse : 0;
          p.eDot.material.opacity = i < st.pair ? 0.35 : 1; p.eDot.material.transparent = true;
          p.xDot.material.opacity = i < st.pair ? 0.35 : 1; p.xDot.material.transparent = true;
        });
        guide.visible = !st.done && st.mode !== 'pull';
        st.flashT = Math.max(0, st.flashT - dt);
        halo.material.opacity = st.flashT * 0.5;

        if (!st.done) {
          const m = st.entryErrs.length ? mean([...st.entryErrs, ...st.exitErrs]) : 0;
          const pct = (st.pair + (st.mode === 'drive' ? st.k / N_SAMP : 0)) / pairs.length;
          report(pct, hint, { accuracy: clamp(1 - m / 5, 0, 1) });
        }
      },
      metrics,
      dispose() {
        if (decal && decal.dispose) decal.dispose();
        disposeGroup(group);
      },
      async autoplay() {
        return runBot(engine, controller, async (bot) => {
          const cam = camera.position;
          // ray from camera through a 3D point, hitting the work plane = where the pointer must be
          const onPlane = (p) => {
            const d = p.clone().sub(cam);
            const t = (padTop - cam.y) / d.y;
            return cam.clone().addScaledVector(d, t);
          };
          await bot.start(new THREE.Vector3(-2.5, padTop, 3.2));
          for (let i = 0; i < pairs.length; i++) {
            const P = pairs[i];
            await bot.moveTo(P.entry.clone(), 4);
            await bot.wait(0.25);
            bot.down(true);
            await bot.wait(0.15);
            const c = P.entry.clone().addScaledVector(DIR, R);
            const pts = [];
            for (let k = 1; k <= N_SAMP; k++) pts.push(onPlane(tipAt(c, (Math.PI * k) / N_SAMP, new THREE.Vector3())));
            pts.push(pts[pts.length - 1].clone().addScaledVector(DIR, 0.05));
            await bot.path(pts, 2.2);
            for (let w = 0; w < 50 && st.mode === 'drive'; w++) await bot.wait(0.02);
            bot.down(false);
            await bot.wait(0.75);
          }
          await bot.moveTo(new THREE.Vector3(2.5, padTop, 3.2), 4);
        });
      },
    };
    return controller;
  },
};
