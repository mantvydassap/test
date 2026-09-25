import * as THREE from 'three';
import { WATER } from './layout.js';
import { grassClumpTexture, twoSidedLighting } from './foliage.js';

// Grass tufts in a patch that follows the player. Instances are re-seeded
// from world-cell hashes, so the same spot always has the same grass.
const PATCH = 64;      // metres across
const STEP = 0.9;      // spacing between tufts

// Three crossed cards carrying a painted grass-clump texture.
function tuftGeometry() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.PlaneGeometry(0.62, 0.46);
    g.translate(0, 0.23, 0);
    g.rotateY((i / 3) * Math.PI);
    parts.push(g.toNonIndexed());
  }
  const pos = [], uv = [], nor = [];
  for (const g of parts) {
    pos.push(...g.attributes.position.array);
    uv.push(...g.attributes.uv.array);
    for (let k = 0; k < g.attributes.position.count; k++) nor.push(0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

function hash(x, z) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Grass {
  constructor(scene, terrain, colliders, quality) {
    this.terrain = terrain;
    this.colliders = colliders;
    this.enabled = quality !== 'low';
    const n = Math.ceil(PATCH / STEP);
    this.max = n * n;
    this.uniforms = { uTime: { value: 0 } };
    const mat = new THREE.MeshStandardMaterial({ map: grassClumpTexture(), alphaTest: 0.4, roughness: 0.95, side: THREE.DoubleSide });
    twoSidedLighting(mat, (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sway = sin(uTime * 1.7 + wp.x * 0.35 + wp.z * 0.21) * 0.06 + sin(uTime * 3.1 + wp.z * 0.7) * 0.02;
          transformed.x += sway * position.y * 2.0;
          transformed.z += sway * position.y * 1.2;
        #endif
      `);
    });
    this.mesh = new THREE.InstancedMesh(tuftGeometry(), mat, this.max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = false;
    this.mesh.visible = this.enabled;
    scene.add(this.mesh);
    this.center = new THREE.Vector2(1e9, 1e9);
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
  }

  update(dt, pos) {
    if (!this.enabled) return;
    this.uniforms.uTime.value += dt;
    if (Math.hypot(pos.x - this.center.x, pos.z - this.center.y) < 10) return;
    this.center.set(pos.x, pos.z);
    this.rebuild();
  }

  rebuild() {
    const T = this.terrain;
    const C = this.colliders;
    const d = this.dummy;
    let i = 0;
    const x0 = Math.floor((this.center.x - PATCH / 2) / STEP), z0 = Math.floor((this.center.y - PATCH / 2) / STEP);
    const n = Math.ceil(PATCH / STEP);
    for (let gz = z0; gz < z0 + n; gz++) {
      for (let gx = x0; gx < x0 + n; gx++) {
        const r = hash(gx, gz);
        if (r < 0.2) continue;
        const x = (gx + hash(gz, gx) * 0.9) * STEP, z = (gz + hash(gx + 7, gz - 3) * 0.9) * STEP;
        const surf = T.surfaceAt(x, z);
        if (surf !== 'grass' && surf !== 'field') continue;
        if (T.roadEdge(x, z) < 1.4) continue;
        const y = T.heightAt(x, z);
        if (y < WATER + 0.3) continue;
        if (C.surfaceHeight(x, z, y + 5) > y + 0.002) continue; // floors, decks
        const nrm = T.normalAt(x, z);
        if (nrm.y < 0.82) continue;
        const fd = T.forestDensity(x, z);
        if (fd > 0.75 && r < 0.6) continue;
        d.position.set(x, y - 0.02, z);
        d.rotation.set(0, r * 6.28, 0);
        const s = surf === 'field' ? 1.5 + r * 0.4 : 0.6 + r * 0.6;
        d.scale.set(s, s * (surf === 'field' ? 1.3 : 1), s);
        d.updateMatrix();
        this.mesh.setMatrixAt(i, d.matrix);
        const v = 0.8 + hash(gx * 3, gz * 5) * 0.35;
        if (surf === 'field') this.color.setRGB(1.35 * v, 1.15 * v, 0.55 * v);
        else this.color.setRGB(v, v, v * 0.9);
        this.mesh.setColorAt(i, this.color);
        i++;
        if (i >= this.max) break;
      }
      if (i >= this.max) break;
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
