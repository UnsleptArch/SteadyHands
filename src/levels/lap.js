// LEVELS — Drill 3: Laparoscopic peg transfer (FLS-style).
// The grasper pivots at a fixed port in the box ceiling, so the tip moves OPPOSITE to your hand and scaled
// (the fulcrum effect). Move the 3 beads from the left posts to the right posts without touching the red vessels.
import * as THREE from 'three';
import {
  fromArt, makeDot, hideRoom, setCamera, addLightsIfNeeded, disposeGroup, makeReporter, steadyOf, gradeDrill, runBot, clamp, r1, r2,
} from './_common.js';

const ID = 'lap';
const S = 4;                 // ART lap kit: 1 art unit = 10 cm -> we use 1 art unit = 4 cm (a compact trainer box)
const FULCRUM_K = 0.85;      // tip moves 0.85x the hand, inverted
const WORK_Y = 2.6;          // tip carry height (cm above floor)
const GRAB_R = 0.75;         // grasp radius (cm)
const POST_R = 0.7;          // release-on-post radius
const VESSEL_HIT = 0.45;     // tip-to-vessel-centreline distance that counts as a touch (cm)
const BOUNDS = { x: [-11.2, 11.2], z: [-7.2, 7.2] };
const LEFT = [[-7, -3.6], [-8.2, 0.4], [-7, 4.2]];
const RIGHT = [[7, -3.6], [8.2, 0.4], [7, 4.2]];
// vessels: two red strips forming a chicane; gaps force a planned route
const V1 = [[-2.6, -7.4], [-2.2, -4], [-2.8, -1], [-2.3, 2.4]];      // gap toward the front (z > 2.6)
const V2 = [[2.4, -2.4], [2.9, 1], [2.3, 4], [2.6, 7.4]];            // gap toward the back (z < -2.6)
const GATES = [{ x: -2.5, z: 4.9 }, { x: 2.5, z: -4.9 }];

function route(a, b) {
  // waypoints from a to b passing the vessel gaps in x order
  const pts = [];
  const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
  const gates = GATES.filter((g) => g.x > lo && g.x < hi).sort((g1, g2) => (a.x < b.x ? g1.x - g2.x : g2.x - g1.x));
  for (const g of gates) pts.push(new THREE.Vector3(g.x, WORK_Y, g.z));
  pts.push(new THREE.Vector3(b.x, WORK_Y, b.z));
  return pts;
}
const routeLen = (a, pts) => { let L = 0, p = a; for (const q of pts) { L += Math.hypot(q.x - p.x, q.z - p.z); p = q; } return L; };

