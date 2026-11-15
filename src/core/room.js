// CORE — operating room: dark room, operating table, overhead surgical lamp pool of light.
// Uses ART's makeORLights(scene) when available; otherwise a built-in lighting rig.
import * as THREE from 'three';

export function buildRoom(scene, art = {}) {
  const group = new THREE.Group();
  group.name = 'or-room';
  scene.add(group);
  // furniture modelled in cm, scaled to world units (1 unit = 10 cm)
  const cm = new THREE.Group();
  cm.scale.setScalar(0.1);
  group.add(cm);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshStandardMaterial({ color: 0x15191c, roughness: 0.55, metalness: 0.1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -90;
  floor.receiveShadow = true;
  cm.add(floor);

  // operating table: top surface at y = 0 (under the drape), steel frame under it
  const steel = new THREE.MeshStandardMaterial({ color: 0xa9b1b8, roughness: 0.3, metalness: 1 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(110, 4, 64), steel);
  top.position.y = -3;
  top.castShadow = top.receiveShadow = true;
  cm.add(top);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(112, 1.2, 1.2), steel);
  for (const z of [-32.6, 32.6]) { const r = rail.clone(); r.position.set(0, -2, z); cm.add(r); }
  const column = new THREE.Mesh(new THREE.CylinderGeometry(7, 9, 84, 24), steel);
  column.position.y = -47;
  column.castShadow = true;
  cm.add(column);
  const base = new THREE.Mesh(new THREE.BoxGeometry(50, 4, 36), steel);
  base.position.y = -88;
  base.receiveShadow = true;
  cm.add(base);

  // drape over the table (ART's textured drape if available)
  let drape = null;
  if (typeof art.makeDrape === 'function') {
    try { drape = art.makeDrape(11.4, 6.8); } catch (err) { console.warn('[core] art.makeDrape failed', err); }
  }
  if (!drape) {
    drape = new THREE.Mesh(new THREE.PlaneGeometry(11.4, 6.8),
      new THREE.MeshStandardMaterial({ color: 0x3e6e8e, roughness: 0.95 }));
    drape.rotation.x = -Math.PI / 2;
    drape.receiveShadow = true;
  }
  drape.position.y = -0.008;
  group.add(drape);

  let lights = null;
  if (typeof art.makeORLights === 'function') {
    try { lights = art.makeORLights(scene); } catch (err) { console.warn('[core] art.makeORLights failed', err); lights = null; }
  }
  if (!lights) lights = defaultLights(group);
  else addLampHead(group);

  addVignette();
  return { group, drape, lights, update() {} };
}

// visible surgical lamp head above the table (decor; light comes from ART/default spot)
function addLampHead(group) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.4, 40),
    new THREE.MeshStandardMaterial({ color: 0xd9dde0, roughness: 0.4, metalness: 0.5 }));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(1.25, 40), new THREE.MeshBasicMaterial({ color: 0xfff8ee }));
  lens.rotation.x = Math.PI / 2;
  lens.position.y = -0.21;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 12),
    new THREE.MeshStandardMaterial({ color: 0xb0b8c0, roughness: 0.4, metalness: 0.7 }));
  arm.position.y = 2.2;
  g.add(head, lens, arm);
  g.position.set(1.2, 9.4, 2.2);
  group.add(g);
  return g;
}

/** Dark OR environment for reflections: black room, one bright overhead lamp panel, faint wall strips. */
export function makeEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x05070a);
  const box = new THREE.Mesh(new THREE.BoxGeometry(100, 60, 100),
    new THREE.MeshBasicMaterial({ color: 0x0c1116, side: THREE.BackSide }));
  env.add(box);
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(14, 32), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  lamp.material.color.setScalar(6);
  lamp.rotation.x = Math.PI / 2; lamp.position.y = 29;
  env.add(lamp);
  for (const [x, z, ry] of [[-49, 0, Math.PI / 2], [49, 0, -Math.PI / 2], [0, -49, 0]]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(40, 3), new THREE.MeshBasicMaterial({ color: 0x8fb4c8 }));
    strip.material.color.multiplyScalar(1.2);
    strip.position.set(x, 18, z); strip.rotation.y = ry;
    env.add(strip);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  env.traverse((o) => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); });
  return tex;
}

function defaultLights(group) {
  const hemi = new THREE.HemisphereLight(0x9fb6c8, 0x0b0d10, 0.18);
  group.add(hemi);

  // surgical lamp: a soft spot from above, slightly toward camera
  const spot = new THREE.SpotLight(0xfff6ea, 60, 0, Math.PI / 9, 0.7, 1.7);
  spot.position.set(0.4, 7.5, 1.8);
  spot.target.position.set(0, 0, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.camera.near = 2;
  spot.shadow.camera.far = 14;
  spot.shadow.bias = -0.0004;
  spot.shadow.radius = 4;
  group.add(spot, spot.target);

  const head = addLampHead(group);

  // cool fill so the room isn't pitch black
  const fill = new THREE.DirectionalLight(0x6f8faa, 0.35);
  fill.position.set(-4, 3, -3);
  group.add(fill);
  return { hemi, spot, fill, head };
}

// LOOK: gentle screen-space vignette (DOM overlay above the canvas, below the UI)
function addVignette() {
  if (typeof document === 'undefined' || document.getElementById('sh-vignette')) return;
  const v = document.createElement('div');
  v.id = 'sh-vignette';
  v.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:0;' +
    'background:radial-gradient(ellipse 75% 70% at 50% 48%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.38) 100%);';
  const ui = document.getElementById('ui');
  if (ui && ui.parentNode) ui.parentNode.insertBefore(v, ui); else document.body.appendChild(v);
}
