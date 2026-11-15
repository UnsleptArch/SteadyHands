// CORE — operating room: dark room, operating table, overhead surgical lamp pool of light.
// Uses ART's makeORLights(scene) when available; otherwise a built-in lighting rig.
import * as THREE from 'three';

export function buildRoom(scene, art = {}) {
  const group = new THREE.Group();
  group.name = 'or-room';
  scene.add(group);

  // floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0x1a2024, roughness: 0.85, metalness: 0.05 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -90;
  floor.receiveShadow = true;
  group.add(floor);

  // operating table: top surface y = 0 (drape), steel frame under it
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.35, metalness: 0.85 });
  const drape = new THREE.MeshStandardMaterial({ color: 0x2f6f73, roughness: 0.92, metalness: 0 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(110, 3, 64), steel);
  top.position.y = -2.6;
  top.castShadow = top.receiveShadow = true;
  group.add(top);
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(104, 0.6, 60), drape);
  cloth.position.y = -0.9;
  cloth.receiveShadow = true;
  group.add(cloth);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(7, 9, 86, 24), steel);
  column.position.y = -47;
  column.castShadow = true;
  group.add(column);
  const base = new THREE.Mesh(new THREE.BoxGeometry(50, 4, 36), steel);
  base.position.y = -88;
  base.receiveShadow = true;
  group.add(base);

  // instrument tray (side) for set dressing
  const tray = new THREE.Mesh(new THREE.BoxGeometry(26, 1, 14), steel);
  tray.position.set(44, 6, -18);
  tray.castShadow = tray.receiveShadow = true;
  group.add(tray);
  const trayLegs = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 96, 10), steel);
  trayLegs.position.set(44, -42, -18);
  group.add(trayLegs);

  let lights = null;
  if (typeof art.makeORLights === 'function') {
    try { lights = art.makeORLights(scene); } catch (err) { console.warn('[core] art.makeORLights failed', err); lights = null; }
  }
  if (!lights) lights = defaultLights(group);

  return { group, lights, update() {} };
}

function defaultLights(group) {
  const hemi = new THREE.HemisphereLight(0x9fb6c8, 0x0b0d10, 0.35);
  group.add(hemi);

  // surgical lamp: a soft spot from above, slightly toward camera
  const spot = new THREE.SpotLight(0xfff6ea, 2600, 0, Math.PI / 7, 0.55, 1.6);
  spot.position.set(4, 75, 18);
  spot.target.position.set(0, 0, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.camera.near = 20;
  spot.shadow.camera.far = 140;
  spot.shadow.bias = -0.0004;
  spot.shadow.radius = 4;
  group.add(spot, spot.target);

  // lamp head (visible at top of frame edge when camera tilts)
  const head = new THREE.Mesh(
    new THREE.CylinderGeometry(14, 16, 4, 40),
    new THREE.MeshStandardMaterial({ color: 0xd9dde0, roughness: 0.4, metalness: 0.5 })
  );
  head.position.set(4, 80, 18);
  group.add(head);
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(12.5, 40),
    new THREE.MeshBasicMaterial({ color: 0xfff8ee })
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.set(4, 77.9, 18);
  group.add(lens);

  // cool fill so the room isn't pitch black
  const fill = new THREE.DirectionalLight(0x6f8faa, 0.35);
  fill.position.set(-40, 30, -30);
  group.add(fill);
  return { hemi, spot, fill, head };
}
