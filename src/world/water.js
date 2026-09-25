import * as THREE from 'three';
import { waterNormalTexture } from '../core/textures.js';
import { WATER } from './layout.js';

// Dark, tea-coloured Finnish lake water with drifting ripples.
export function buildWater(scene, terrain) {
  const normal = waterNormalTexture();
  const mats = [];
  for (const lake of terrain.lakes) {
    const tex = normal.clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(lake.r / 14, lake.r / 14);
    tex.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1e2c2c, roughness: 0.14, metalness: 0.05, normalMap: tex, normalScale: new THREE.Vector2(0.14, 0.14),
      transparent: true, opacity: 0.9, envMapIntensity: 1.2,
    });
    const geo = new THREE.CircleGeometry(lake.r * 1.35, 96);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(lake.x, WATER, lake.z);
    m.receiveShadow = true;
    m.renderOrder = 2;
    scene.add(m);
    mats.push(mat);
  }
  return {
    update(dt) {
      for (const m of mats) {
        m.normalMap.offset.x += dt * 0.006;
        m.normalMap.offset.y += dt * 0.004;
      }
    },
  };
}
