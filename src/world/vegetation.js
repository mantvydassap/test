import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { mergeGeos, paint } from '../core/geo.js';
import { WATER, MAP_HALF, PLAY_HALF } from './layout.js';
import { spruceAtlas, pineAtlas, birchAtlas, toBarkUV, toFoliageUV, card, twoSidedLighting } from './foliage.js';

// White vertex colour with a little jitter: the atlas supplies the real colour.
const tint = (g, rand, j = 0.18) => paint(g, '#ffffff', j, rand);

function spruceGeo(lod, rand) {
  const parts = [tint(toBarkUV(new THREE.CylinderGeometry(0.09, 0.22, 10, lod ? 4 : 6).translate(0, 5, 0)), rand, 0.05)];
  const layers = lod ? 4 : 8;
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const r = 2.5 * (1 - t) + 0.3;
    const h = (lod ? 3.4 : 2.4) + (1 - t) * 0.6;
    const y = 1.3 + t * 8.6 + h / 2;
    const cone = new THREE.ConeGeometry(r, h, lod ? 6 : 9, 1, true);
    cone.rotateY(rand() * Math.PI * 2);
    cone.translate(0, y, 0);
    parts.push(tint(toFoliageUV(cone), rand));
  }
  const top = new THREE.ConeGeometry(0.35, 1.4, 5, 1, true).translate(0, 11.1, 0);
  parts.push(tint(toFoliageUV(top), rand));
  return mergeGeos(parts);
}

function pineGeo(lod, rand) {
  const parts = [
    tint(toBarkUV(new THREE.CylinderGeometry(0.14, 0.26, 6.5, lod ? 4 : 6).translate(0, 3.25, 0)), rand, 0.05),
    tint(toBarkUV(new THREE.CylinderGeometry(0.08, 0.14, 4.5, lod ? 4 : 5).translate(0, 8.5, 0)), rand, 0.05),
  ];
  const centre = new THREE.Vector3(0, 9.6, 0);
  const n = lod ? 5 : 12;
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2, r = rand() * 1.4;
    parts.push(tint(card(3.0 + rand(), 1.9 + rand() * 0.6, Math.cos(a) * r, 8.4 + rand() * 2.6, Math.sin(a) * r, rand() * Math.PI, (rand() - 0.5) * 0.9, centre), rand, 0.25));
  }
  return mergeGeos(parts);
}

function birchGeo(lod, rand) {
  const parts = [tint(toBarkUV(new THREE.CylinderGeometry(0.09, 0.17, 8, lod ? 4 : 6).translate(0, 4, 0)), rand, 0.04)];
  const centre = new THREE.Vector3(0, 6.6, 0);
  const n = lod ? 6 : 14;
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2, r = rand() * 1.3;
    parts.push(tint(card(2.4 + rand() * 0.8, 2.6 + rand() * 0.8, Math.cos(a) * r, 5.0 + rand() * 3.6, Math.sin(a) * r, rand() * Math.PI, (rand() - 0.5) * 0.7, centre), rand, 0.22));
  }
  return mergeGeos(parts);
}

function bushGeo(rand) {
  const parts = [];
  const centre = new THREE.Vector3(0, 0.3, 0);
  for (let i = 0; i < 4; i++) {
    parts.push(tint(card(1.4 + rand() * 0.5, 1.1 + rand() * 0.4, (rand() - 0.5) * 0.5, 0.55, (rand() - 0.5) * 0.5, (i / 4) * Math.PI, 0, centre), rand, 0.3));
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

    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true });
    const leafMat = (map) => {
      const m = twoSidedLighting(new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.95, metalness: 0, alphaTest: 0.45, side: THREE.DoubleSide }));
      m.userData.depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.45, side: THREE.DoubleSide });
      return m;
    };
    const birchMat = leafMat(birchAtlas());
    const mats = { spruce: leafMat(spruceAtlas()), pine: leafMat(pineAtlas()), birch: birchMat, bush: birchMat, rock: rockMat };
    this.material = rockMat;
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
          const mat = mats[name];
          const m = new THREE.InstancedMesh(geo, mat, list.length);
          if (mat.userData.depth) m.customDepthMaterial = mat.userData.depth;
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
