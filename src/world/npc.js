import * as THREE from 'three';
import { boxGeo } from '../core/geo.js';
import { materials } from './materials.js';

// A simple low-poly person. Origin at the feet (standing) or at the seat surface (sitting).
export function makePerson({
  shirt = 0x5a6e8c, pants = 0x2d3440, hair = 0x6a5238, skin = 0xd9a383, hat = null, apron = null,
  sitting = false, dress = false, scarf = null, glasses = false, beard = null, belly = 0, bald = false,
} = {}) {
  const g = new THREE.Group();
  const std = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
  const off = sitting ? -0.46 : 0; // upper body drops onto the seat
  const legM = std(pants);
  if (sitting) {
    const thighs = new THREE.Mesh(boxGeo(0.34, 0.16, 0.46), legM); thighs.position.set(0, 0.08, 0.2); g.add(thighs);
    const shins = new THREE.Mesh(boxGeo(0.32, 0.46, 0.16), legM); shins.position.set(0, -0.15, 0.42); g.add(shins);
    const shoes = new THREE.Mesh(boxGeo(0.32, 0.07, 0.24), std(0x1d1a16)); shoes.position.set(0, -0.37, 0.48); g.add(shoes);
  } else if (dress) {
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.7, 10), std(shirt)); skirt.position.y = 0.5; g.add(skirt);
    const shins = new THREE.Mesh(boxGeo(0.26, 0.2, 0.16), std(0x8a7560)); shins.position.y = 0.1; g.add(shins);
  } else {
    const legs = new THREE.Mesh(boxGeo(0.34, 0.85, 0.22), legM); legs.position.y = 0.43; g.add(legs);
    g.userData.legs = legs;
  }
  const torso = new THREE.Mesh(boxGeo(0.44 + belly * 0.1, 0.62, 0.26 + belly * 0.14), std(shirt)); torso.position.set(0, 1.16 + off, belly * 0.04); g.add(torso);
  if (apron) { const a = new THREE.Mesh(boxGeo(0.4, 0.7, 0.02), std(apron)); a.position.set(0, 0.95 + off, 0.14 + belly * 0.1); g.add(a); }
  const armL = new THREE.Mesh(boxGeo(0.12, 0.6, 0.14), std(shirt)); armL.position.set(-0.29 - belly * 0.05, 1.14 + off, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.29 + belly * 0.05; g.add(armR);
  if (sitting) { armL.rotation.x = armR.rotation.x = -0.6; armL.position.z = armR.position.z = 0.12; }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), std(skin)); head.position.y = 1.62 + off; head.scale.set(1, 1.15, 1); g.add(head);
  const headGroup = head;
  if (!bald) { const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), std(hair)); hairM.position.y = 0.02; head.add(hairM); }
  if (scarf) { const sc = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), std(scarf)); sc.position.y = 0.01; sc.rotation.x = -0.25; head.add(sc); }
  if (hat) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.07, 12), std(hat)); h.position.y = 0.13; head.add(h); const b = new THREE.Mesh(boxGeo(0.2, 0.02, 0.12), std(hat)); b.position.set(0, 0.11, 0.14); head.add(b); }
  if (beard) { const bd = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), std(beard)); bd.position.set(0, -0.04, 0.05); head.add(bd); }
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (const x of [-0.045, 0.045]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 4), eyeM); e.position.set(x, 0.03, 0.12); head.add(e); }
  if (glasses) {
    const gm = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 });
    for (const x of [-0.05, 0.05]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 4, 10), gm); r.position.set(x, 0.03, 0.13); head.add(r); }
  }
  const nose = new THREE.Mesh(boxGeo(0.03, 0.05, 0.04), std(skin)); nose.position.set(0, -0.01, 0.13); head.add(nose);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { ...g.userData, head: headGroup, armL, armR, torso, t: Math.random() * 10, sitting, baseY: torso.position.y };
  return g;
}

export function animatePerson(p, dt, talking = false, drunk = 0) {
  const u = p.userData;
  u.t += dt;
  u.head.rotation.y = Math.sin(u.t * 0.4) * 0.35;
  u.head.rotation.x = talking ? Math.sin(u.t * 9) * 0.06 : Math.sin(u.t * 0.7) * 0.04 + drunk * 0.25;
  u.torso.scale.y = 1 + Math.sin(u.t * 1.6) * 0.01;
  if (!u.sitting && !u.walking) u.armR.rotation.x = Math.sin(u.t * 0.5) * 0.08;
  if (drunk) {
    u.torso.rotation.z = Math.sin(u.t * 0.9) * 0.12 * drunk;
    u.head.rotation.z = Math.sin(u.t * 0.7 + 1) * 0.2 * drunk;
    if (u.sitting) u.armR.rotation.x = -0.6 - Math.max(0, Math.sin(u.t * 0.35)) * 1.2; // lifting the bottle
  }
}

// Swing arms and legs while moving.
export function walkPerson(p, dt, speed) {
  const u = p.userData;
  u.walking = speed > 0.1;
  u.wt = (u.wt || 0) + dt * speed * 4.5;
  const s = Math.sin(u.wt) * Math.min(1, speed);
  u.armL.rotation.x = s * 0.5; u.armR.rotation.x = -s * 0.5;
  if (u.legs) u.legs.rotation.x = s * 0.12;
  p.position.y += 0;
}

export { materials };
