import * as THREE from 'three';
import { boxGeo, mergeObject } from '../core/geo.js';
import { plateTexture, labelTexture } from '../core/textures.js';
import { materials } from '../world/materials.js';
import { Vehicle } from './vehicle.js';
import { makeWheelMesh, paintMaterial, addHeadlightBeams } from './vehicleModels.js';
import { clamp } from '../core/math.js';

// The Ruska 1300: a rusty 1970s coupé that the player rebuilds from parts.

export const IDEAL_MIXTURE = 14.7;
export const IDEAL_TIMING = 8;
const BOLT_MAX = 4;

let MATS = null;
function mats() {
  if (MATS) return MATS;
  const std = (c, r = 0.6, m = 0.2) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  MATS = {
    paint: paintMaterial(0xa9542a),
    primer: std(0x7d7f79, 0.8, 0.1),
    block: std(0x3e4a57, 0.55, 0.45),
    alu: std(0xa7abad, 0.4, 0.8),
    dark: std(0x1e1f20, 0.7, 0.3),
    black: std(0x121212, 0.8, 0.1),
    rust: std(0x6d4430, 0.9, 0.3),
    copper: std(0x9a6a3a, 0.5, 0.7),
    rubber: std(0x151515, 0.95, 0),
    vinyl: std(0x5a3a26, 0.7, 0),
    ceramic: std(0xefeee8, 0.4, 0),
    red: std(0xa3261e, 0.5, 0.1),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.15, metalness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1c2a33, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.4 }),
    nutLoose: std(0xd0c89a, 0.35, 0.85),
    nutTight: std(0x5d6064, 0.5, 0.8),
    ghost: new THREE.MeshBasicMaterial({ color: 0x7fdc6a, transparent: true, opacity: 0.28, depthWrite: false }),
    ghostNear: new THREE.MeshBasicMaterial({ color: 0xb6ff8a, transparent: true, opacity: 0.5, depthWrite: false }),
  };
  return MATS;
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- part meshes
const BUILD = {
  block() {
    const K = mats(); const g = new THREE.Group();
    g.add(mesh(boxGeo(0.4, 0.42, 0.62), K.block));
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.44, 8), K.block, 0.21, -0.02, -0.22 + i * 0.147));
    g.add(mesh(boxGeo(0.12, 0.14, 0.2), K.block, -0.24, -0.08, 0.1));
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16), K.dark, 0, -0.08, -0.33).rotateX(Math.PI / 2));
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 20), K.dark, 0, -0.04, 0.33).rotateX(Math.PI / 2));
    for (const x of [-0.24, 0.24]) g.add(mesh(boxGeo(0.08, 0.06, 0.08), K.rubber, x, -0.18, 0));
    return g;
  },
  oilpan() { const K = mats(); const g = new THREE.Group(); g.add(mesh(boxGeo(0.36, 0.12, 0.56), K.dark)); g.add(mesh(boxGeo(0.3, 0.06, 0.3), K.dark, 0, -0.08, 0.08)); g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 6), K.alu, 0, -0.12, 0.15)); return g; },
  head() {
    const K = mats(); const g = new THREE.Group();
    g.add(mesh(boxGeo(0.38, 0.14, 0.62), K.alu));
    for (let i = 0; i < 5; i++) g.add(mesh(boxGeo(0.4, 0.02, 0.02), K.alu, 0, 0.02, -0.26 + i * 0.13));
    for (let i = 0; i < 4; i++) g.add(mesh(boxGeo(0.06, 0.08, 0.08), K.alu, -0.2, -0.01, -0.22 + i * 0.147));
    return g;
  },
  rocker() { const K = mats(); const g = new THREE.Group(); g.add(mesh(boxGeo(0.3, 0.07, 0.56), K.red)); g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), K.dark, 0.06, 0.045, -0.15)); return g; },
  carb() { const K = mats(); const g = new THREE.Group(); g.add(mesh(boxGeo(0.12, 0.12, 0.13), K.alu)); g.add(mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.06, 12), K.alu, 0, 0.08, 0)); g.add(mesh(boxGeo(0.1, 0.05, 0.03), K.copper, 0.03, -0.02, 0.08)); g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 6), K.chrome, -0.07, 0.0, 0.03).rotateZ(Math.PI / 2)); return g; },
  airfilter() { const K = mats(); const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.07, 20), K.black)); g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8), K.chrome, 0, 0.05, 0)); return g; },
  plug() { const K = mats(); const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.05, 8), K.ceramic, 0, 0.025, 0)); g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.022, 6), K.alu, 0, -0.01, 0)); g.add(mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.02, 6), K.alu, 0, -0.03, 0)); return g; },
  distributor() { const K = mats(); const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 12), K.alu, 0, -0.03, 0)); g.add(mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.06, 12), K.black, 0, 0.05, 0)); for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 6), K.black, Math.cos(a) * 0.035, 0.09, Math.sin(a) * 0.035)); } return g; },
  alternator() { const K = mats(); const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.13, 14), K.alu).rotateX(Math.PI / 2)); g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), K.dark, 0, 0, -0.08).rotateX(Math.PI / 2)); return g; },
  fanbelt() { const K = mats(); const g = new THREE.Group(); const t = mesh(new THREE.TorusGeometry(0.13, 0.012, 6, 24), K.rubber); t.scale.set(1.1, 0.8, 1); g.add(t); return g; },
  radiator() { const K = mats(); const g = new THREE.Group(); g.add(mesh(boxGeo(0.86, 0.42, 0.05), K.black)); g.add(mesh(boxGeo(0.9, 0.05, 0.07), K.copper, 0, 0.23, 0)); g.add(mesh(boxGeo(0.9, 0.05, 0.07), K.copper, 0, -0.23, 0)); g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 10), K.alu, 0.3, 0.27, 0)); return g; },
  hoses() { const K = mats(); const g = new THREE.Group(); const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0.2, 0.1, -0.12), new THREE.Vector3(0.12, 0.04, 0.05), new THREE.Vector3(0.05, 0.1, 0.16)]); g.add(mesh(new THREE.TubeGeometry(c, 10, 0.022, 6), K.rubber)); const c2 = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.2, -0.12, -0.12), new THREE.Vector3(-0.15, -0.08, 0.05), new THREE.Vector3(-0.05, -0.1, 0.16)]); g.add(mesh(new THREE.TubeGeometry(c2, 10, 0.022, 6), K.rubber)); return g; },
  gearbox() { const K = mats(); const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.17, 0.1, 0.5, 12).rotateX(Math.PI / 2), K.alu)); g.add(mesh(boxGeo(0.14, 0.14, 0.2), K.alu, 0, 0.1, 0.05)); g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.25, 6), K.black, 0, 0.26, 0.08)); g.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), K.black, 0, 0.39, 0.08)); return g; },
  driveshaft() { const K = mats(); const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.7, 10).rotateX(Math.PI / 2), K.dark)); for (const z of [-0.85, 0.85]) g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10).rotateX(Math.PI / 2), K.alu, 0, 0, z)); return g; },
  exhaust() { const K = mats(); const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.028, 0.028, 2.6, 8).rotateX(Math.PI / 2), K.rust, 0, 0, 0.1)); g.add(mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.5, 8), K.rust, -0.05, 0.24, -1.2).rotateZ(0.2)); return g; },
  muffler() { const K = mats(); const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.55, 12).rotateX(Math.PI / 2), K.rust)); g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.25, 8).rotateX(Math.PI / 2), K.rust, 0, -0.02, 0.38)); return g; },
  fueltank() { const K = mats(); const g = new THREE.Group(); g.add(mesh(boxGeo(0.9, 0.24, 0.5), K.black)); g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10), K.dark, -0.4, 0.14, -0.15)); return g; },
  battery() { const K = mats(); const g = new THREE.Group(); g.add(mesh(boxGeo(0.26, 0.2, 0.17), K.black)); g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.03, 8), K.red, -0.09, 0.11, 0)); g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.03, 8), K.dark, 0.09, 0.11, 0)); const lbl = mesh(boxGeo(0.2, 0.08, 0.005), new THREE.MeshStandardMaterial({ map: labelTexture('12V', '#1f4f8a') })); lbl.position.set(0, 0, 0.088); g.add(lbl); return g; },
  wheel() { return makeWheelMesh(0.29, 0.18, 0x9d9a90); },
  seat() { const K = mats(); const g = new THREE.Group(); g.add(mesh(boxGeo(0.5, 0.12, 0.5), K.vinyl, 0, -0.1, 0)); const back = mesh(boxGeo(0.5, 0.62, 0.1), K.vinyl, 0, 0.2, 0.25); back.rotation.x = -0.18; g.add(back); g.add(mesh(boxGeo(0.4, 0.06, 0.4), K.dark, 0, -0.19, 0)); return g; },
  steering() { const K = mats(); const g = new THREE.Group(); g.add(mesh(new THREE.TorusGeometry(0.18, 0.018, 8, 22), K.black)); g.add(mesh(boxGeo(0.34, 0.03, 0.02), K.black)); g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 10).rotateX(Math.PI / 2), K.chrome)); return g; },
  door(side) {
    const K = mats(); const g = new THREE.Group();
    g.add(mesh(boxGeo(0.05, 0.54, 1.44), K.paint));
    g.add(mesh(boxGeo(0.03, 0.04, 1.3), K.chrome, 0, 0.29, 0));
    const glass = mesh(boxGeo(0.02, 0.38, 1.18), K.glass, -side * 0.03, 0.48, 0.05); g.add(glass);
    g.add(mesh(boxGeo(0.03, 0.03, 1.2), K.black, -side * 0.03, 0.68, 0.05));
    g.add(mesh(boxGeo(0.03, 0.4, 0.03), K.black, -side * 0.03, 0.48, 0.64));
    g.add(mesh(boxGeo(0.015, 0.03, 0.12), K.chrome, side * 0.03, 0.12, 0.5));
    return g;
  },
  hood() { const K = mats(); const g = new THREE.Group(); g.add(mesh(boxGeo(1.46, 0.04, 1.28), K.paint)); g.add(mesh(boxGeo(0.4, 0.02, 1.1), K.paint, 0, 0.025, 0)); return g; },
  trunk() { const K = mats(); const g = new THREE.Group(); g.add(mesh(boxGeo(1.44, 0.04, 0.66), K.paint)); g.add(mesh(boxGeo(0.14, 0.02, 0.03), K.chrome, 0, 0, 0.31)); return g; },
  bumper() { const K = mats(); const g = new THREE.Group(); g.add(mesh(boxGeo(1.62, 0.12, 0.1), K.chrome)); g.add(mesh(boxGeo(1.5, 0.03, 0.11), K.black, 0, 0, 0)); return g; },
  light() { const K = mats(); const g = new THREE.Group(); const lens = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf4f0e6, emissive: 0xfff1d6, emissiveIntensity: 0, roughness: 0.1 })); g.add(lens); g.add(mesh(new THREE.TorusGeometry(0.09, 0.014, 6, 16), K.chrome, 0, 0, -0.026)); g.add(mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.08, 12).rotateX(Math.PI / 2), K.dark, 0, 0, 0.05)); g.userData.lens = lens; return g; },
};

