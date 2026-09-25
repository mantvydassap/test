import * as THREE from 'three';
import { boxGeo } from '../core/geo.js';
import { materials } from './materials.js';

// A simple low-poly person. Origin at the feet.
export function makePerson({ shirt = 0x5a6e8c, pants = 0x2d3440, hair = 0x6a5238, skin = 0xd9a383, hat = null, apron = null } = {}) {
  const g = new THREE.Group();
  const std = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
  const legs = new THREE.Mesh(boxGeo(0.34, 0.85, 0.22), std(pants)); legs.position.y = 0.43; g.add(legs);
  const torso = new THREE.Mesh(boxGeo(0.44, 0.62, 0.26), std(shirt)); torso.position.y = 1.16; g.add(torso);
  if (apron) { const a = new THREE.Mesh(boxGeo(0.4, 0.7, 0.02), std(apron)); a.position.set(0, 0.95, 0.14); g.add(a); }
  const armL = new THREE.Mesh(boxGeo(0.12, 0.6, 0.14), std(shirt)); armL.position.set(-0.29, 1.14, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.29; g.add(armR);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), std(skin)); head.position.y = 1.62; head.scale.set(1, 1.15, 1); g.add(head);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), std(hair)); hairM.position.y = 1.64; g.add(hairM);
  if (hat) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.07, 12), std(hat)); h.position.y = 1.76; g.add(h); const b = new THREE.Mesh(boxGeo(0.2, 0.02, 0.12), std(hat)); b.position.set(0, 1.735, 0.14); g.add(b); }
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (const x of [-0.045, 0.045]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 4), eyeM); e.position.set(x, 1.65, 0.12); g.add(e); }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { head, armL, armR, torso, t: Math.random() * 10 };
  return g;
}

export function animatePerson(p, dt, talking = false) {
  const u = p.userData;
  u.t += dt;
  u.head.rotation.y = Math.sin(u.t * 0.4) * 0.35;
  u.head.rotation.x = talking ? Math.sin(u.t * 9) * 0.06 : Math.sin(u.t * 0.7) * 0.04;
  u.torso.scale.y = 1 + Math.sin(u.t * 1.6) * 0.01;
  u.armR.rotation.x = Math.sin(u.t * 0.5) * 0.08;
}

export { materials };
