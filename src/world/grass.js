import * as THREE from 'three';
import { WATER } from './layout.js';

// Grass tufts in a patch that follows the player. Instances are re-seeded
// from world-cell hashes, so the same spot always has the same grass.
const PATCH = 64;      // metres across
const STEP = 0.9;      // spacing between tufts

function tuftGeometry() {
  const pos = [], col = [], nor = [];
  const blades = 7;
  const base = new THREE.Color('#6f8f3c'), tip = new THREE.Color('#c2cf78');
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + Math.random() * 0.5;
    const r = 0.05 + Math.random() * 0.12;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = 0.18 + Math.random() * 0.24;
    const w = 0.035;
    const lean = 0.08 + Math.random() * 0.1;
    const dx = Math.cos(a + 1.57) * w, dz = Math.sin(a + 1.57) * w;
    const tx = x + Math.cos(a) * lean, tz = z + Math.sin(a) * lean;
    pos.push(x - dx, 0, z - dz, x + dx, 0, z + dz, tx, h, tz);
    for (let k = 0; k < 3; k++) nor.push(0, 1, 0);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
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
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
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
    };
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
