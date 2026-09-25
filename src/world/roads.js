import * as THREE from 'three';
import { asphaltTexture, gravelTexture } from '../core/textures.js';

// Samples a Catmull-Rom spline through control points every `step` metres.
export function sampleRoad(def, step = 2) {
  const pts = def.pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts, !!def.closed, 'centripetal', 0.5);
  const length = curve.getLength();
  const n = Math.max(4, Math.round(length / step));
  const raw = curve.getSpacedPoints(n);
  if (def.closed) raw.pop(); // last equals first
  const samples = raw.map((p) => ({ x: p.x, z: p.z, y: 0, tx: 0, tz: 1, s: 0 }));
  let s = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i];
    const prev = samples[def.closed ? (i - 1 + samples.length) % samples.length : Math.max(0, i - 1)];
    const next = samples[def.closed ? (i + 1) % samples.length : Math.min(samples.length - 1, i + 1)];
    let tx = next.x - prev.x, tz = next.z - prev.z;
    const l = Math.hypot(tx, tz) || 1;
    a.tx = tx / l; a.tz = tz / l;
    if (i > 0) s += Math.hypot(a.x - samples[i - 1].x, a.z - samples[i - 1].z);
    a.s = s;
  }
  const total = def.closed ? s + Math.hypot(samples[0].x - samples[samples.length - 1].x, samples[0].z - samples[samples.length - 1].z) : s;
  return { ...def, samples, length: total };
}

// Nearest sample index on a sampled road.
export function nearestSample(road, x, z) {
  let best = 0, bd = Infinity;
  const ss = road.samples;
  for (let i = 0; i < ss.length; i++) {
    const dx = ss[i].x - x, dz = ss[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return { index: best, dist: Math.sqrt(bd) };
}

// Smooth an elevation profile, keeping the ends pinned where the road joins something.
export function smoothProfile(values, radius, passes, pinStart, pinEnd, closed) {
  const n = values.length;
  const orig = values.slice();
  let cur = values.slice();
  for (let p = 0; p < passes; p++) {
    const next = new Float32Array(n);
    // prefix sums for box filter
    for (let i = 0; i < n; i++) {
      let sum = 0, cnt = 0;
      for (let k = -radius; k <= radius; k++) {
        let j = i + k;
        if (closed) j = (j + n) % n; else if (j < 0 || j >= n) continue;
        sum += cur[j]; cnt++;
      }
      next[i] = sum / cnt;
    }
    if (pinStart) for (let i = 0; i < Math.min(pinStart, n); i++) next[i] = orig[i];
    if (pinEnd) for (let i = Math.max(0, n - pinEnd); i < n; i++) next[i] = orig[i];
    cur = Array.from(next);
  }
  return cur;
}

// Builds the road ribbon and its gravel shoulders, following the baked terrain.
export function buildRoadMeshes(road, terrain) {
  const group = new THREE.Group();
  const ss = road.samples;
  const n = ss.length;
  const loop = road.closed;
  const hw = road.hw;
  const surfOff = road.type === 'asphalt' ? 0.05 : 0.035;

  const cross = [-hw, -hw * 0.5, 0, hw * 0.5, hw];
  const shoulderCross = [-hw - 1.1, -hw + 0.05, hw - 0.05, hw + 1.1];

  const makeStrip = (offsets, yFn, uFn, tile) => {
    const cols = offsets.length;
    const rows = loop ? n + 1 : n;
    const pos = new Float32Array(rows * cols * 3);
    const uv = new Float32Array(rows * cols * 2);
    for (let r = 0; r < rows; r++) {
      const smp = ss[r % n];
      const sAlong = r === n ? road.length : smp.s;
      const nx = -smp.tz, nz = smp.tx; // left normal
      for (let c = 0; c < cols; c++) {
        const o = offsets[c];
        const x = smp.x + nx * o, z = smp.z + nz * o;
        const k = (r * cols + c);
        pos[k * 3] = x; pos[k * 3 + 1] = yFn(x, z, c); pos[k * 3 + 2] = z;
        uv[k * 2] = uFn(c); uv[k * 2 + 1] = sAlong / tile;
      }
    }
    const idx = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
        idx.push(a, b, d, b, e, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  };

  const surfGeo = makeStrip(cross, (x, z) => terrain.heightAt(x, z) + surfOff, (c) => c / (cross.length - 1), road.type === 'asphalt' ? 12 : 8);
  const tex = road.type === 'asphalt' ? asphaltTexture() : gravelTexture();
  const surfMat = new THREE.MeshStandardMaterial({
    map: tex, roughness: road.type === 'asphalt' ? 0.82 : 0.97, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: road.type === 'asphalt' ? -4 : -2, polygonOffsetUnits: road.type === 'asphalt' ? -4 : -2,
  });
  const surf = new THREE.Mesh(surfGeo, surfMat);
  surf.receiveShadow = true;
  group.add(surf);

  // shoulders: two separate strips (left and right)
  const shMat = new THREE.MeshStandardMaterial({ map: gravelTexture(), color: 0xb5ab98, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  for (const side of [-1, 1]) {
    const offs = side < 0 ? [shoulderCross[0], shoulderCross[1]] : [shoulderCross[2], shoulderCross[3]];
    const g = makeStrip(offs, (x, z, c) => {
      const outer = side < 0 ? c === 0 : c === 1;
      return terrain.heightAt(x, z) + (outer ? 0.02 : surfOff - 0.01);
    }, (c) => c * 0.25, 8);
    const m = new THREE.Mesh(g, shMat);
    m.receiveShadow = true;
    group.add(m);
  }
  group.name = 'road:' + road.id;
  return group;
}
