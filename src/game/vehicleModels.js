import * as THREE from 'three';
import { boxGeo } from '../core/geo.js';
import { plateTexture } from '../core/textures.js';
import { materials } from '../world/materials.js';
import { Vehicle } from './vehicle.js';

export function paintMaterial(color) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, metalness: 0.15, clearcoat: 0.6, clearcoatRoughness: 0.35 });
}

export function makeWheelMesh(r, width, rimColor = 0xb8bcc0, hubcap = true) {
  const M = materials();
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 22, 1), M.rubber);
  tyre.rotation.z = Math.PI / 2;
  inner.add(tyre);
  const side = new THREE.Mesh(new THREE.TorusGeometry(r * 0.86, r * 0.14, 6, 22), M.rubber);
  side.rotation.y = Math.PI / 2;
  side.position.x = width * 0.5;
  inner.add(side);
  const side2 = side.clone(); side2.position.x = -width * 0.5; inner.add(side2);
  const rimMat = new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.35, metalness: 0.8 });
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.64, r * 0.64, width + 0.012, 18), rimMat);
  rim.rotation.z = Math.PI / 2;
  inner.add(rim);
  if (hubcap) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.28, r * 0.34, width + 0.04, 14), M.chrome);
    cap.rotation.z = Math.PI / 2;
    inner.add(cap);
  }
  // lug nuts so rotation is visible
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, width + 0.05, 6), M.darkMetal);
    nut.rotation.z = Math.PI / 2;
    nut.position.set(0, Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
    inner.add(nut);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function addHeadlights(v, positions, color = 0xfff1d6) {
  const lm = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, emissive: color, emissiveIntensity: 0, roughness: 0.1 });
  v.lightMat = lm;
  for (const p of positions) {
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 14), lm);
    lens.rotation.x = Math.PI / 2;
    lens.position.copy(p);
    v.body.add(lens);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.015, 6, 14), materials().chrome);
    ring.position.copy(p);
    v.body.add(ring);
  }
}

// Headlight beam origins; the LightPool lends real spotlights to the car in use.
export function addHeadlightBeams(v, positions) {
  v.headlightPos = positions.map((p) => p.clone());
}