// Parts: mount positions in the car's model space; bolts relative to the part (with nut axis).
export const PART_DEFS = [
  { id: 'block', name: 'Engine block', build: 'block', parent: 'body', pos: [0, 0.46, -1.3], mass: 95, axis: 'x', bolts: [[-0.26, -0.16, -0.12], [-0.26, -0.16, 0.12], [0.26, -0.16, -0.12], [0.26, -0.16, 0.12]], group: 'Engine' },
  { id: 'oilpan', name: 'Oil pan', build: 'oilpan', parent: 'block', pos: [0, 0.2, -1.3], mass: 4, axis: 'x', bolts: [[-0.19, 0, -0.2], [0.19, 0, -0.2], [-0.19, 0, 0.2], [0.19, 0, 0.2]], group: 'Engine' },
  { id: 'head', name: 'Cylinder head', build: 'head', parent: 'block', pos: [0, 0.745, -1.3], mass: 16, axis: 'y', bolts: [[-0.12, 0.08, -0.24], [0.12, 0.08, -0.24], [-0.12, 0.08, 0], [0.12, 0.08, 0], [-0.12, 0.08, 0.24], [0.12, 0.08, 0.24]], group: 'Engine' },
  { id: 'rocker', name: 'Rocker cover', build: 'rocker', parent: 'head', pos: [0.02, 0.85, -1.3], mass: 1.5, axis: 'y', bolts: [[0, 0.04, -0.25], [0, 0.04, 0.25]], group: 'Engine' },
  { id: 'carb', name: 'Carburettor', build: 'carb', parent: 'head', pos: [-0.27, 0.7, -1.28], mass: 2.5, axis: 'y', bolts: [[-0.045, -0.07, -0.05], [0.045, -0.07, 0.05]], group: 'Fuel & ignition' },
  { id: 'airfilter', name: 'Air filter', build: 'airfilter', parent: 'carb', pos: [-0.27, 0.815, -1.28], mass: 0.8, axis: 'y', bolts: [[0, 0.07, 0]], group: 'Fuel & ignition' },
  { id: 'plug1', name: 'Spark plug 1', build: 'plug', parent: 'head', pos: [0.21, 0.78, -1.52], mass: 0.08, axis: 'y', bolts: [[0, 0.055, 0]], group: 'Fuel & ignition', shop: true },
  { id: 'plug2', name: 'Spark plug 2', build: 'plug', parent: 'head', pos: [0.21, 0.78, -1.375], mass: 0.08, axis: 'y', bolts: [[0, 0.055, 0]], group: 'Fuel & ignition', shop: true },
  { id: 'plug3', name: 'Spark plug 3', build: 'plug', parent: 'head', pos: [0.21, 0.78, -1.225], mass: 0.08, axis: 'y', bolts: [[0, 0.055, 0]], group: 'Fuel & ignition', shop: true },
  { id: 'plug4', name: 'Spark plug 4', build: 'plug', parent: 'head', pos: [0.21, 0.78, -1.08], mass: 0.08, axis: 'y', bolts: [[0, 0.055, 0]], group: 'Fuel & ignition', shop: true },
  { id: 'distributor', name: 'Distributor', build: 'distributor', parent: 'block', pos: [0.26, 0.64, -0.98], mass: 1.6, axis: 'x', bolts: [[0.05, -0.05, 0]], group: 'Fuel & ignition' },
  { id: 'alternator', name: 'Alternator', build: 'alternator', parent: 'block', pos: [0.3, 0.52, -1.64], mass: 5, axis: 'x', bolts: [[0.08, 0.05, 0.03], [0.08, -0.05, 0.03]], group: 'Engine' },
  { id: 'fanbelt', name: 'Fan belt', build: 'fanbelt', parent: 'alternator', pos: [0.15, 0.5, -1.7], mass: 0.3, axis: 'z', bolts: [], group: 'Engine' },
  { id: 'radiator', name: 'Radiator', build: 'radiator', parent: 'body', pos: [0, 0.55, -1.88], mass: 6, axis: 'z', bolts: [[-0.4, 0.2, -0.04], [0.4, 0.2, -0.04], [0, -0.2, -0.04]], group: 'Cooling' },
  { id: 'hoses', name: 'Radiator hoses', build: 'hoses', parent: 'radiator', requires: ['block'], pos: [0, 0.6, -1.7], mass: 0.8, axis: 'y', bolts: [[0.2, 0.13, -0.12], [-0.05, -0.07, 0.16]], group: 'Cooling' },
  { id: 'gearbox', name: 'Gearbox', build: 'gearbox', parent: 'block', pos: [0, 0.4, -0.78], mass: 28, axis: 'x', bolts: [[-0.17, 0, -0.2], [0.17, 0, -0.2], [-0.12, -0.08, 0.1], [0.12, -0.08, 0.1]], group: 'Drivetrain' },
  { id: 'driveshaft', name: 'Driveshaft', build: 'driveshaft', parent: 'gearbox', pos: [0, 0.3, 0.3], mass: 9, axis: 'x', bolts: [[0.05, 0, -0.85], [0.05, 0, 0.85]], group: 'Drivetrain' },
  { id: 'exhaust', name: 'Exhaust pipe', build: 'exhaust', parent: 'body', requires: ['block'], pos: [0.36, 0.26, 0.08], mass: 7, axis: 'x', bolts: [[0.03, 0, -1.0], [0.03, 0, 0.2], [0.03, 0, 1.2]], group: 'Exhaust' },
  { id: 'muffler', name: 'Muffler', build: 'muffler', parent: 'exhaust', pos: [0.36, 0.3, 1.66], mass: 6, axis: 'x', bolts: [[0.1, 0, -0.2], [0.1, 0, 0.2]], group: 'Exhaust' },
  { id: 'fueltank', name: 'Fuel tank', build: 'fueltank', parent: 'body', pos: [0, 0.45, 1.66], mass: 9, axis: 'y', bolts: [[-0.4, 0.13, 0.2], [0.4, 0.13, 0.2]], group: 'Fuel & ignition' },
  { id: 'battery', name: 'Battery', build: 'battery', parent: 'body', pos: [-0.46, 0.66, -1.72], mass: 14, axis: 'y', bolts: [[0, 0.11, 0.07]], group: 'Electrics' },
  { id: 'wheelFL', name: 'Wheel, front left', build: 'wheel', parent: 'body', pos: [-0.7, 0.29, -1.24], mass: 13, axis: 'x', side: -1, bolts: 'lugs', group: 'Wheels' },
  { id: 'wheelFR', name: 'Wheel, front right', build: 'wheel', parent: 'body', pos: [0.7, 0.29, -1.24], mass: 13, axis: 'x', side: 1, bolts: 'lugs', group: 'Wheels' },
  { id: 'wheelRL', name: 'Wheel, rear left', build: 'wheel', parent: 'body', pos: [-0.7, 0.29, 1.24], mass: 13, axis: 'x', side: -1, bolts: 'lugs', group: 'Wheels' },
  { id: 'wheelRR', name: 'Wheel, rear right', build: 'wheel', parent: 'body', pos: [0.7, 0.29, 1.24], mass: 13, axis: 'x', side: 1, bolts: 'lugs', group: 'Wheels' },
  { id: 'seat', name: 'Driver seat', build: 'seat', parent: 'body', pos: [-0.36, 0.52, 0.12], mass: 12, axis: 'y', bolts: [[-0.17, -0.19, -0.17], [0.17, -0.19, -0.17]], group: 'Interior' },
  { id: 'steering', name: 'Steering wheel', build: 'steering', parent: 'body', pos: [-0.36, 0.98, -0.44], rot: [-1.0, 0, 0], mass: 1.5, axis: 'z', bolts: [[0, 0, 0.03]], group: 'Interior' },
  { id: 'doorL', name: 'Door, left', build: 'door', buildArg: -1, parent: 'body', pos: [-0.805, 0.61, 0.0], mass: 18, axis: 'x', side: -1, bolts: [[-0.03, 0.12, -0.7], [-0.03, -0.14, -0.7]], group: 'Body' },
  { id: 'doorR', name: 'Door, right', build: 'door', buildArg: 1, parent: 'body', pos: [0.805, 0.61, 0.0], mass: 18, axis: 'x', side: 1, bolts: [[0.03, 0.12, -0.7], [0.03, -0.14, -0.7]], group: 'Body' },
  { id: 'hood', name: 'Hood', build: 'hood', parent: 'body', pos: [0, 0.885, -1.36], rot: [-0.03, 0, 0], mass: 14, axis: 'y', bolts: [[-0.66, 0.03, 0.6], [0.66, 0.03, 0.6]], group: 'Body' },
  { id: 'trunk', name: 'Trunk lid', build: 'trunk', parent: 'body', pos: [0, 0.885, 1.69], mass: 9, axis: 'y', bolts: [[-0.6, 0.03, -0.3], [0.6, 0.03, -0.3]], group: 'Body' },
  { id: 'bumperF', name: 'Front bumper', build: 'bumper', parent: 'body', pos: [0, 0.37, -2.1], mass: 6, axis: 'z', bolts: [[-0.55, 0, 0.06], [0.55, 0, 0.06]], group: 'Body' },
  { id: 'bumperR', name: 'Rear bumper', build: 'bumper', parent: 'body', pos: [0, 0.37, 2.1], mass: 6, axis: 'z', bolts: [[-0.55, 0, -0.06], [0.55, 0, -0.06]], group: 'Body' },
  { id: 'lightL', name: 'Headlight, left', build: 'light', parent: 'body', pos: [-0.56, 0.6, -2.06], mass: 1, axis: 'z', bolts: [[0.07, 0.07, 0.02]], group: 'Electrics' },
  { id: 'lightR', name: 'Headlight, right', build: 'light', parent: 'body', pos: [0.56, 0.6, -2.06], mass: 1, axis: 'z', bolts: [[-0.07, 0.07, 0.02]], group: 'Electrics' },
];
export const PART_BY_ID = Object.fromEntries(PART_DEFS.map((d) => [d.id, d]));

