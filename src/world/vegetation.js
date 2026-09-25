import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { mergeGeos, paint } from '../core/geo.js';
import { WATER, MAP_HALF, PLAY_HALF } from './layout.js';

function spruceGeo(lod, rand) {
  const seg = lod ? 5 : 8;
  const parts = [paint(new THREE.CylinderGeometry(0.1, 0.22, 3, lod ? 4 : 6).translate(0, 1.5, 0), '#4a3526', 0.1, rand)];
  const layers = lod ? 3 : 6;
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const r = 2.3 * (1 - t) + 0.35;
    const h = lod ? 4.2 : 2.9;
    const y = 1.6 + t * 8.3 + h / 2;
    const cone = new THREE.ConeGeometry(r, h, seg, 1, !lod);
    cone.rotateY(rand() * Math.PI);
    cone.translate(0, y, 0);
    parts.push(paint(cone, i % 2 ? '#20391f' : '#1c3320', 0.25, rand));
  }
  return mergeGeos(parts);
}

function pineGeo(lod, rand) {
  const parts = [
    paint(new THREE.CylinderGeometry(0.14, 0.26, 6.5, lod ? 4 : 6).translate(0, 3.25, 0), '#5a3a26', 0.1, rand),
    paint(new THREE.CylinderGeometry(0.09, 0.14, 4, lod ? 4 : 5).translate(0, 8.3, 0), '#b0683c', 0.1, rand),
  ];
  const blobs = lod ? 2 : 4;
  for (let i = 0; i < blobs; i++) {
    const g = new THREE.IcosahedronGeometry(1.9 - i * 0.2, 0);
    g.scale(1.25, 0.62, 1.25);
    g.translate((rand() - 0.5) * 1.6, 8.5 + i * 0.9, (rand() - 0.5) * 1.6);
    parts.push(paint(g, i % 2 ? '#2f4a26' : '#3a5429', 0.3, rand));
  }
  return mergeGeos(parts);
}

function birchGeo(lod, rand) {
  const trunk = new THREE.CylinderGeometry(0.1, 0.18, 7.5, lod ? 4 : 6, lod ? 1 : 5).translate(0, 3.75, 0);
  const t = trunk.toNonIndexed();
  const n = t.attributes.position.count;
  const col = new Float32Array(n * 3);
  const white = new THREE.Color('#e4e0d5'), black = new THREE.Color('#2b2a26');
  for (let i = 0; i < n; i += 3) {
    const c = rand() < 0.18 ? black : white;
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
  }
  t.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const parts = [t];
  const blobs = lod ? 2 : 5;
  for (let i = 0; i < blobs; i++) {
    const g = new THREE.IcosahedronGeometry(1.5 + rand() * 0.5, lod ? 0 : 1);
    g.scale(1, 1.3, 1);
    g.translate((rand() - 0.5) * 1.8, 5.2 + i * 0.8 + rand() * 0.5, (rand() - 0.5) * 1.8);
    parts.push(paint(g, i % 2 ? '#5f8a35' : '#6d973c', 0.3, rand));
  }
  return mergeGeos(parts);
}

function bushGeo(rand) {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.IcosahedronGeometry(0.6 + rand() * 0.3, 0);
    g.scale(1, 0.8, 1);
    g.translate((rand() - 0.5) * 0.9, 0.45 + rand() * 0.2, (rand() - 0.5) * 0.9);
    parts.push(paint(g, '#3c5a2a', 0.35, rand));
  }
  return mergeGeos(parts);
}

function rockGeo(rand) {
  const g = new THREE.DodecahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const s = 0.75 + rand() * 0.5;
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.7, p.getZ(i) * s);
  }
  g.computeVertexNormals();
  return paint(g, '#77746b', 0.25, rand);
}

const TILE = 200;

export class Vegetation {
  constructor(scene, terrain, colliders, quality) {
    this.scene = scene;
    this.terrain = terrain;
    this.colliders = colliders;
    this.quality = quality;
    this.tiles = [];
  }

