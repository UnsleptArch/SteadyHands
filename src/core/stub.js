// CORE — stub level used when a real level module is missing/broken. Playable: trace a dashed line, then score.
import * as THREE from 'three';

const TITLES = { incision: 'Incision', suture: 'Suture', lap: 'Laparoscopy' };

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
      try { pad = art.makeTissuePad ? art.makeTissuePad().mesh : null; } catch { pad = null; }
      if (!pad) {
        pad = new THREE.Mesh(new THREE.BoxGeometry(24, 1.2, 14),
          new THREE.MeshStandardMaterial({ color: 0xe8c9b8, roughness: 0.65 }));
        pad.position.y = 0.6;
      }
      pad.receiveShadow = true;
      group.add(pad);
      engine.setWorkPlane(1.2);

      const x0 = -9, x1 = 9;
      const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, 1.25, 0), new THREE.Vector3(x1, 1.25, 0)]);
      const line = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: 0x3a6fd8, dashSize: 0.6, gapSize: 0.4 }));
      line.computeLineDistances();
      group.add(line);

      let tool;
      try { tool = art.makeScalpel ? art.makeScalpel().mesh : null; } catch { tool = null; }
      if (!tool) {
        tool = new THREE.Group();
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 10, 16),
          new THREE.MeshStandardMaterial({ color: 0xb8c0c8, metalness: 0.9, roughness: 0.25 }));
        handle.position.y = 5.5;
        handle.rotation.z = 0.35;
        handle.castShadow = true;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 12),
          new THREE.MeshStandardMaterial({ color: 0xdfe6ec, metalness: 1, roughness: 0.15 }));
        tip.rotation.x = Math.PI;
        tip.position.y = 0.6;
        tool.add(handle, tip);
      }
      group.add(tool);

      const trail = [];
      const trailGeo = new THREE.BufferGeometry();
      const trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0x8a2a2a }));
      group.add(trailLine);

      let t = 0, maxX = x0, devSum = 0, n = 0, done = false, lastPct = -1;
      const controller = {
        update(dt) {
          t += dt;
          tool.position.copy(input.world);
          if (done) return;
          if (input.pointer.down && input.world.x > x0 - 1 && input.world.x < x1 + 1 && Math.abs(input.world.z) < 6) {
            trail.push(input.world.clone().setY(1.27));
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
          engine.setBotPointer(new THREE.Vector3(x0 - 0.5, 1.2, 0));
          engine.setBotDown(true);
          const v = new THREE.Vector3();
          for (let x = x0 - 0.5; x <= x1 + 0.5 && engine.currentLevel?.controller === controller; x += 0.25) {
            engine.setBotPointer(v.set(x, 1.2, 0));
            await new Promise((r) => setTimeout(r, 16));
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