export default {
  id: ID,
  title: 'Laparoscopic Transfer',
  brief: 'FULCRUM EFFECT: the grasper pivots at the port, so the tip moves opposite to your hand (move right, tip goes left; ' +
    'move up, tip comes toward you), scaled down. Hold the mouse to close the jaws on a bead, carry it to a right-hand post and release. ' +
    'Do not touch the red vessels.',

  setup(engine, art) {
    const { scene } = engine;
    const group = new THREE.Group();
    group.name = 'level-lap';
    scene.add(group);
    addLightsIfNeeded(scene, group);
    const restoreRoom = hideRoom(engine); // the box is a closed world; the OR table would z-fight its floor
    setCamera(engine, [0, 10.5, 17.5], [0, 0.4, -0.6]);

    // ---------- box ----------
    let box = fromArt(art, 'makeLapBox');
    let port;
    if (box) {
      box = box.mesh;
      box.scale.setScalar(S);
      group.add(box);
      port = box.userData.port.clone().multiplyScalar(S);
    } else {
      box = new THREE.Mesh(new THREE.BoxGeometry(24, 0.4, 16), new THREE.MeshStandardMaterial({ color: 0x2a3a35, roughness: 0.8 }));
      box.position.y = -0.2;
      group.add(box);
      port = new THREE.Vector3(0, 13.4, 3.6);
      const pl = new THREE.PointLight(0xdfeeff, 60, 40, 1.4); pl.position.set(0, 10, 2); group.add(pl);
    }
    const lamp = new THREE.PointLight(0xfff4e6, 120, 45, 1.5); // endoscope light near the camera
    lamp.position.set(0, 8, 10);
    group.add(lamp);
    engine.setWorkPlane(WORK_Y);
    const C = new THREE.Vector3(0, WORK_Y, 0); // workspace centre the fulcrum mirrors around

    // ---------- posts + beads ----------
    const mkPost = (color, x, z) => {
      let p = fromArt(art, 'makePost', color);
      p = p ? p.mesh : new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.45, 12), new THREE.MeshStandardMaterial({ color: 0x9aa4ad }));
      if (!p.isGroup) p.position.y = 0.9;
      p.scale.setScalar(S);
      p.position.x = x; p.position.z = z;
      group.add(p);
      return { mesh: p, x, z, bead: null };
    };
    const left = LEFT.map(([x, z]) => mkPost('blue', x, z));
    const right = RIGHT.map(([x, z]) => mkPost('green', x, z));
    const BEAD_Y = 0.2;
    const beadColors = ['yellow', 'orange', 'purple'];
    const beads = left.map((post, i) => {
      let m = fromArt(art, 'makePeg', beadColors[i]);
      m = m ? m.mesh : new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.04, 8, 20), new THREE.MeshStandardMaterial({ color: 0xf2c230 }));
      if (!m.userData.height) { m.rotation.x = Math.PI / 2; }
      m.scale.setScalar(S);
      m.position.set(post.x, BEAD_Y, post.z);
      group.add(m);
      const b = { mesh: m, post, state: 'post', vy: 0, home: post };
      post.bead = b;
      return b;
    });

    // ---------- vessels ----------
    const mkVessel = (pts) => {
      const path = pts.map(([x, z]) => new THREE.Vector3(x / S, 0.06, z / S));
      let v = fromArt(art, 'makeVessel', path);
      let mesh;
      if (v) { mesh = v.mesh; mesh.scale.setScalar(S); }
      else {
        const curve = new THREE.CatmullRomCurve3(path.map((p) => p.clone().multiplyScalar(S)));
        mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.18, 10), new THREE.MeshStandardMaterial({ color: 0xb3151c, roughness: 0.3, emissive: 0 }));
      }
      group.add(mesh);
      const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.3);
      return { mesh, samples: curve.getSpacedPoints(120), flashT: 0 };
    };
    const vessels = [mkVessel(V1), mkVessel(V2)];
    const highlight = (v, on) => {
      if (v.mesh.setHighlight) v.mesh.setHighlight(on);
      else if (v.mesh.material.emissive) v.mesh.material.emissive.set(on ? 0xff2a2a : 0x000000);
    };

    // ---------- grasper ----------
    let gr = fromArt(art, 'makeGrasper');
    let grasper;
    if (gr) { grasper = gr.mesh; grasper.scale.setScalar(5); }
    else {
      grasper = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 16, 12), new THREE.MeshStandardMaterial({ color: 0x9aa4ad, metalness: 0.8, roughness: 0.3 }));
      shaft.rotation.x = Math.PI / 2; shaft.position.z = 8;
      grasper.add(shaft);
    }
    group.add(grasper);
    // soft contact shadow under the jaws: the depth cue laparoscopists rely on
    const blob = makeDot(0.6, 0x000000, 0.03, 0.35);
    group.add(blob);

    // red screen-edge flash (DOM overlay, owned by this level)
    const flashEl = document.createElement('div');
    flashEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;box-shadow:inset 0 0 120px 30px rgba(220,30,30,0.55);opacity:0;transition:opacity .08s;z-index:5';
    document.body.appendChild(flashEl);

    // ---------- state ----------
    const report = makeReporter(engine, ID);
    const tip = new THREE.Vector3(0, WORK_Y, 0);
    const lastTip = new THREE.Vector3(0, WORK_Y, 0);
    const st = {
      started: false, done: false, time: 0, path: 0, held: null, placed: 0, drops: 0, missed: 0, touches: 0,
      touchArmed: false, wasDown: false, tipY: WORK_Y, flashT: 0, msg: '', msgT: 0,
    };
    // ideal path: the planned route visiting each bead then its target post
    let idealLen = 0;
    {
      let p = new THREE.Vector3(0, WORK_Y, 0);
      for (let i = 0; i < 3; i++) {
        const a = route(p, new THREE.Vector3(left[i].x, WORK_Y, left[i].z)); idealLen += routeLen(p, a); p = a[a.length - 1];
        const b = route(p, new THREE.Vector3(right[i].x, WORK_Y, right[i].z)); idealLen += routeLen(p, b); p = b[b.length - 1];
      }
    }

    function nearestBead(maxD) {
      let best = null, bd = maxD;
      for (const b of beads) {
        if (b.state === 'held' || (b.state === 'post' && b.post && right.includes(b.post))) continue;
        const d = Math.hypot(b.mesh.position.x - tip.x, b.mesh.position.z - tip.z);
        if (d < bd) { bd = d; best = b; }
      }
      return best;
    }
    function nearestPost(list) {
      let best = null, bd = POST_R;
      for (const p of list) {
        const d = Math.hypot(p.x - tip.x, p.z - tip.z);
        if (d < bd && !p.bead) { bd = d; best = p; }
      }
      return best;
    }
    function say(m) { st.msg = m; st.msgT = 1.8; }

    function metrics() {
      return {
        vesselTouches: st.touches,
        drops: st.drops,
        missedGrasps: st.missed,
        pathLengthCm: r1(st.path),
        pathLengthRatio: r2(st.path / Math.max(1, idealLen)),
        beadsTransferred: st.placed,
        timeSec: r1(st.time),
        accuracy: r2(clamp(1 - (st.touches + st.drops) * 0.12 - st.missed * 0.04, 0, 1)),
      };
    }
    function finish() {
      st.done = true;
      controller._done = true;
      const m = metrics();
      const grade = gradeDrill(ID, m);
      report(1, `Transfer complete: ${m.vesselTouches} vessel touches, ${m.drops} drops`, { accuracy: m.accuracy }, true);
      engine.emit('level:score', { id: ID, metrics: m, grade });
    }

    const controller = {
      _done: false,
      fulcrum: { k: FULCRUM_K, centre: C },
      /** where the hand (pointer on the work plane) must be for the tip to reach `t` */
      handFor(t) { return new THREE.Vector3(C.x - (t.x - C.x) / FULCRUM_K, WORK_Y, C.z - (t.z - C.z) / FULCRUM_K); },
      update(dt, input) {
        // FULCRUM EFFECT: tip = centre - k * (hand - centre). Tremor (already in input.world) is mirrored too.
        const h = input.world;
        tip.x = clamp(C.x - (h.x - C.x) * FULCRUM_K, BOUNDS.x[0], BOUNDS.x[1]);
        tip.z = clamp(C.z - (h.z - C.z) * FULCRUM_K, BOUNDS.z[0], BOUNDS.z[1]);
        const down = input.pointer.down && !st.done;

        const moved = Math.hypot(tip.x - lastTip.x, tip.z - lastTip.z);
        if (!st.started && (moved > 0.02 || down)) st.started = true;
        if (st.started && !st.done) { st.time += dt; st.path += moved; }
        lastTip.copy(tip);

        // grasp / release
        if (down && !st.wasDown && !st.held) {
          const b = nearestBead(GRAB_R);
          if (b) {
            if (b.post) b.post.bead = null;
            b.post = null; b.state = 'held'; st.held = b;
          } else { st.missed++; say('Missed grasp: line the jaws up over a bead'); }
        } else if (!down && st.wasDown && st.held) {
          const b = st.held; st.held = null;
          const target = nearestPost(right) || nearestPost(left);
          if (target) {
            b.state = 'post'; b.post = target; target.bead = b;
            b.mesh.position.set(target.x, BEAD_Y, target.z);
            if (right.includes(target)) { st.placed = right.filter((p) => p.bead).length; say(`Bead placed (${st.placed}/3)`); }
          } else {
            b.state = 'fall'; b.vy = 0; st.drops++; say('Dropped! Pick the bead up again');
          }
        }
        st.wasDown = down;

        // tip height: dip toward a bead when hovering open over it, carry high above the pins
        let ty = WORK_Y;
        if (!st.held) { const nb = nearestBead(1.2); if (nb) ty = nb.mesh.position.y + 0.55; }
        st.tipY += (ty - st.tipY) * Math.min(1, dt * 10);
        tip.y = st.tipY;

        // vessel contact
        let minD = Infinity, hitV = null;
        for (const v of vessels) for (const s of v.samples) {
          const d = Math.hypot(s.x - tip.x, s.z - tip.z);
          if (d < minD) { minD = d; hitV = v; }
        }
        if (minD < VESSEL_HIT && st.touchArmed && st.started && !st.done) {
          st.touches++; st.touchArmed = false; st.flashT = 0.5; hitV.flashT = 0.6;
          say('Vessel touched! Route around the red vessels');
        } else if (minD > VESSEL_HIT + 0.25) st.touchArmed = true;
        for (const v of vessels) { v.flashT = Math.max(0, v.flashT - dt); highlight(v, v.flashT > 0); }

        // beads
        for (const b of beads) {
          if (b.state === 'held') b.mesh.position.set(tip.x, tip.y - 0.45, tip.z);
          else if (b.state === 'fall') {
            b.vy -= 60 * dt; b.mesh.position.y += b.vy * dt;
            if (b.mesh.position.y <= 0) { b.mesh.position.y = 0; b.state = 'floor'; }
          }
        }

        // grasper pose: tip at `tip`, shaft through the port
        grasper.position.copy(tip);
        blob.position.set(tip.x, 0.03, tip.z);
        blob.material.opacity = 0.18 + 0.25 * clamp(1 - tip.y / 4, 0, 1);
        grasper.lookAt(port);
        if (grasper.setOpen) grasper.setOpen(down ? 0.05 : 0.8);

        st.flashT = Math.max(0, st.flashT - dt);
        flashEl.style.opacity = String(Math.min(1, st.flashT * 2.5));
        st.msgT = Math.max(0, st.msgT - dt);

        if (!st.done && st.placed >= 3) finish();
        if (!st.done) {
          let hint;
          if (st.msgT > 0) hint = st.msg;
          else if (!st.started) hint = 'Controls are INVERTED (fulcrum effect): move the mouse and the tip goes the opposite way';
          else if (st.held) hint = 'Carry it to a green post on the right and release';
          else if (!steadyOf(input) && input.focus > 0.5 && minD < 1.2) hint = 'Close to a vessel: hold SHIFT to steady';
          else hint = `Grab a bead: hover the jaws over it and hold the mouse (${st.placed}/3 moved)`;
          const carry = st.held ? 0.5 : 0;
          report((st.placed + carry) / 3, hint, { accuracy: metrics().accuracy });
        }
      },
      metrics,
      dispose() {
        flashEl.remove();
        restoreRoom();
        disposeGroup(group);
      },
      async autoplay() {
        return runBot(engine, controller, async (bot) => {
          const hand = (t) => controller.handFor(t);
          let cur = new THREE.Vector3(0, WORK_Y, 0);
          await bot.start(hand(cur));
          await bot.wait(0.3);
          for (let i = 0; i < 3; i++) {
            const L = new THREE.Vector3(left[i].x, WORK_Y, left[i].z);
            await bot.path(route(cur, L).map(hand), 7);
            await bot.wait(0.35);
            bot.down(true);
            await bot.wait(0.35);
            const R = new THREE.Vector3(right[i].x, WORK_Y, right[i].z);
            await bot.path(route(L, R).map(hand), 7);
            await bot.wait(0.3);
            bot.down(false);
            await bot.wait(0.35);
            cur = R;
          }
        });
      },
    };
    return controller;
  },
};