// The family van: a cream 1970s cab-over panel van with a brown stripe.
export function createVan(game) {
  const M = materials();
  const v = new Vehicle(game, {
    id: 'van', name: 'Hiisi 1000 van', mass: 1500,
    com: new THREE.Vector3(0, 0.78, 0.1),
    inertiaDims: { w: 1.8, h: 1.9, l: 4.4 },
    dims: { hx: 0.9, y0: 0.42, y1: 1.98, hz: 2.2 },
    wheels: [
      { x: -0.78, y: 0.33, z: -1.35, r: 0.33, steer: true, width: 0.19 },
      { x: 0.78, y: 0.33, z: -1.35, r: 0.33, steer: true, width: 0.19 },
      { x: -0.78, y: 0.33, z: 1.25, r: 0.33, driven: true, width: 0.19 },
      { x: 0.78, y: 0.33, z: 1.25, r: 0.33, driven: true, width: 0.19 },
    ],
    suspension: { k: 38000, c: 3600, travel: 0.16, arb: 9000 },
    engine: { idle: 780, redline: 4800, peak: 158, peakRpm: 2600, gears: { '-1': -4.0, 1: 3.9, 2: 2.3, 3: 1.45, 4: 1.0 }, final: 4.6 },
    drag: 0.62, brake: 6800, maxSteer: 0.62, fuel: 26, fuelCap: 55, battery: 0.95, soundChar: 0.85, thirst: 1.3,
    seat: new THREE.Vector3(-0.45, 1.62, -1.3),
    exitSide: new THREE.Vector3(-1.45, 0.1, -1.2),
    enginePos: new THREE.Vector3(0, 0.8, -1.4),
    cargo: [{ min: new THREE.Vector3(-0.8, 0.62, -0.55), max: new THREE.Vector3(0.8, 1.8, 2.15) }],
  });
  const paint = paintMaterial(0xd9ccaa);
  const stripe = new THREE.MeshStandardMaterial({ color: 0x6b3a20, roughness: 0.5 });
  const stripe2 = new THREE.MeshStandardMaterial({ color: 0xc4622d, roughness: 0.5 });
  const add = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; m.receiveShadow = true; v.body.add(m); return m; };
  // body shell: floor, sides, roof, front, rear (hollow so the cab has an interior)
  add(boxGeo(1.8, 0.1, 4.35), M.darkMetal, 0, 0.57, 0);
  // side panels, leaving the cab side windows open (z -1.975..-1.025, y 1.28..1.87)
  for (const x of [-0.885, 0.885]) {
    add(boxGeo(0.05, 0.68, 4.35), paint, x, 0.94, 0);                 // below the window line
    add(boxGeo(0.05, 0.67, 3.2), paint, x, 1.615, 0.575);             // cargo side, full height
    add(boxGeo(0.05, 0.67, 0.2), paint, x, 1.615, -2.075);            // A pillar
    add(boxGeo(0.05, 0.08, 0.95), paint, x, 1.91, -1.5);              // above the window
  }
  add(boxGeo(1.8, 0.28, 4.35), paint, 0, 0.47, 0);
  add(boxGeo(1.78, 0.1, 4.33), paint, 0, 1.95, 0);
  add(boxGeo(1.8, 0.62, 0.06), paint, 0, 0.93, -2.16);
  add(boxGeo(1.8, 1.35, 0.06), paint, 0, 1.27, 2.16);
  // windows
  add(boxGeo(1.66, 0.64, 0.03), M.glass, 0, 1.56, -2.19);
  for (const x of [-0.89, 0.89]) add(boxGeo(0.02, 0.59, 0.95), M.glass, x, 1.575, -1.5);
  // cab window cut lines & pillars
  add(boxGeo(1.8, 0.06, 0.08), paint, 0, 1.9, -2.17);
  // stripes
  for (const x of [-0.914, 0.914]) {
    add(boxGeo(0.01, 0.12, 4.2), stripe, x, 1.07, 0.05);
    add(boxGeo(0.01, 0.06, 4.2), stripe2, x, 0.97, 0.05);
  }
  // grille, bumpers
  add(boxGeo(1.0, 0.22, 0.03), M.black, 0, 0.83, -2.2);
  for (let i = 0; i < 4; i++) add(boxGeo(0.98, 0.015, 0.035), M.chrome, 0, 0.75 + i * 0.055, -2.205);
  add(boxGeo(1.86, 0.12, 0.12), M.chrome, 0, 0.46, -2.24);
  add(boxGeo(1.86, 0.12, 0.12), M.chrome, 0, 0.46, 2.24);
  addHeadlights(v, [new THREE.Vector3(-0.64, 0.84, -2.2), new THREE.Vector3(0.64, 0.84, -2.2)]);
  addHeadlightBeams(v, [new THREE.Vector3(-0.64, 0.84, -2.3), new THREE.Vector3(0.64, 0.84, -2.3)]);
  const brake = new THREE.MeshStandardMaterial({ color: 0x5a0a08, emissive: 0xff1a0a, emissiveIntensity: 0 });
  v.brakeMat = brake;
  for (const x of [-0.78, 0.78]) add(boxGeo(0.14, 0.26, 0.03), brake, x, 0.85, 2.195);
  for (const x of [-0.78, 0.78]) add(boxGeo(0.14, 0.08, 0.03), M.orange, x, 1.02, 2.195);
  // plates
  const pm = new THREE.MeshStandardMaterial({ map: plateTexture('HIS-470'), roughness: 0.5 });
  add(boxGeo(0.44, 0.11, 0.01), pm, 0, 0.62, -2.235);
  add(boxGeo(0.44, 0.11, 0.01), pm, 0, 0.62, 2.235).rotation.y = Math.PI;
  // rear door seam and handles
  add(boxGeo(0.02, 1.2, 0.01), M.black, 0, 1.25, 2.195);
  add(boxGeo(0.12, 0.03, 0.03), M.chrome, 0.12, 1.2, 2.2);
  // mirrors
  for (const x of [-1.0, 1.0]) { add(boxGeo(0.04, 0.2, 0.14), M.black, x, 1.45, -1.85); add(boxGeo(0.12, 0.02, 0.02), M.black, x * 0.95, 1.4, -1.9); }
  // interior
  const dash = add(boxGeo(1.7, 0.3, 0.3), M.darkMetal, 0, 1.12, -1.95);
  add(boxGeo(1.7, 0.05, 0.4), M.black, 0, 1.28, -1.9);
  for (const x of [-0.45, 0.45]) {
    add(boxGeo(0.5, 0.14, 0.5), M.cloth, x, 0.95, -1.2);
    add(boxGeo(0.5, 0.6, 0.12), M.cloth, x, 1.3, -0.93);
  }
  add(boxGeo(1.7, 1.2, 0.05), M.darkMetal, 0, 1.3, -0.8);
  const sw = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.02, 8, 20), M.black);
  sw.add(rim);
  const spoke = new THREE.Mesh(boxGeo(0.36, 0.03, 0.02), M.black); sw.add(spoke);
  sw.position.set(-0.45, 1.36, -1.62);
  sw.rotation.x = -1.0;
  const swHolder = new THREE.Group();
  swHolder.position.copy(sw.position);
  swHolder.rotation.x = -0.95;
  sw.position.set(0, 0, 0); sw.rotation.set(0, 0, 0);
  swHolder.add(sw);
  v.body.add(swHolder);
  v.steeringWheel = sw;
  // wheels
  for (const w of v.wheels) {
    w.mesh = makeWheelMesh(w.r, w.width, 0xd9d4c4);
    v.body.add(w.mesh);
  }
  // rear doors (open/close) — cargo only accepts items while open
  v.rearDoorsOpen = false;
  const doorL = new THREE.Group(); doorL.position.set(-0.88, 0.6, 2.2); v.body.add(doorL);
  const doorR = new THREE.Group(); doorR.position.set(0.88, 0.6, 2.2); v.body.add(doorR);
  const dl = new THREE.Mesh(boxGeo(0.88, 1.28, 0.04), paint); dl.position.set(0.44, 0.66, 0.0); dl.castShadow = true; doorL.add(dl);
  const dr = new THREE.Mesh(boxGeo(0.88, 1.28, 0.04), paint); dr.position.set(-0.44, 0.66, 0.0); dr.castShadow = true; doorR.add(dr);
  v.rearDoors = [doorL, doorR];
  dl.userData.vehicle = v; dl.userData.zone = 'rear';
  dr.userData.vehicle = v; dr.userData.zone = 'rear';
  const baseInside = v.insideCargo.bind(v);
  v.insideCargo = (l) => v.rearDoorsOpen && baseInside(l);
  v.toggleRear = () => {
    v.rearDoorsOpen = !v.rearDoorsOpen;
    doorL.rotation.y = v.rearDoorsOpen ? -1.9 : 0;
    doorR.rotation.y = v.rearDoorsOpen ? 1.9 : 0;
    game.audio.play('door', { pos: v.x });
  };
  v.body.traverse((o) => { if (o.isMesh && !o.userData.vehicle) { o.userData.vehicle = v; o.userData.zone = o.position.z > 1.8 ? 'rear' : 'cab'; } });
  dash.userData.zone = 'cab';
  v.dashHeight = 1.3;
  return v;
}