  build(extraExclusions = []) {
    const rand = mulberry32(777);
    const T = this.terrain;
    const types = {
      spruce: { hi: spruceGeo(false, rand), lo: spruceGeo(true, rand), items: [] },
      pine: { hi: pineGeo(false, rand), lo: pineGeo(true, rand), items: [] },
      birch: { hi: birchGeo(false, rand), lo: birchGeo(true, rand), items: [] },
      bush: { hi: bushGeo(rand), lo: null, items: [] },
      rock: { hi: rockGeo(rand), lo: null, items: [] },
    };
    this.types = types;
    const spacing = this.quality === 'high' ? 7.2 : this.quality === 'low' ? 10.5 : 8.6;
    const excluded = (x, z) => {
      for (const e of extraExclusions) {
        if (Math.abs(x - e.x) < e.hx && Math.abs(z - e.z) < e.hz) return true;
      }
      return false;
    };

    for (let gz = -MAP_HALF + 4; gz < MAP_HALF - 4; gz += spacing) {
      for (let gx = -MAP_HALF + 4; gx < MAP_HALF - 4; gx += spacing) {
        const x = gx + (rand() - 0.5) * spacing * 0.9;
        const z = gz + (rand() - 0.5) * spacing * 0.9;
        const edge = Math.max(Math.abs(x), Math.abs(z));
        let density = T.forestDensity(x, z) * 0.9 + 0.04;
        if (edge > PLAY_HALF - 25) density = 1;
        const re = T.roadEdge(x, z);
        const r0 = rand();
        if (re < 5.5) continue;
        const ci = T.cellIndex(x, z);
        if (T.padW[ci] > 0.02) continue;
        if (T.inField(x, z)) continue;
        if (excluded(x, z)) continue;
        const y = T.heightAt(x, z);
        if (y < WATER + 0.9) continue;
        if (r0 > density) {
          // open ground: occasional bush or rock
          if (r0 < density + 0.05 && re > 7) types.bush.items.push({ x, y, z, s: 0.7 + rand() * 0.8, r: rand() * 6.28 });
          else if (r0 > 0.985) types.rock.items.push({ x, y: y - 0.3, z, s: 0.6 + rand() * 1.6, r: rand() * 6.28 });
          continue;
        }
        const nrm = T.normalAt(x, z);
        if (nrm.y < 0.8) { if (rand() < 0.3) types.rock.items.push({ x, y: y - 0.4, z, s: 1 + rand() * 1.8, r: rand() * 6.28 }); continue; }
        // species by moisture / height
        const wet = y < 6 ? 0.35 : 0;
        const pick = rand() + wet * 0.5;
        const kind = pick < 0.52 ? 'spruce' : pick < 0.8 ? 'pine' : 'birch';
        const s = kind === 'birch' ? 0.8 + rand() * 0.6 : 0.75 + rand() * 0.95;
        types[kind].items.push({ x, y: y - 0.1, z, s, r: rand() * 6.28 });
        if (re > 3 && rand() < 0.08) types.bush.items.push({ x: x + 2, y: T.heightAt(x + 2, z), z, s: 0.7 + rand() * 0.6, r: rand() * 6.28 });
        this.colliders.addTree(x, z, (kind === 'birch' ? 0.18 : 0.26) * s, 6 * s, y - 0.5);
      }
    }
    // rocks: big glacial boulders get colliders
    for (const it of types.rock.items) if (it.s > 1.1) this.colliders.addTree(it.x, it.z, it.s * 0.85, it.s * 1.2, it.y - 1);

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true });
    this.material = mat;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const tilesPerSide = Math.ceil((MAP_HALF * 2) / TILE);
    for (const [name, t] of Object.entries(types)) {
      const buckets = new Map();
      for (const it of t.items) {
        const tx = Math.floor((it.x + MAP_HALF) / TILE), tz = Math.floor((it.z + MAP_HALF) / TILE);
        const k = tx * tilesPerSide + tz;
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(it);
      }
      for (const [k, list] of buckets) {
        const cx = Math.floor(k / tilesPerSide) * TILE - MAP_HALF + TILE / 2;
        const cz = (k % tilesPerSide) * TILE - MAP_HALF + TILE / 2;
        const make = (geo) => {
          const m = new THREE.InstancedMesh(geo, mat, list.length);
          list.forEach((it, i) => {
            dummy.position.set(it.x, it.y, it.z);
            dummy.rotation.set(0, it.r, 0);
            dummy.scale.setScalar(it.s);
            dummy.updateMatrix();
            m.setMatrixAt(i, dummy.matrix);
            const v = 0.85 + ((it.x * 13.7 + it.z * 7.3) % 1 + 1) % 1 * 0.3;
            m.setColorAt(i, color.setRGB(v, v, v * 0.95));
          });
          m.instanceMatrix.needsUpdate = true;
          if (m.instanceColor) m.instanceColor.needsUpdate = true;
          m.computeBoundingSphere();
          m.castShadow = false;
          m.receiveShadow = true;
          this.scene.add(m);
          return m;
        };
        const tile = { name, cx, cz, hi: make(t.hi), lo: t.lo ? make(t.lo) : null, big: name !== 'bush' };
        if (tile.lo) tile.lo.visible = false;
        this.tiles.push(tile);
      }
    }
    this.count = types.spruce.items.length + types.pine.items.length + types.birch.items.length;
  }

  update(camPos, shadowsOn) {
    const loDist = this.quality === 'high' ? 330 : 240;
    const shadowDist = this.quality === 'low' ? 0 : 150;
    for (const t of this.tiles) {
      const dx = Math.max(Math.abs(camPos.x - t.cx) - TILE / 2, 0);
      const dz = Math.max(Math.abs(camPos.z - t.cz) - TILE / 2, 0);
      const d = Math.hypot(dx, dz);
      const far = d > 700;
      const useLo = t.lo && d > loDist;
      t.hi.visible = !far && !useLo && !(t.name === 'bush' && d > 260) && !(t.name === 'rock' && d > 400);
      if (t.lo) t.lo.visible = !far && useLo;
      t.hi.castShadow = shadowsOn && t.big && d < shadowDist;
    }
  }
}
