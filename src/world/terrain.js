import * as THREE from 'three';
import { makeNoise2D, fbm } from '../core/noise.js';
import { smoothstep, lerp, clamp, distToSegment2 } from '../core/math.js';
import { WATER, MAP_HALF, LAKES, PADS, FIELDS, ROADS } from './layout.js';
import { sampleRoad, nearestSample, smoothProfile } from './roads.js';
import { grassTexture } from '../core/textures.js';

const CELL = 2;
const N = (MAP_HALF * 2) / CELL;
const S = N + 1;

const nextFrame = () => new Promise((r) => setTimeout(r, 0));

export class Terrain {
  constructor() {
    this.n1 = makeNoise2D(101);
    this.n2 = makeNoise2D(202);
    this.n3 = makeNoise2D(303);
    this.n4 = makeNoise2D(404);
    this.n5 = makeNoise2D(505);
    this.base = new Float32Array(S * S);
    this.h = new Float32Array(S * S);
    this.rEdge = new Float32Array(S * S).fill(1e9);
    this.rElev = new Float32Array(S * S);
    this.rType = new Uint8Array(S * S);
    this.padW = new Float32Array(S * S);
    this.roads = [];
    this.lakes = LAKES.map((l) => ({ ...l, noise: makeNoise2D(1000 + l.seed) }));
    this.pads = PADS.map((p) => ({ ...p }));
  }

  natural(x, z) {
    let h = 9 + fbm(this.n1, x * 0.0011, z * 0.0011, 4) * 32 + fbm(this.n2, x * 0.0047, z * 0.0047, 3) * 5 + this.n3(x * 0.035, z * 0.035) * 0.3;
    if (h < 3) h = 3 - (3 - h) * 0.08;
    const e = Math.max(Math.abs(x), Math.abs(z));
    if (e > 690) h += (e - 690) * 0.4;
    return h;
  }

  lakeRadius(lake, x, z) {
    const a = Math.atan2(z - lake.z, x - lake.x);
    return lake.r * (1 + lake.wobble * lake.noise(Math.cos(a) * 1.3 + lake.seed, Math.sin(a) * 1.3));
  }

  lakeSigned(lake, x, z) {
    const d = Math.hypot(x - lake.x, z - lake.z);
    return d - this.lakeRadius(lake, x, z);
  }

  withLakes(x, z, h) {
    for (const lake of this.lakes) {
      const d = this.lakeSigned(lake, x, z);
      if (d < 110) {
        if (d < 0) {
          h = Math.max(WATER - 7, WATER + d * 0.16);
        } else {
          const w = 1 - smoothstep(0, 110, d);
          h = lerp(h, WATER + 0.15 + d * 0.05, w);
        }
      }
    }
    return h;
  }

  padInfluence(x, z, h) {
    let pw = 0;
    for (const p of this.pads) {
      const dx = Math.max(Math.abs(x - p.x) - p.hx, 0);
      const dz = Math.max(Math.abs(z - p.z) - p.hz, 0);
      const od = Math.hypot(dx, dz);
      if (od < p.blend) {
        const w = 1 - smoothstep(0, p.blend, od);
        h = lerp(h, p.h, w);
        pw = Math.max(pw, w);
      }
    }
    return { h, pw };
  }

  forestDensity(x, z) {
    const n = fbm(this.n4, x * 0.0032, z * 0.0032, 3);
    return smoothstep(-0.28, 0.2, n);
  }