// Generic traffic car body (a visual only; traffic uses kinematic motion).
export function makeSedanMesh(color) {
  const M = materials();
  const g = new THREE.Group();
  const paint = paintMaterial(color);
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  add(boxGeo(1.68, 0.55, 4.3), paint, 0, 0.62, 0);
  add(boxGeo(1.5, 0.48, 2.1), M.glass, 0, 1.13, 0.15);
  add(boxGeo(1.46, 0.06, 1.8), paint, 0, 1.38, 0.2);
  for (const x of [-0.74, 0.74]) add(boxGeo(0.05, 0.44, 0.08), paint, x, 1.13, -0.88);
  add(boxGeo(1.72, 0.1, 0.1), M.chrome, 0, 0.42, -2.18);
  add(boxGeo(1.72, 0.1, 0.1), M.chrome, 0, 0.42, 2.18);
  const lm = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, emissive: 0xfff1d6, emissiveIntensity: 0.4 });
  for (const x of [-0.6, 0.6]) { const l = add(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 12), lm, x, 0.7, -2.16); l.rotation.x = Math.PI / 2; }
  const tl = new THREE.MeshStandardMaterial({ color: 0x5a0a08, emissive: 0xff1a0a, emissiveIntensity: 0.6 });
  for (const x of [-0.65, 0.65]) add(boxGeo(0.25, 0.1, 0.03), tl, x, 0.75, 2.16);
  add(boxGeo(0.9, 0.18, 0.03), M.black, 0, 0.7, -2.16);
  const wheels = [];
  for (const [x, z] of [[-0.74, -1.3], [0.74, -1.3], [-0.74, 1.3], [0.74, 1.3]]) {
    const w = makeWheelMesh(0.3, 0.18, 0x9aa0a6);
    w.position.set(x, 0.3, z);
    g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  g.userData.lightMat = lm;
  return g;
}
