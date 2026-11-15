// CORE — stub level used when a real level module is missing/broken. Playable: trace a dashed line, then score.
import * as THREE from 'three';

const TITLES = { incision: 'Incision', suture: 'Suture', lap: 'Laparoscopy', appendectomy: 'Appendectomy', laceration: 'Laceration Repair' };

export function stubLevel(id) {
  return {
    id,
    title: TITLES[id] || id,
    brief: 'Placeholder drill — trace the guide line from left to right while holding the mouse button.',
    stub: true,
    setup(engine, art) {
      const { scene, input } = engine;
      const group = new THREE.Group();
      scene.add(group);

      let pad;
      try { pad = art.makeTissuePad ? art.makeTissuePad() : null; } catch { pad = null; }
      if (pad && pad.mesh) pad = pad.mesh;
      if (!pad) {
        pad = new THREE.Mesh(new THREE.BoxGeometry(6, 0.35, 4),
          new THREE.MeshStandardMaterial({ color: 0xe8c9b8, roughness: 0.65 }));
        pad.position.y = 0.175;
        pad.userData.surfaceY = 0.35;
      }
      pad.receiveShadow = true;
      group.add(pad);
      const Y = pad.userData.surfaceY ?? 0.35;
      engine.setWorkPlane(Y);

      const x0 = -2.2, x1 = 2.2;
      const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, Y + 0.003, 0), new THREE.Vector3(x1, Y + 0.003, 0)]);
      const line = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: 0x3a6fd8, dashSize: 0.08, gapSize: 0.05 }));
      line.computeLineDistances();
      group.add(line);

      let tool;
      try { tool = art.makeScalpel ? art.makeScalpel() : null; } catch { tool = null; }
      if (tool && tool.mesh) tool = tool.mesh;
      if (!tool) {
        tool = new THREE.Group();
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.2, 16),
          new THREE.MeshStandardMaterial({ color: 0xb8c0c8, metalness: 0.9, roughness: 0.25 }));
        handle.rotation.x = Math.PI / 2;
        handle.position.z = 0.6;
        handle.castShadow = true;
        tool.add(handle);
      }
      // tip at local origin, body toward +Z: tilt the handle up toward the camera
      const toolRig = new THREE.Group();
      tool.rotation.x = -0.75;
      toolRig.rotation.y = 0.5;
      toolRig.add(tool);
      group.add(toolRig);

      const trail = [];
      const trailGeo = new THREE.BufferGeometry();
      const trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0x8a2a2a }));
      group.add(trailLine);

      let t = 0, maxX = x0, devSum = 0, n = 0, done = false, lastPct = -1;
      const controller = {
        update(dt) {
          t += dt;
          toolRig.position.copy(input.world);
          if (done) return;
          if (input.pointer.down && input.world.x > x0 - 0.1 && input.world.x < x1 + 0.1 && Math.abs(input.world.z) < 1) {
            trail.push(input.world.clone().setY(Y + 0.004));
            if (trail.length > 1) trailGeo.setFromPoints(trail);
            if (input.world.x > maxX) maxX = input.world.x;
            devSum += Math.abs(input.world.z); n++;
          }
          const pct = Math.max(0, Math.min(1, (maxX - x0) / (x1 - x0)));
          if (Math.abs(pct - lastPct) > 0.01) {
            lastPct = pct;
            engine.emit('level:progress', { id, pct, hint: pct < 0.02 ? 'Hold the mouse button and trace the blue line' : 'Keep steady — hold SHIFT to reduce tremor' });
          }
          if (pct >= 0.99) {
            done = true;
            const devMm = n ? (devSum / n) / engine.MM : 0;
            const g = devMm < 1.5 ? 5 : devMm < 3 ? 4 : devMm < 5 ? 3 : devMm < 8 ? 2 : 1;
            engine.emit('level:score', { id, metrics: controller.metrics(), grade: { overall: g, items: { 'Respect for tissue': g, 'Time & motion': t < 20 ? 5 : 3 } } });
          }
        },
        metrics() {
          return { 'Mean deviation (mm)': n ? +((devSum / n) / engine.MM).toFixed(2) : 0, 'Time (s)': +t.toFixed(1), stub: true };
        },
        async autoplay() {
          engine.botNoTremor = false;
          engine.setBotPointer(new THREE.Vector3(x0 - 0.05, Y, 0));
          engine.setBotDown(true);
          const v = new THREE.Vector3();
          for (let x = x0 - 0.05; x <= x1 + 0.05 && engine.currentLevel?.controller === controller; x += 0.04) {
            engine.setBotPointer(v.set(x, Y, 0));
            await new Promise((r) => requestAnimationFrame(() => r()));
          }
          engine.setBotDown(false);
          engine.setBotPointer(null);
          return controller.metrics();
        },
        dispose() {
          scene.remove(group);
          group.traverse((o) => { o.geometry && o.geometry.dispose(); });
        },
      };
      return controller;
    },
  };
}