// Where the loose parts lie at the start, in garage-local coordinates [x, y, z, yaw].
const SPAWN = {
  block: [2.0, 0.35, 2.9, 0], oilpan: [3.05, 1.08, -0.95, 0], head: [3.05, 1.1, -1.75, 0], rocker: [-3.15, 1.62, -0.6, 0],
  carb: [-3.15, 0.95, -2.4, 0], airfilter: [-3.15, 1.62, -1.6, 0], distributor: [3.0, 1.06, -2.35, 0], alternator: [-3.15, 0.95, -1.4, 0],
  fanbelt: [3.0, 1.03, -0.1, 0], radiator: [-2.3, 0.35, -4.1, 0], hoses: [-3.15, 1.65, -2.6, 0], gearbox: [2.1, 0.3, 1.5, 0],
  driveshaft: [-1.2, 0.2, -4.2, Math.PI / 2], exhaust: [-2.6, 0.2, 1.0, 0], muffler: [-2.5, 0.25, -1.5, 0], fueltank: [1.9, 0.3, -3.8, 0],
  battery: [3.0, 1.12, 0.25, 0], wheelFL: [-2.95, 0.42, 0.4, 0], wheelFR: [-2.95, 0.42, 1.0, 0], wheelRL: [-2.95, 0.42, 1.6, 0], wheelRR: [-2.95, 0.42, 2.2, 0],
  seat: [2.1, 0.45, -2.6, 0], steering: [-3.15, 2.28, -1.2, 0], doorL: [-2.35, 0.5, -1.9, 0], doorR: [-2.35, 0.5, -3.6, 0],
  hood: [0.4, 0.2, -3.8, 0], trunk: [1.8, 0.2, 3.7, 0], bumperF: [0.9, 0.2, 2.6, Math.PI / 2], bumperR: [-1.7, 0.2, 3.4, 0],
  lightL: [-3.15, 2.28, -2.2, 0], lightR: [-3.15, 2.28, -2.6, 0],
};