  inField(x, z) {
    for (const f of FIELDS) if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1) return f;
    return null;
  }

  async bake(progress = () => {}) {
    // Plot heights first, sampled from the lake-shaped terrain.
    for (const p of this.pads) {
      if (p.h === 'auto') {
        let sum = 0, cnt = 0;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          const x = p.x + dx * p.hx * 0.5, z = p.z + dz * p.hz * 0.5;
          sum += this.withLakes(x, z, this.natural(x, z)); cnt++;
        }
        p.h = Math.max(WATER + 2.2, sum / cnt);
      }
    }

    // 1. Base terrain.
    for (let iz = 0; iz < S; iz++) {
      const z = iz * CELL - MAP_HALF;
      for (let ix = 0; ix < S; ix++) {
        const x = ix * CELL - MAP_HALF;
        let h = this.withLakes(x, z, this.natural(x, z));
        const r = this.padInfluence(x, z, h);
        const i = iz * S + ix;
        this.base[i] = r.h;
        this.padW[i] = r.pw;
      }
      if ((iz & 63) === 0) { progress(0.05 + 0.35 * iz / S); await nextFrame(); }
    }
    this.h.set(this.base);

    // 2. Roads: the highway first, then the branches that join it.
    const defs = ROADS.map((d) => ({ ...d, pts: d.pts.map((p) => p.slice()) }));
    const highwayDef = defs.find((d) => d.id === 'highway');
    const highway = sampleRoad(highwayDef);
    this.profileRoad(highway, 0, 0);
    this.rasterRoad(highway);
    this.composeHeights();
    this.roads.push(highway);
    progress(0.5); await nextFrame();

    for (const d of defs) {
      if (d.id === 'highway') continue;
      if (d.joinEnd === 'highway') {
        const last = d.pts[d.pts.length - 1];
        const ns = nearestSample(highway, last[0], last[1]);
        const hs = highway.samples[ns.index];
        d.pts[d.pts.length - 1] = [hs.x, hs.z];
      }
      const road = sampleRoad(d);
      this.profileRoad(road, 6, d.joinEnd ? 6 : 0);
      this.rasterRoad(road);
      this.roads.push(road);
    }
    this.composeHeights();
    progress(0.62); await nextFrame();
  }

  profileRoad(road, pinStart, pinEnd) {
    const vals = road.samples.map((s) => Math.max(WATER + 1.2, this.heightAt(s.x, s.z)));
    const sm = smoothProfile(vals, 10, 5, pinStart, pinEnd, road.closed);
    road.samples.forEach((s, i) => { s.y = sm[i]; });
  }

  rasterRoad(road) {
    const ss = road.samples;
    const n = ss.length;
    const segs = road.closed ? n : n - 1;
    const R = road.hw + 16;
    const type = road.type === 'asphalt' ? 1 : 2;
    for (let i = 0; i < segs; i++) {
      const a = ss[i], b = ss[(i + 1) % n];
      const minX = Math.min(a.x, b.x) - R, maxX = Math.max(a.x, b.x) + R;
      const minZ = Math.min(a.z, b.z) - R, maxZ = Math.max(a.z, b.z) + R;
      const ix0 = Math.max(0, Math.floor((minX + MAP_HALF) / CELL)), ix1 = Math.min(N, Math.ceil((maxX + MAP_HALF) / CELL));
      const iz0 = Math.max(0, Math.floor((minZ + MAP_HALF) / CELL)), iz1 = Math.min(N, Math.ceil((maxZ + MAP_HALF) / CELL));
      for (let iz = iz0; iz <= iz1; iz++) {
        const z = iz * CELL - MAP_HALF;
        for (let ix = ix0; ix <= ix1; ix++) {
          const x = ix * CELL - MAP_HALF;
          const r = distToSegment2(x, z, a.x, a.z, b.x, b.z);
          const e = r.d - road.hw;
          const idx = iz * S + ix;
          if (e < this.rEdge[idx]) {
            this.rEdge[idx] = e;
            this.rElev[idx] = a.y + (b.y - a.y) * r.t;
            this.rType[idx] = type;
          }
        }
      }
    }
  }

  composeHeights() {
    const { base, rEdge, rElev, padW, h } = this;
    for (let i = 0; i < base.length; i++) {
      let v = base[i];
      const e = rEdge[i];
      if (e < 16) {
        const w = 1 - smoothstep(1.0, 14, e);
        v = v + (rElev[i] - v) * w;
        if (e > 0.9 && e < 5) v -= Math.sin(((e - 0.9) / 4.1) * Math.PI) * 0.42 * (1 - padW[i]);
      }
      h[i] = v;
    }
  }

  heightAt(x, z) {
    let fx = (x + MAP_HALF) / CELL, fz = (z + MAP_HALF) / CELL;
    fx = clamp(fx, 0, N - 1e-4); fz = clamp(fz, 0, N - 1e-4);
    const ix = fx | 0, iz = fz | 0;
    const tx = fx - ix, tz = fz - iz;
    const i = iz * S + ix;
    const h = this.h;
    const a = h[i] + (h[i + 1] - h[i]) * tx;
    const b = h[i + S] + (h[i + S + 1] - h[i + S]) * tx;
    return a + (b - a) * tz;
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 1.0;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  cellIndex(x, z) {
    const ix = clamp(Math.round((x + MAP_HALF) / CELL), 0, N);
    const iz = clamp(Math.round((z + MAP_HALF) / CELL), 0, N);
    return iz * S + ix;
  }

  roadEdge(x, z) { return this.rEdge[this.cellIndex(x, z)]; }

  // Surface under a point: used for grip, dust and footstep sounds.
  surfaceAt(x, z) {
    const i = this.cellIndex(x, z);
    if (this.rEdge[i] < 0.4) return this.rType[i] === 1 ? 'asphalt' : 'gravel';
    const h = this.heightAt(x, z);
    if (h < WATER - 0.3) return 'water';
    if (h < WATER + 0.5) return 'sand';
    if (this.inField(x, z)) return 'field';
    return 'grass';
  }

  waterDepth(x, z) { return WATER - this.heightAt(x, z); }

  buildMeshes(scene, quality) {
    const step = 2; // every second sample: 4 m quads
    const CH = 8;   // chunks per side
    const cellsPerChunk = N / step / CH; // 50
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: grassTexture(), roughness: 0.96, metalness: 0 });
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D( map, vMapUv );
          vec4 macro = texture2D( map, vMapUv * 0.137 + vec2(0.31, 0.77) );
          sampledDiffuseColor.rgb *= mix(0.78, 1.22, macro.g);
          diffuseColor *= sampledDiffuseColor;
        #endif
      `);
    };
    this.material = mat;

    const cols = {
      grassA: new THREE.Color('#5f7d39'), grassB: new THREE.Color('#7f9446'), dry: new THREE.Color('#978f58'),
      forest: new THREE.Color('#3e4f28'), moss: new THREE.Color('#566b30'), rock: new THREE.Color('#6f6c62'),
      sand: new THREE.Color('#9c8a62'), mud: new THREE.Color('#4c4330'), shoulder: new THREE.Color('#7c7159'),
      yard: new THREE.Color('#6d7f3d'), fieldGold: new THREE.Color('#c7ae55'), fieldGreen: new THREE.Color('#8aa845'),
    };
    const tmp = new THREE.Color();
    const nrm = new THREE.Vector3();
    this.chunks = [];

    for (let cz = 0; cz < CH; cz++) {
      for (let cx = 0; cx < CH; cx++) {
        const vx = cellsPerChunk + 1;
        const pos = new Float32Array(vx * vx * 3);
        const col = new Float32Array(vx * vx * 3);
        const nor = new Float32Array(vx * vx * 3);
        const uv = new Float32Array(vx * vx * 2);
        for (let j = 0; j < vx; j++) {
          for (let i = 0; i < vx; i++) {
            const gx = (cx * cellsPerChunk + i) * step;
            const gz = (cz * cellsPerChunk + j) * step;
            const x = gx * CELL - MAP_HALF, z = gz * CELL - MAP_HALF;
            const gi = gz * S + gx;
            let y = this.h[gi];
            const e = this.rEdge[gi];
            if (e < 1.2) y -= 0.35;
            const k = j * vx + i;
            pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
            this.normalAt(x, z, nrm);
            nor[k * 3] = nrm.x; nor[k * 3 + 1] = nrm.y; nor[k * 3 + 2] = nrm.z;
            uv[k * 2] = x / 7; uv[k * 2 + 1] = z / 7;

            // colour
            const n = this.n5(x * 0.02, z * 0.02) * 0.5 + 0.5;
            tmp.copy(cols.grassA).lerp(cols.grassB, n);
            const dryN = smoothstep(0.35, 0.8, this.n2(x * 0.004, z * 0.004));
            tmp.lerp(cols.dry, dryN * 0.45);
            const fd = this.forestDensity(x, z);
            if (fd > 0) tmp.lerp(this.n3(x * 0.05, z * 0.05) > 0.2 ? cols.moss : cols.forest, fd * 0.8 * (1 - this.padW[gi]));
            const slope = 1 - nrm.y;
            if (slope > 0.12) tmp.lerp(cols.rock, smoothstep(0.12, 0.3, slope));
            if (y < WATER + 0.7) tmp.lerp(cols.sand, smoothstep(WATER + 0.7, WATER + 0.1, y));
            if (y < WATER - 0.5) tmp.lerp(cols.mud, smoothstep(WATER - 0.5, WATER - 2.5, y));
            if (this.padW[gi] > 0.6) tmp.lerp(cols.yard, 0.5);
            const fld = this.inField(x, z);
            if (fld) {
              const edgeD = Math.min(x - fld.x0, fld.x1 - x, z - fld.z0, fld.z1 - z);
              tmp.lerp(fld.color === 0 ? cols.fieldGold : cols.fieldGreen, smoothstep(0, 4, edgeD) * (0.8 + 0.2 * Math.sin(x * 0.9)));
            }
            if (e < 3.2) tmp.lerp(cols.shoulder, smoothstep(3.2, 0.5, e) * 0.9);
            col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
          }
        }
        const idx = [];
        for (let j = 0; j < vx - 1; j++) {
          for (let i = 0; i < vx - 1; i++) {
            const a = j * vx + i, b = a + 1, c = a + vx, d = c + 1;
            idx.push(a, c, b, b, c, d);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeBoundingBox(); g.computeBoundingSphere();
        const m = new THREE.Mesh(g, mat);
        m.receiveShadow = true;
        m.name = 'terrain';
        scene.add(m);
        this.chunks.push(m);
      }
    }

    // A wide low ring beyond the map so the horizon is never empty.
    const ringGeo = new THREE.RingGeometry(MAP_HALF * 0.985, 4200, 64, 6);
    ringGeo.rotateX(-Math.PI / 2);
    const rp = ringGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const x = rp.getX(i), z = rp.getZ(i);
      const d = Math.hypot(x, z);
      rp.setY(i, 40 + Math.sin(x * 0.004) * 8 + Math.cos(z * 0.005) * 7 + (d - MAP_HALF) * 0.012);
    }
    ringGeo.computeVertexNormals();
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0x2c3a22, roughness: 1 }));
    scene.add(ring);
  }
}

export { CELL, N, S };
