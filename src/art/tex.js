// LOOK: procedural photoreal texture helpers (canvas-based, cached). Tileable value-noise FBM, height->normal maps.
import * as THREE from 'three';

export function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

/** tileable value noise with integer period p (in lattice cells). returns f(x,y) in 0..1, x,y in lattice units */
export function valueNoise(seed, p) {
  const r = rng(seed), N = p * p, v = new Float32Array(N);
  for (let i = 0; i < N; i++) v[i] = r();
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
    const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p, x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
    const a = v[y0 * p + x0], b = v[y0 * p + x1], c = v[y1 * p + x0], d = v[y1 * p + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}
/** fbm field sampled at size×size, tileable. octaves start at base period. returns Float32Array 0..1-ish */
export function fbmField(size, { seed = 1, base = 4, oct = 5, gain = 0.5, sx = 1, sy = 1 } = {}) {
  const out = new Float32Array(size * size);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const p = base << o, n = valueNoise(seed * 31 + o * 7, p * Math.max(sx, sy));
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out[y * size + x] += amp * n(x / size * p * sx, y / size * p * sy);
    tot += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

export function texFromCanvas(c, { srgb = true, repeat = null, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
export function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/** height (Float32Array size×size, tileable) -> tangent-space normal map canvas */
export function heightToNormalCanvas(hgt, size, strength = 2) {
  const c = canvas(size, size), g = c.getContext('2d'), id = g.createImageData(size, size), d = id.data;
  const H = (x, y) => hgt[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(id, 0, 0); return c;
}
export function grayCanvas(f, size, map = (v) => v) {
  const c = canvas(size, size), g = c.getContext('2d'), id = g.createImageData(size, size), d = id.data;
  for (let i = 0; i < size * size; i++) { const v = Math.max(0, Math.min(255, map(f[i]) * 255)); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  g.putImageData(id, 0, 0); return c;
}

const cache = {};
/** skin micro-detail: pores + fine crease lines + soft bumps. returns {normal, rough} tileable textures (caller sets repeat via clone) */
export function skinDetail() {
  if (cache.skin) return cache.skin;
  const S = 512, h = fbmField(S, { seed: 3, base: 8, oct: 4, gain: 0.55 });
  for (let i = 0; i < h.length; i++) h[i] *= 0.35;
  const r = rng(17);
  // pores: small dimples
  for (let k = 0; k < 2600; k++) {
    const cx = r() * S, cy = r() * S, rad = 0.8 + r() * 1.6, dep = 0.25 + r() * 0.35;
    for (let y = Math.floor(cy - rad - 1); y <= cy + rad + 1; y++) for (let x = Math.floor(cx - rad - 1); x <= cx + rad + 1; x++) {
      const dd = Math.hypot(x - cx, y - cy) / rad; if (dd >= 1) continue;
      const i = ((y + S) % S) * S + ((x + S) % S); h[i] -= dep * (1 - dd * dd);
    }
  }
  // fine creases: two crossing families of thin stretched lines
  const cr = fbmField(S, { seed: 9, base: 4, oct: 3, sx: 1, sy: 6 });
  const cr2 = fbmField(S, { seed: 13, base: 4, oct: 3, sx: 6, sy: 1 });
  for (let i = 0; i < h.length; i++) {
    h[i] -= 0.22 * Math.max(0, 1 - Math.abs(cr[i] - 0.5) * 18) + 0.14 * Math.max(0, 1 - Math.abs(cr2[i] - 0.5) * 18);
  }
  const normal = texFromCanvas(heightToNormalCanvas(h, S, 3.2), { srgb: false, repeat: [1, 1] });
  const rough = texFromCanvas(grayCanvas(h, S, (v) => 0.78 - v * 0.5), { srgb: false, repeat: [1, 1] });
  return (cache.skin = { normal, rough });
}

/** nonwoven drape fabric: fibrous fine noise normal map, tileable */
export function fabricDetail() {
  if (cache.fabric) return cache.fabric;
  const S = 512, h = fbmField(S, { seed: 5, base: 16, oct: 4, gain: 0.6 });
  const r = rng(23), c2 = canvas(S, S), g = c2.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1;
  for (let k = 0; k < 2200; k++) { // random short fibres
    const x = r() * S, y = r() * S, a = r() * Math.PI, L = 6 + r() * 22;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.4) * L * 0.5, y + Math.sin(a + 0.4) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
  }
  const fd = g.getImageData(0, 0, S, S).data;
  for (let i = 0; i < h.length; i++) h[i] = h[i] * 0.6 + fd[i * 4] / 255 * 0.8;
  const normal = texFromCanvas(heightToNormalCanvas(h, S, 2.0), { srgb: false, repeat: [1, 1] });
  const albedoC = grayCanvas(h, S, (v) => 0.86 + v * 0.18);
  const albedo = texFromCanvas(albedoC, { srgb: true, repeat: [1, 1] });
  return (cache.fabric = { normal, albedo });
}

/** wet tissue: soft mottling albedo multiplier + bumpy normal + roughness with specular variation */
export function tissueDetail() {
  if (cache.tissue) return cache.tissue;
  const S = 256, h = fbmField(S, { seed: 41, base: 4, oct: 5, gain: 0.55 });
  const v = fbmField(S, { seed: 43, base: 3, oct: 4 });
  const col = canvas(S, S), g = col.getContext('2d'), id = g.createImageData(S, S), d = id.data;
  const vr = fbmField(S, { seed: 47, base: 6, oct: 2, sx: 1, sy: 3 });
  for (let i = 0; i < S * S; i++) {
    const t = 0.82 + v[i] * 0.3, vein = Math.max(0, 1 - Math.abs(vr[i] - 0.5) * 30) * 0.18; // faint serosal vessels
    d[i * 4] = Math.min(255, 255 * t * (1 - vein * 0.2)); d[i * 4 + 1] = 255 * t * (1 - vein); d[i * 4 + 2] = 255 * t * (1 - vein * 0.8); d[i * 4 + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  const map = texFromCanvas(col, { srgb: true, repeat: [2, 2] });
  const normal = texFromCanvas(heightToNormalCanvas(h, S, 1.6), { srgb: false, repeat: [2, 2] });
  const rough = texFromCanvas(grayCanvas(h, S, (x) => 0.18 + x * 0.35), { srgb: false, repeat: [2, 2] });
  return (cache.tissue = { map, normal, rough });
}

/** brushed metal roughness streaks (tileable along U) */
export function brushedDetail() {
  if (cache.brushed) return cache.brushed;
  const S = 256, f = fbmField(S, { seed: 61, base: 2, oct: 4, sx: 1, sy: 40 });
  const rough = texFromCanvas(grayCanvas(f, S, (v) => 0.18 + v * 0.28), { srgb: false, repeat: [1, 1] });
  return (cache.brushed = { rough });
}