const boltHitGeo = new THREE.SphereGeometry(0.035, 6, 4);
const boltHitMat = new THREE.MeshBasicMaterial({ visible: false });
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class ProjectCar {
  constructor(game, garage, spot) {
    this.game = game;
    this.garage = garage;
    const M = materials();
    const K = mats();
    const v = new Vehicle(game, {
      id: 'ruska', name: 'Ruska 1300', mass: 320,
      com: new THREE.Vector3(0, 0.5, -0.1),
      inertiaDims: { w: 1.6, h: 1.1, l: 4.1 },
      dims: { hx: 0.79, y0: 0.3, y1: 1.3, hz: 2.08 },
      wheels: [
        { x: -0.7, y: 0.29, z: -1.24, r: 0.29, steer: true },
        { x: 0.7, y: 0.29, z: -1.24, r: 0.29, steer: true },
        { x: -0.7, y: 0.29, z: 1.24, r: 0.29, driven: true },
        { x: 0.7, y: 0.29, z: 1.24, r: 0.29, driven: true },
      ],
      suspension: { k: 26000, c: 2300, travel: 0.15, arb: 7000 },
      engine: { idle: 880, redline: 6400, peak: 102, peakRpm: 3600, gears: { '-1': -3.4, 1: 3.5, 2: 2.05, 3: 1.35, 4: 1.0 }, final: 4.1 },
      drag: 0.42, brake: 5400, maxSteer: 0.6, fuel: 4, fuelCap: 42, battery: 0.5, soundChar: 1.05, grip: 1.05,
      seat: new THREE.Vector3(-0.36, 1.12, 0.16),
      exitSide: new THREE.Vector3(-1.35, 0.1, 0.0),
      enginePos: new THREE.Vector3(0, 0.7, -1.3),
      cargo: [{ min: new THREE.Vector3(-0.7, 0.42, 1.35), max: new THREE.Vector3(0.7, 0.85, 2.0) }],
    });
    this.v = v;
    v.project = this;
    v.dashHeight = 0.95;
    v.engine.oil = 0;
    v.engine.coolant = 0;
    v.engine.mixture = 17.2;
    v.engine.timing = 0;
    v.plate = null;
    this.buildBody();
    // parts state
    this.parts = {};
    for (const d of PART_DEFS) {
      const nb = d.bolts === 'lugs' ? 4 : d.bolts.length;
      this.parts[d.id] = { def: d, attached: false, bolts: new Array(nb).fill(0), mesh: null, boltMeshes: [], prop: null, ghost: null };
    }
    // wheel mapping
    this.wheelParts = ['wheelFL', 'wheelFR', 'wheelRL', 'wheelRR'];
    v.wheels.forEach((w) => { w.present = false; });
    // jack stands
    this.onStands = true;
    this.stands = [];
    const standMat = K.red;
    for (const [x, z] of [[-0.55, -1.0], [0.55, -1.0], [-0.55, 1.0], [0.55, 1.0]]) {
      const s = new THREE.Group();
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.16, 0.56, 4), standMat); leg.position.y = 0.28; s.add(leg);
      const top = new THREE.Mesh(boxGeo(0.1, 0.06, 0.1), standMat); top.position.y = 0.59; s.add(top);
      s.userData.local = new THREE.Vector3(x, 0, z);
      s.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.target = null; } });
      game.scene.add(s);
      this.stands.push(s);
    }
    this.standTarget = {
      name: 'Jack stands',
      hint: () => this.canLower() ? 'Lower the car' : 'Lower the car (fit all four wheels first)',
      use: () => this.lower(),
    };
    for (const s of this.stands) s.traverse((o) => { if (o.isMesh) game.interact.add(o, this.standTarget); });
    this.spot = spot;
    this.placeOnStands();
    v.canStart = () => this.canStart();
    v.quality = () => this.quality();
    v.impactCallback = (imp) => this.onImpact(imp);
    this.hoodOpen = false;
    this.inspected = false;
    this.vibT = 0;
  }

  // Static body shell (always present).
  buildBody() {
    const v = this.v;
    const K = mats();
    const body = new THREE.Group();
    body.name = 'shell';
    v.body.add(body);
    this.shell = body;
    const add = (geo, mat, x, y, z) => { const m = mesh(geo, mat, x, y, z); body.add(m); m.userData.vehicle = v; m.userData.zone = 'body'; return m; };
    // side panels (profile extrusions with door openings and wheel arches)
    const shape = new THREE.Shape();
    shape.moveTo(-2.0, 0.27);
    shape.lineTo(-2.05, 0.5); shape.lineTo(-2.03, 0.86); shape.lineTo(-1.38, 0.88); shape.lineTo(-0.74, 0.88);
    shape.lineTo(-0.74, 0.34); shape.lineTo(0.72, 0.34); shape.lineTo(0.72, 0.88); shape.lineTo(2.0, 0.86);
    shape.lineTo(2.07, 0.6); shape.lineTo(2.02, 0.27); shape.lineTo(1.63, 0.27);
    shape.absarc(1.24, 0.29, 0.39, 0, Math.PI, false);
    shape.lineTo(-0.85, 0.27);
    shape.absarc(-1.24, 0.29, 0.39, 0, Math.PI, false);
    shape.lineTo(-2.0, 0.27);
    for (const side of [-1, 1]) {
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: false, curveSegments: 10 });
      g.rotateY(Math.PI / 2);
      g.translate(side < 0 ? -0.8 : 0.755, 0, 0);
      add(g, K.paint, 0, 0, 0);
      // sail panel between door and rear window
      const sail = new THREE.Shape();
      sail.moveTo(-0.74, 0.88); sail.lineTo(-0.8, 1.3); sail.lineTo(-1.36, 0.9); sail.lineTo(-1.38, 0.88);
      const sg = new THREE.ExtrudeGeometry(sail, { depth: 0.04, bevelEnabled: false });
      sg.rotateY(Math.PI / 2);
      sg.translate(side < 0 ? -0.72 : 0.68, 0, 0);
      add(sg, K.paint, 0, 0, 0);
      // inner wheel wells / engine bay walls
      add(boxGeo(0.04, 0.42, 1.2), K.dark, side * 0.58, 0.63, -1.36);
      add(boxGeo(0.12, 0.03, 1.3), K.paint, side * 0.715, 0.855, -1.36);
      // rocker sill
      add(boxGeo(0.06, 0.08, 1.5), K.dark, side * 0.76, 0.3, 0);
      // B pillar
      add(boxGeo(0.05, 0.44, 0.06), K.paint, side * 0.715, 1.09, 0.76);
      // quarter-window glass
      const qw = new THREE.Shape();
      qw.moveTo(-0.8, 0.92); qw.lineTo(-0.83, 1.24); qw.lineTo(-1.25, 0.93);
      const qg = new THREE.ShapeGeometry(qw);
      qg.rotateY(Math.PI / 2);
      qg.translate(side * 0.73 + (side < 0 ? -0.005 : 0.005), 0, 0);
      const qm = add(qg, K.glass, 0, 0, 0); qm.material = K.glass;
      qm.castShadow = false;
    }
    add(boxGeo(1.5, 0.05, 3.9), K.dark, 0, 0.29, 0.05);          // floor pan
    add(boxGeo(0.3, 0.14, 1.5), K.dark, 0, 0.37, -0.1);          // tunnel
    add(boxGeo(1.56, 0.42, 0.06), K.paint, 0, 0.5, -2.03);       // front apron
    add(boxGeo(1.5, 0.08, 0.1), K.paint, 0, 0.83, -2.0);         // header panel
    add(boxGeo(1.0, 0.16, 0.03), K.black, 0, 0.58, -2.065);      // grille
    for (let i = 0; i < 4; i++) add(boxGeo(0.98, 0.012, 0.035), K.chrome, 0, 0.52 + i * 0.04, -2.07);
    for (const x of [-0.56, 0.56]) add(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 14).rotateX(Math.PI / 2), K.black, x, 0.6, -2.055);
    add(boxGeo(1.5, 0.5, 0.04), K.dark, 0, 0.58, -0.72);         // firewall
    add(boxGeo(1.5, 0.06, 0.3), K.paint, 0, 0.87, -0.62);        // cowl
    add(boxGeo(1.44, 0.18, 0.22), K.black, 0, 0.78, -0.5);       // dashboard
    for (const x of [-0.46, -0.26]) add(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 16).rotateX(-Math.PI / 2 + 0.5), K.ceramic, x, 0.84, -0.4);
    // windshield + pillars
    const ws = add(boxGeo(1.36, 0.72, 0.02), K.glass, 0, 1.09, -0.445); ws.rotation.x = 0.955; ws.castShadow = false;
    for (const x of [-0.69, 0.69]) { const p = add(boxGeo(0.05, 0.74, 0.05), K.paint, x, 1.09, -0.445); p.rotation.x = 0.955; }
    add(boxGeo(1.44, 0.05, 0.98), K.paint, 0, 1.32, 0.32);      // roof
    const rw = add(boxGeo(1.3, 0.68, 0.02), K.glass, 0, 1.1, 1.075); rw.rotation.x = -0.94; rw.castShadow = false;
    add(boxGeo(1.4, 0.06, 0.06), K.paint, 0, 0.88, 1.38);
    // trunk well and rear panel
    add(boxGeo(1.44, 0.04, 0.66), K.dark, 0, 0.44, 1.69);
    add(boxGeo(1.56, 0.4, 0.05), K.paint, 0, 0.63, 2.03);
    const tl = new THREE.MeshStandardMaterial({ color: 0x5a0a08, emissive: 0xff1a0a, emissiveIntensity: 0 });
    v.brakeMat = tl;
    for (const x of [-0.58, 0.58]) add(boxGeo(0.28, 0.1, 0.03), tl, x, 0.72, 2.06);
    add(boxGeo(1.4, 0.4, 0.04), K.vinyl, 0, 0.6, 0.72);          // rear seat back
    add(boxGeo(1.4, 0.12, 0.45), K.vinyl, 0, 0.46, 0.5);         // rear seat
    // rust patches for character
    for (const [x, y, z] of [[-0.781, 0.4, -1.75], [0.781, 0.36, 1.7], [-0.781, 0.38, 1.9]]) add(boxGeo(0.005, 0.1, 0.22), K.rust, x, y, z);
    // plate holder (plate appears after inspection)
    this.plateMeshes = [];
    for (const z of [-2.075, 2.07]) {
      const pm = add(boxGeo(0.44, 0.11, 0.01), K.dark, 0, 0.4, z);
      if (z > 0) pm.rotation.y = Math.PI;
      this.plateMeshes.push(pm);
    }
    // engine bay glow when looking into it
    body.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    // headlight beams (only active if both headlights fitted)
    addHeadlightBeams(v, [new THREE.Vector3(-0.56, 0.6, -2.15), new THREE.Vector3(0.56, 0.6, -2.15)]);
  }

  setPlates(text) {
    const m = new THREE.MeshStandardMaterial({ map: plateTexture(text), roughness: 0.5 });
    for (const pm of this.plateMeshes) pm.material = m;
  }

  placeOnStands() {
    const s = this.spot;
    this.v.place(s.x, s.y + 0.36, s.z, s.yaw);
    this.v.fixed = true;
    this.onStands = true;
    for (const st of this.stands) {
      st.visible = true;
      _v.copy(st.userData.local).applyAxisAngle(AX.y, s.yaw);
      st.position.set(s.x + _v.x, s.y, s.z + _v.z);
    }
  }

  canLower() { return this.wheelParts.every((id) => this.parts[id].attached); }

  lower() {
    if (!this.onStands) return;
    if (!this.canLower()) { this.game.ui.message('Fit all four wheels before lowering the car.'); this.game.audio.play('error'); return; }
    this.onStands = false;
    this.v.fixed = false;
    this.v.wake();
    for (const st of this.stands) st.visible = false;
    this.game.audio.play('clunk', { pos: this.v.x });
    this.game.ui.message('The Ruska is on its own wheels.');
  }

  // ---------------------------------------------------------------- spawning
  spawnLooseParts() {
    const g = this.garage;
    for (const d of PART_DEFS) {
      if (d.shop) continue;
      const s = SPAWN[d.id];
      if (!s) continue;
      const p = g.toWorld(s[0], s[1], s[2]);
      this.spawnPartProp(d.id, p, s[3] + g.rot);
    }
  }

  buildPartMesh(id) {
    const d = PART_BY_ID[id];
    const src = BUILD[d.build](d.buildArg);
    const m = mergeObject(src);
    if (src.userData.lens) m.userData.lensMat = src.userData.lens.material;
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return m;
  }

  partHalf(mesh) {
    const box = new THREE.Box3().setFromObject(mesh);
    const c = box.getCenter(new THREE.Vector3());
    const h = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    // center the geometry on its origin so physics matches
    for (const ch of mesh.children) ch.position.sub(c);
    return [Math.max(0.02, h.x), Math.max(0.02, h.y), Math.max(0.02, h.z)];
  }

  spawnPartProp(id, pos, yaw = 0, extra = {}) {
    const d = PART_BY_ID[id];
    const P = this.parts[id];
    const m = this.buildPartMesh(id);
    m.position.set(0, 0, 0);
    const half = this.partHalf(m);
    const prop = this.game.props.register(m, { type: 'part:' + id, half, mass: d.mass, name: d.name, part: P, id: extra.propId });
    prop.pos.copy(pos);
    prop.quat.setFromAxisAngle(AX.y, yaw);
    if (extra.quat) prop.quat.copy(extra.quat);
    P.prop = prop;
    return prop;
  }

  // ---------------------------------------------------------------- assembly
  parentAttached(d) {
    if (d.parent !== 'body' && !this.parts[d.parent].attached) return false;
    if (d.requires) for (const r of d.requires) if (!this.parts[r].attached) return false;
    return true;
  }

  mountWorld(id, out = new THREE.Vector3()) {
    const d = PART_BY_ID[id];
    return out.set(d.pos[0], d.pos[1], d.pos[2]).applyMatrix4(this.v.body.matrixWorld);
  }

  // For a carried part: which free mount is it near, or is the player aiming at?
  // Plugs can go into any free plug hole.
  nearMount(prop, cam = null, dir = null) {
    const id = prop.type.slice(5);
    let ids = [id];
    if (id.startsWith('plug')) ids = ['plug1', 'plug2', 'plug3', 'plug4'];
    let best = null, bestScore = Infinity;
    for (const cid of ids) {
      const P = this.parts[cid];
      if (P.attached) continue;
      const d = P.def;
      const wp = this.mountWorld(cid, _v);
      const dist = wp.distanceTo(prop.pos);
      let rayDist = Infinity, camDist = Infinity;
      if (cam && dir) {
        const rel = wp.clone().sub(cam);
        camDist = rel.length();
        const along = rel.dot(dir);
        if (along > 0) rayDist = rel.addScaledVector(dir, -along).length();
      }
      const show = dist < 1.0 || (camDist < 2.8 && rayDist < 0.6);
      if (!show) continue;
      const near = dist < 0.45 || (camDist < 2.4 && rayDist < 0.24);
      const score = Math.min(dist, rayDist + 0.1);
      if (score < bestScore) {
        bestScore = score;
        const ok = this.parentAttached(d);
        best = { id: cid, dist, near, ok, reason: ok ? '' : this.missingParentText(d) };
      }
    }
    return best;
  }

  missingParentText(d) {
    const need = [];
    if (d.parent !== 'body' && !this.parts[d.parent].attached) need.push(PART_BY_ID[d.parent].name.toLowerCase());
    if (d.requires) for (const r of d.requires) if (!this.parts[r].attached) need.push(PART_BY_ID[r].name.toLowerCase());
    return 'Needs the ' + need.join(' and ') + ' first';
  }

  attach(id, prop) {
    const game = this.game;
    const P = this.parts[id];
    const d = P.def;
    if (P.attached) return false;
    // the physical prop may carry the identity of another plug
    if (prop) {
      const srcId = prop.type.slice(5);
      if (srcId !== id) {
        this.parts[srcId].prop = null;
      }
      game.props.remove(prop);
    }
    const m = this.buildPartMesh(id);
    this.partHalf(m);
    m.position.set(d.pos[0], d.pos[1], d.pos[2]);
    if (d.rot) m.rotation.set(d.rot[0], d.rot[1], d.rot[2]);
    m.traverse((o) => { if (o.isMesh) { o.userData.part = P; } });
    this.v.body.add(m);
    P.mesh = m;
    P.attached = true;
    P.prop = null;
    P.bolts.fill(0);
    // nuts
    P.boltMeshes = [];
    const bolts = d.bolts === 'lugs' ? [0, 1, 2, 3].map((i) => { const a = i / 4 * Math.PI * 2 + Math.PI / 4; return [d.side * 0.1, Math.cos(a) * 0.1, Math.sin(a) * 0.1]; }) : d.bolts;
    const nutGeo = new THREE.CylinderGeometry(d.id.startsWith('plug') ? 0.012 : 0.018, d.id.startsWith('plug') ? 0.012 : 0.018, 0.022, 6);
    bolts.forEach((b, i) => {
      const nut = new THREE.Mesh(nutGeo, mats().nutLoose);
      const axis = d.axis;
      if (axis === 'x') nut.rotation.z = Math.PI / 2;
      if (axis === 'z') nut.rotation.x = Math.PI / 2;
      nut.userData.base = new THREE.Vector3(b[0], b[1], b[2]);
      nut.userData.axis = axis;
      nut.userData.sign = axis === 'x' ? Math.sign(b[0] || d.side || 1) : axis === 'z' ? Math.sign(b[2] || 1) : 1;
      nut.userData.bolt = { part: P, index: i };
      nut.castShadow = true;
      // generous invisible hit area so the crosshair stays on the bolt as it turns
      const hit = new THREE.Mesh(boltHitGeo, boltHitMat);
      hit.userData.bolt = nut.userData.bolt;
      nut.add(hit);
      m.add(nut);
      P.boltMeshes.push(nut);
    });
    this.updateBoltVisuals(P);
    // wheels & mass
    if (id.startsWith('wheel')) {
      const w = this.v.wheels[this.wheelParts.indexOf(id)];
      w.present = true;
      w.mesh = m;
      m.position.set(w.hub.x, w.hub.y, w.hub.z);
    }
    if (id === 'steering') this.v.steeringWheel = m.children[0] ? m : m;
    if (id === 'hood') this.setHood(false);
    this.updateMass();
    this.v.wake();
    game.audio.play('clunk', { pos: this.mountWorld(id) });
    return true;
  }

  detach(id, { carry = true, fling = null } = {}) {
    const game = this.game;
    const P = this.parts[id];
    if (!P.attached) return null;
    const children = PART_DEFS.filter((d) => (d.parent === id || (d.requires && d.requires.includes(id))) && this.parts[d.id].attached);
    const wp = new THREE.Vector3();
    P.mesh.getWorldPosition(wp);
    const wq = new THREE.Quaternion();
    P.mesh.getWorldQuaternion(wq);
    this.v.body.remove(P.mesh);
    P.mesh = null;
    P.attached = false;
    P.boltMeshes = [];
    if (id.startsWith('wheel')) {
      const w = this.v.wheels[this.wheelParts.indexOf(id)];
      w.present = false; w.mesh = null; w.contact = false;
    }
    if (id === 'steering') this.v.steeringWheel = null;
    if (id === 'hood') this.hoodOpen = false;
    const prop = this.spawnPartProp(id, wp, 0, { quat: wq });
    if (fling) { prop.vel.copy(fling); prop.angVel.set(Math.random() * 4 - 2, Math.random() * 4 - 2, Math.random() * 4 - 2); }
    if (id === 'oilpan' && this.v.engine.oil > 0) { this.v.engine.oil = 0; game.ui.message('Oil pours out onto the floor.'); }
    if (id === 'hoses' || id === 'radiator') this.v.engine.coolant = 0;
    // children come off too
    for (const c of children) this.detach(c.id, { carry: false, fling: fling ? fling.clone().multiplyScalar(0.8) : new THREE.Vector3(0, 0.5, 0) });
    this.updateMass();
    this.v.wake();
    game.audio.play('metal', { pos: wp });
    return prop;
  }

  updateMass() {
    let m = 320;
    for (const P of Object.values(this.parts)) if (P.attached) m += P.def.mass;
    this.v.setMass(m);
  }

  canDetach(P) {
    if (!P.attached) return { ok: false };
    if (P.bolts.some((b) => b > 0)) return { ok: false, reason: 'Loosen all its bolts first' };
    const kids = PART_DEFS.filter((d) => (d.parent === P.def.id) && this.parts[d.id].attached);
    if (kids.length) return { ok: false, reason: 'Remove the ' + kids[0].name.toLowerCase() + ' first' };
    if (P.def.id.startsWith('wheel') && !this.onStands && !this.v.fixed) {
      // allowed: the car just drops on that corner
    }
    return { ok: true };
  }

  turnBolt(P, i, dir) {
    const cur = P.bolts[i];
    const next = clamp(cur + dir, 0, BOLT_MAX);
    if (next === cur) return false;
    P.bolts[i] = next;
    this.updateBoltVisuals(P);
    this.v.wake();
    return true;
  }

  updateBoltVisuals(P) {
    const K = mats();
    P.boltMeshes.forEach((nut, i) => {
      const t = P.bolts[i];
      const out = (BOLT_MAX - t) * 0.004 + 0.004;
      const b = nut.userData.base;
      nut.position.copy(b);
      const ax = nut.userData.axis;
      if (ax === 'x') nut.position.x += out * nut.userData.sign;
      else if (ax === 'z') nut.position.z += out * nut.userData.sign;
      else nut.position.y += out;
      nut.material = t >= BOLT_MAX ? K.nutTight : K.nutLoose;
    });
  }

  tightness(P) {
    if (!P.attached) return 0;
    if (!P.bolts.length) return 1;
    return P.bolts.reduce((a, b) => a + b, 0) / (P.bolts.length * BOLT_MAX);
  }

  isTight(id) { const P = this.parts[id]; return P.attached && this.tightness(P) >= 1; }
  has(id) { return this.parts[id].attached; }

  setHood(open) {
    const P = this.parts.hood;
    if (!P.attached || !P.mesh) return;
    this.hoodOpen = open;
    const d = P.def;
    // hinge at the rear edge of the hood
    const hinge = new THREE.Vector3(0, d.pos[1] + 0.02, d.pos[2] + 0.64);
    const ang = open ? 1.15 : 0;
    const rel = new THREE.Vector3(0, -0.02, -0.64);
    rel.applyAxisAngle(AX.x, ang - 0.05);
    P.mesh.position.copy(hinge).add(rel);
    P.mesh.rotation.set(ang - 0.05, 0, 0);
  }

  // ---------------------------------------------------------------- engine logic
  plugCount() { return ['plug1', 'plug2', 'plug3', 'plug4'].filter((id) => this.has(id) && this.tightness(this.parts[id]) >= 0.5).length; }

  canStart() {
    const e = this.v.engine;
    const need = (id) => this.has(id);
    if (!need('block') || !need('head')) return { ok: false, reason: 'The engine is not assembled', hint: 'The starter spins, but there is no engine to turn over.' };
    if (this.tightness(this.parts.head) < 0.75) return { ok: false, reason: 'No compression', hint: 'It turns over too easily. The cylinder head bolts must be loose.' };
    if (!need('battery')) return { ok: false, reason: 'No battery' };
    if (!need('fueltank') || e.fuel <= 0.05) return { ok: false, reason: 'No fuel', hint: 'It cranks but never catches. No fuel?' };
    if (!need('carb')) return { ok: false, reason: 'No carburettor', hint: 'It cranks but never catches. Something in the fuel system is missing.' };
    if (!need('distributor')) return { ok: false, reason: 'No spark', hint: 'No spark. The distributor is missing.' };
    if (this.plugCount() < 2) return { ok: false, reason: 'No spark', hint: 'No spark. Check the spark plugs.' };
    if (e.wear >= 100) return { ok: false, reason: 'The engine is seized', hint: 'The engine is seized solid. It needs a rebuild kit.' };
    if (Math.abs(e.timing - IDEAL_TIMING) > 14) return { ok: false, reason: 'Timing way off', hint: 'It coughs but will not run. The ignition timing is far off.' };
    if (Math.abs(e.mixture - IDEAL_MIXTURE) > 4.5) return { ok: false, reason: 'Mixture way off', hint: 'It floods or starves. The carburettor mixture is far off.' };
    return { ok: true, reason: '' };
  }

  quality() {
    const e = this.v.engine;
    const plugs = this.plugCount();
    const mixErr = Math.abs((e.mixture ?? IDEAL_MIXTURE) - IDEAL_MIXTURE);
    const timErr = Math.abs((e.timing ?? IDEAL_TIMING) - IDEAL_TIMING);
    let power = (plugs / 4) * (1 - Math.min(0.55, mixErr * 0.11)) * (1 - Math.min(0.5, timErr * 0.045));
    if (!this.has('airfilter')) power *= 1.02;
    let rough = (4 - plugs) * 0.28 + mixErr * 0.06 + timErr * 0.025;
    if (this.has('carb') && this.tightness(this.parts.carb) < 1) rough += 0.2;
    let loud = 0;
    if (!this.has('exhaust')) loud = 1; else if (!this.has('muffler')) loud = 0.65;
    if (!this.has('airfilter')) loud += 0.08;
    let cooling = 1;
    if (!this.has('radiator') || !this.has('hoses')) cooling = 0.08;
    else if (!this.has('fanbelt')) cooling = 0.18;
    else if ((e.coolant || 0) < 1.5) cooling = 0.1 + (e.coolant || 0) * 0.3;
    const charging = this.has('alternator') && this.has('fanbelt');
    const oilOK = this.has('oilpan') && e.oil > 1.2;
    const startEase = (plugs / 4) * (1 - Math.min(0.8, mixErr * 0.15)) * (1 - Math.min(0.8, timErr * 0.06));
    const drive = this.has('gearbox') && this.has('driveshaft');
    this.v.driveEnabled = drive;
    return { power, rough: Math.min(1.2, rough), startEase, loud, cooling, charging, oilOK };
  }

  // Loose parts shake off with vibration; crashes throw them off.
  update(dt) {
    const v = this.v;
    const e = v.engine;
    // leaks
    if (!this.has('oilpan') && e.oil > 0) e.oil = 0;
    if ((!this.has('hoses') || !this.has('radiator')) && e.coolant > 0) e.coolant = 0;
    // headlight beams need the lamps fitted
    this.beamsOn = v.lights && (this.has('lightL') || this.has('lightR')) && e.battery > 0.02;
    for (const id of ['lightL', 'lightR']) {
      const P = this.parts[id];
      if (P.mesh && P.mesh.userData.lensMat) P.mesh.userData.lensMat.emissiveIntensity = v.lights && e.battery > 0.02 ? 3 : 0;
    }
    if (!this.has('steering')) v.steer = 0;
    // vibration
    this.vibT += dt;
    if (this.vibT < 0.5) return;
    const step = this.vibT; this.vibT = 0;
    if (v.fixed) return;
    const vib = v.speed / 18 + (e.running ? e.rpm / 9000 : 0) + (v.skid || 0) * 0.3;
    if (vib < 0.15) return;
    for (const P of Object.values(this.parts)) {
      if (!P.attached || !P.bolts.length) continue;
      const t = this.tightness(P);
      if (t >= 1) continue;
      if (P.def.id === 'block') continue;
      const chance = Math.pow(1 - t, 2) * vib * 0.05 * step;
      if (Math.random() < chance) {
        const fwd = v.forward(new THREE.Vector3());
        const fl = v.vel.clone().addScaledVector(fwd, -1).add(new THREE.Vector3(0, 1.2, 0));
        this.detach(P.def.id, { carry: false, fling: fl });
        this.game.ui.message(`Something fell off the car: ${P.def.name.toLowerCase()}.`);
      }
    }
  }

  onImpact(imp) {
    if (imp < 7) return;
    for (const P of Object.values(this.parts)) {
      if (!P.attached || P.def.id === 'block') continue;
      const t = this.tightness(P);
      const loosen = imp > 12 ? 1 : imp > 9 ? 0.6 : 0.3;
      if ((['bumperF', 'bumperR', 'lightL', 'lightR', 'hood', 'doorL', 'doorR', 'trunk'].includes(P.def.id)) && Math.random() < (loosen - t * 0.5)) {
        P.bolts = P.bolts.map((b) => Math.max(0, b - Math.ceil(Math.random() * 3)));
        this.updateBoltVisuals(P);
      }
    }
  }

  // What to do next, for the workshop notes.
  nextSteps() {
    const e = this.v.engine;
    const steps = [];
    const missing = PART_DEFS.filter((d) => !this.has(d.id));
    const fittable = missing.filter((d) => this.parentAttached(d) && !d.shop);
    const plugsMissing = missing.some((d) => d.shop);
    const loose = PART_DEFS.filter((d) => this.has(d.id) && this.tightness(this.parts[d.id]) < 1);
    if (fittable.length) steps.push(`Fit the ${fittable.slice(0, 3).map((d) => d.name.toLowerCase()).join(', ')}${fittable.length > 3 ? '…' : ''}`);
    if (plugsMissing && this.has('head')) steps.push('Buy spark plugs at the shop in Kylänmäki and screw them into the head');
    if (loose.length) steps.push(`Tighten the bolts on the ${loose.slice(0, 3).map((d) => d.name.toLowerCase()).join(', ')}${loose.length > 3 ? '…' : ''}`);
    if (this.has('head') && e.oil < 3) steps.push('Pour in engine oil (about 3,5 L)');
    if (this.has('hoses') && (e.coolant || 0) < 4) steps.push('Fill the radiator with coolant');
    if (this.has('fueltank') && e.fuel < 5) steps.push('Put fuel in the tank (jerry can or pump)');
    if (this.has('battery') && e.battery < 0.3) steps.push('Charge the battery on the workbench');
    if (this.onStands && this.canLower()) steps.push('Lower the car off the jack stands');
    if (this.has('carb') && Math.abs(e.mixture - IDEAL_MIXTURE) > 0.9) steps.push('Adjust the carburettor mixture toward 14,7 : 1');
    if (this.has('distributor') && Math.abs(e.timing - IDEAL_TIMING) > 3) steps.push(`Set the ignition timing to about ${IDEAL_TIMING}°`);
    if (!steps.length && !this.inspected) steps.push('Drive into the inspection hall in Kylänmäki (weekdays 8–16)');
    if (this.inspected) steps.push('The Ruska is road legal. Enjoy the summer.');
    return steps.slice(0, 5);
  }

  // ---------------------------------------------------------------- inspection checklist
  inspectionReport() {
    const e = this.v.engine;
    const all = PART_DEFS.every((d) => this.has(d.id));
    const tight = PART_DEFS.every((d) => !this.has(d.id) || this.tightness(this.parts[d.id]) >= 1);
    const missing = PART_DEFS.filter((d) => !this.has(d.id)).map((d) => d.name);
    const loose = PART_DEFS.filter((d) => this.has(d.id) && this.tightness(this.parts[d.id]) < 1).map((d) => d.name);
    const cs = this.canStart();
    const rows = [
      { label: 'All parts fitted', ok: all, note: missing.length ? 'Missing: ' + missing.slice(0, 4).join(', ') + (missing.length > 4 ? '…' : '') : '' },
      { label: 'All bolts tight', ok: tight, note: loose.length ? 'Loose: ' + loose.slice(0, 4).join(', ') + (loose.length > 4 ? '…' : '') : '' },
      { label: 'Exhaust and muffler', ok: this.isTight('exhaust') && this.isTight('muffler') },
      { label: 'Headlights', ok: this.isTight('lightL') && this.isTight('lightR') },
      { label: 'Engine starts', ok: cs.ok && e.battery > 0.1, note: cs.ok ? '' : cs.reason },
      { label: 'Idle mixture 13,8–15,6 : 1', ok: Math.abs(e.mixture - IDEAL_MIXTURE) <= 0.9, note: e.mixture.toFixed(1).replace('.', ',') + ' : 1' },
      { label: `Ignition timing ${IDEAL_TIMING}° ± 3°`, ok: Math.abs(e.timing - IDEAL_TIMING) <= 3, note: e.timing.toFixed(0) + '° BTDC' },
      { label: 'Engine oil', ok: e.oil >= 2.5, note: e.oil.toFixed(1).replace('.', ',') + ' L' },
      { label: 'Coolant', ok: (e.coolant || 0) >= 3, note: (e.coolant || 0).toFixed(1).replace('.', ',') + ' L' },
      { label: 'Engine condition', ok: e.wear < 60, note: Math.round(100 - e.wear) + ' %' },
    ];
    return { rows, pass: rows.every((r) => r.ok) };
  }

  // ---------------------------------------------------------------- save/load
  serialize() {
    const e = this.v.engine;
    const parts = {};
    for (const [id, P] of Object.entries(this.parts)) parts[id] = { a: P.attached, b: P.bolts.slice() };
    return {
      parts, onStands: this.onStands, hoodOpen: this.hoodOpen, inspected: this.inspected,
      oil: e.oil, coolant: e.coolant, mixture: e.mixture, timing: e.timing, wear: e.wear, fuel: e.fuel, battery: e.battery,
    };
  }

  restore(s) {
    for (const [id, st] of Object.entries(s.parts)) {
      if (st.a) {
        this.attach(id, null);
        this.parts[id].bolts = st.b.slice();
        this.updateBoltVisuals(this.parts[id]);
      }
    }
    const e = this.v.engine;
    Object.assign(e, { oil: s.oil, coolant: s.coolant, mixture: s.mixture, timing: s.timing, wear: s.wear, fuel: s.fuel, battery: s.battery });
    if (s.hoodOpen) this.setHood(true);
    this.inspected = !!s.inspected;
    if (this.inspected) this.setPlates('RUS-179');
  }
}
