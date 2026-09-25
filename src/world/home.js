import * as THREE from 'three';
import { Builder } from './builder.js';
import { materials, windowMaterial } from './materials.js';
import { boxGeo, mergeGeos, paint } from '../core/geo.js';
import { textTexture, smokeTexture } from '../core/textures.js';
import { WATER } from './layout.js';

// The player's homestead: red-ochre house, garage, woodshed, lakeside sauna and pier.
export function buildHome(game) {
  const M = materials();
  const pad = game.terrain.pads.find((p) => p.name === 'home');
  const H = pad.h;
  const home = { lights: [], lightsOn: false };

  // ---------------- House ----------------
  const winMat = windowMaterial();
  home.windowMat = winMat;
  const hb = new Builder(game, -240, H, 188, 0, 'house');
  home.house = hb;
  const FY = 0.65;
  hb.box(11.3, 0.65, 8.3, M.stone, 0, 0.3, 0, { tex: 1 });
  hb.box(11, 0.05, 8, M.floor, 0, FY - 0.025, 0, { tex: 2, surface: 'wood' });
  // steps
  hb.box(1.4, 0.22, 0.42, M.stone, 1.9, 0.11, 4.8, { surface: 'stone' });
  hb.box(1.4, 0.44, 0.42, M.stone, 1.9, 0.22, 4.38, { surface: 'stone' });
  const y0 = 0.6, WH = 2.62;
  hb.wallX(-5.5, 5.5, 3.925, y0, WH, 0.15, [
    { a: 1.4, b: 2.4, y0: 0, y1: 2.12 },
    { a: -1.9, b: -0.5, y0: 0.95, y1: 2.0, window: true },
    { a: 3.6, b: 4.9, y0: 0.95, y1: 2.0, window: true },
    { a: -4.4, b: -3.7, y0: 1.5, y1: 2.05, window: true },
  ], M.faluRed, M.wallpaper, 1, winMat);
  hb.wallX(-5.5, 5.5, -3.925, y0, WH, 0.15, [
    { a: -3.8, b: -2.4, y0: 0.95, y1: 2.0, window: true },
    { a: 2.2, b: 3.6, y0: 1.2, y1: 2.0, window: true },
  ], M.faluRed, M.wallpaper, -1, winMat);
  hb.wallZ(-3.85, 3.85, 5.425, y0, WH, 0.15, [{ a: -1.0, b: 0.4, y0: 0.95, y1: 2.0, window: true }], M.faluRed, M.wallpaper, 1, winMat);
  hb.wallZ(-3.85, 3.85, -5.425, y0, WH, 0.15, [{ a: -2.6, b: -1.4, y0: 0.95, y1: 2.0, window: true }], M.faluRed, M.wallpaper, -1, winMat);
  // interior partitions
  hb.wallZ(-3.85, 3.85, 0.5, y0, WH, 0.1, [{ a: -2.4, b: -1.5, y0: 0, y1: 2.05 }, { a: 1.6, b: 2.5, y0: 0, y1: 2.05 }], M.wallpaper, M.wallpaper, 0);
  hb.wallX(-5.35, 0.45, 0, y0, WH, 0.1, [{ a: -1.6, b: -0.7, y0: 0, y1: 2.05 }], M.wallpaper, M.wallpaper, 0);
  hb.wallZ(0.05, 3.85, -2, y0, WH, 0.1, [{ a: 0.4, b: 1.3, y0: 0, y1: 2.05 }], M.blueTiles, M.blueTiles, 0);
  // corner trims
  for (const [x, z] of [[-5.5, -4], [5.5, -4], [-5.5, 4], [5.5, 4]]) hb.box(0.16, WH, 0.16, M.trim, x, y0 + WH / 2, z, { collide: false });
  // ceiling + roof
  hb.box(11, 0.08, 8, M.white, 0, y0 + WH + 0.04, 0, { tex: 3 });
  hb.gableRoofX(5.55, 4.05, y0 + WH + 0.05, 2.3, 0.55, M.roof, M.faluRed);
  hb.box(0.7, 1.6, 0.7, M.stone, 2.2, y0 + WH + 1.8, -1.0, { collide: false });
  // bathroom floor tiles
  hb.box(3.3, 0.02, 3.8, M.tiles, -3.68, FY + 0.01, 1.95, { collide: false, tex: 1 });
  // front door frame and door leaf (open, against the wall)
  hb.box(0.08, 2.14, 0.2, M.trim, 1.36, y0 + 1.07, 3.95, { collide: false });
  hb.box(0.08, 2.14, 0.2, M.trim, 2.44, y0 + 1.07, 3.95, { collide: false });
  const door = hb.box(0.05, 2.05, 0.95, M.greenBoards, 2.43, y0 + 1.04, 3.35, { collide: false });
  door.rotation.y = 0.15;

  // --- Kitchen ---
  hb.box(3.4, 0.9, 0.6, M.wood, 2.7, FY + 0.45, -3.55);
  hb.box(3.44, 0.04, 0.64, M.white, 2.7, FY + 0.92, -3.55, { collide: false });
  const sink = hb.box(0.6, 0.12, 0.45, M.metal, 2.9, FY + 0.88, -3.55, { collide: false });
  const tap = hb.mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), M.chrome, 2.9, FY + 1.07, -3.78);
  hb.interact(sink, { name: 'Kitchen tap', hint: () => 'Drink water', use: (g) => g.actions.drinkTap() });
  hb.interact(tap, sink.userData.target || { name: 'Kitchen tap', hint: () => 'Drink water', use: (g) => g.actions.drinkTap() });
  // stove
  hb.box(0.6, 0.9, 0.6, M.enamel, 4.1, FY + 0.45, -3.55);
  for (const [dx, dz] of [[-0.14, -0.13], [0.14, -0.13], [-0.14, 0.13], [0.14, 0.13]]) {
    hb.mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 12), M.black, 4.1 + dx, FY + 0.91, -3.55 + dz);
  }
  // fridge
  const fridge = hb.box(0.7, 1.7, 0.66, M.enamel, 5.0, FY + 0.85, -3.52);
  hb.box(0.04, 0.4, 0.04, M.chrome, 4.72, FY + 1.1, -3.17, { collide: false });
  hb.interact(fridge, { name: 'Fridge', hint: () => null, use: () => {} });
  // coffee maker
  const cm = new THREE.Group();
  const cmBase = new THREE.Mesh(boxGeo(0.22, 0.34, 0.24), M.red);
  cmBase.position.y = 0.17; cm.add(cmBase);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.14, 10), M.glass);
  pot.position.set(0, 0.08, 0.1); cm.add(pot);
  cm.position.set(1.35, FY + 0.94, -3.55);
  hb.group.add(cm);
  cmBase.castShadow = true;
  home.coffeeMaker = cm;
  hb.interact(cmBase, { name: 'Coffee maker', hint: (g) => g.actions.coffeeHint(), use: (g) => g.actions.makeCoffee() });
  // table and chairs
  hb.box(1.2, 0.05, 0.8, M.wood, 3.2, FY + 0.74, 0.8, { collide: false });
  for (const [dx, dz] of [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]]) hb.box(0.05, 0.72, 0.05, M.wood, 3.2 + dx, FY + 0.36, 0.8 + dz, { collide: false });
  hb.collider(1.2, 0.76, 0.8, 3.2, FY + 0.38, 0.8);
  for (const dz of [-0.75, 0.75]) {
    hb.box(0.42, 0.04, 0.42, M.wood, 3.2, FY + 0.45, 0.8 + dz * 1.05, { collide: false });
    hb.box(0.42, 0.45, 0.04, M.wood, 3.2, FY + 0.7, 0.8 + dz * 1.35, { collide: false });
  }
  // wall phone (dial telephone)
  const phone = new THREE.Group();
  const pb = new THREE.Mesh(boxGeo(0.2, 0.26, 0.1), M.orange); pb.castShadow = true; phone.add(pb);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 14), M.white); dial.rotation.x = Math.PI / 2; dial.position.set(0, -0.03, 0.06); phone.add(dial);
  const handset = new THREE.Mesh(boxGeo(0.05, 0.26, 0.06), M.orange); handset.position.set(-0.13, 0, 0.03); phone.add(handset);
  phone.position.set(5.3, FY + 1.45, 2.4); phone.rotation.y = -Math.PI / 2;
  hb.group.add(phone);
  hb.interact(pb, { name: 'Telephone', hint: () => 'Make a call', use: (g) => g.actions.openPhone() });
  hb.interact(handset, pb.userData.target);
  // light switch
  const sw = hb.box(0.08, 0.12, 0.03, M.white, 1.05, FY + 1.3, 3.83, { collide: false });
  hb.interact(sw, { name: 'Light switch', hint: () => (home.lightsOn ? 'Lights off' : 'Lights on'), use: (g) => g.actions.toggleHouseLights() });
  const sw2 = hb.box(0.03, 0.12, 0.08, M.white, 0.44, FY + 1.3, -1.2, { collide: false });
  hb.interact(sw2, sw.userData.target);

  // --- Bedroom ---
  hb.box(2.0, 0.42, 1.05, M.darkWood, -4.3, FY + 0.21, -1.9);
  const mattress = hb.box(1.95, 0.14, 1.0, M.white, -4.3, FY + 0.49, -1.9, { collide: false });
  const blanket = hb.box(1.4, 0.06, 1.04, M.blanket, -4.0, FY + 0.58, -1.9, { collide: false });
  hb.box(0.4, 0.1, 0.7, M.white, -5.05, FY + 0.6, -1.9, { collide: false });
  hb.box(0.06, 0.9, 1.05, M.darkWood, -5.3, FY + 0.45, -1.9, { collide: false });
  const bedTarget = { name: 'Bed', hint: (g) => g.actions.sleepHint(), use: (g) => g.actions.sleep() };
  hb.interact(mattress, bedTarget); hb.interact(blanket, bedTarget);
  hb.box(0.45, 0.5, 0.4, M.darkWood, -4.9, FY + 0.25, -0.6);
  hb.box(1.2, 2.0, 0.55, M.darkWood, -0.5, FY + 1.0, -3.5);
  hb.box(2.2, 0.01, 1.4, M.cloth, -3.0, FY + 0.005, -1.4, { collide: false });
  // alarm clock on nightstand
  const clock = hb.box(0.12, 0.1, 0.06, M.black, -4.9, FY + 0.55, -0.6, { collide: false });
  hb.interact(clock, { name: 'Alarm clock', hint: (g) => g.clockText(), use: () => {} });

  // --- Bathroom ---
  hb.box(1.1, 0.08, 1.1, M.white, -4.75, FY + 0.04, 3.25, { collide: false });
  hb.box(0.04, 2.0, 1.1, M.glass, -4.18, FY + 1.0, 3.25, { cast: false });
  const shower = hb.mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.05, 10), M.chrome, -4.9, FY + 2.05, 3.5);
  hb.box(0.03, 1.2, 0.03, M.chrome, -5.28, FY + 1.5, 3.5, { collide: false });
  hb.hitBox(0.9, 1.8, 0.9, -4.75, FY + 1.0, 3.25, { name: 'Shower', hint: () => 'Take a shower', use: (g) => g.actions.shower() });
  const toilet = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.42, 14), M.enamel); bowl.position.y = 0.21; toilet.add(bowl);
  const tank = new THREE.Mesh(boxGeo(0.4, 0.4, 0.16), M.enamel); tank.position.set(0, 0.62, -0.26); toilet.add(tank);
  toilet.position.set(-2.55, FY, 3.3); toilet.rotation.y = -Math.PI / 2;
  bowl.castShadow = tank.castShadow = true;
  hb.group.add(toilet);
  hb.collider(0.5, 0.45, 0.6, -2.55, FY + 0.22, 3.3);
  const toiletT = { name: 'Toilet', hint: () => 'Use the toilet', use: (g) => g.actions.toilet() };
  hb.interact(bowl, toiletT); hb.interact(tank, toiletT);
  hb.box(0.5, 0.15, 0.4, M.enamel, -5.05, FY + 0.85, 0.6, { collide: false });
  hb.box(0.02, 0.5, 0.4, M.chrome, -5.33, FY + 1.35, 0.6, { collide: false });

  // --- Living corner ---
  hb.box(0.8, 0.42, 0.8, M.fabric, -1.2, FY + 0.21, 3.0);
  hb.box(0.8, 0.5, 0.15, M.fabric, -1.2, FY + 0.67, 3.35, { collide: false });
  hb.box(0.6, 0.55, 0.4, M.darkWood, -0.15, FY + 0.27, 3.5);
  const radio = new THREE.Group();
  const rb = new THREE.Mesh(boxGeo(0.46, 0.26, 0.18), M.wood); rb.castShadow = true; radio.add(rb);
  const grille = new THREE.Mesh(boxGeo(0.2, 0.18, 0.01), M.fabric); grille.position.set(-0.1, 0, 0.095); radio.add(grille);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 10), M.white); knob.rotation.x = Math.PI / 2; knob.position.set(0.13, -0.05, 0.1); radio.add(knob);
  radio.position.set(-0.15, FY + 0.68, 3.5); radio.rotation.y = Math.PI;
  hb.group.add(radio);
  home.radio = { mesh: radio, on: false, pos: hb.toWorld(-0.15, FY + 0.7, 3.5) };
  hb.interact(rb, { name: 'Radio', hint: () => (home.radio.on ? 'Switch off' : 'Switch on'), use: (g) => g.actions.toggleRadio(home.radio) });
  hb.interact(grille, rb.userData.target);

  // house lights
  for (const [x, z] of [[3, 0], [-2.7, -2], [-0.8, 2.2], [-3.7, 2]]) {
    const l = hb.pointLight(x, y0 + WH - 0.35, z, 0xffd7a0, 0, 7);
    home.lights.push(l);
    const shade = hb.mesh(new THREE.ConeGeometry(0.22, 0.18, 12, 1, true), M.orange, x, y0 + WH - 0.25, z);
    shade.material = M.orange;
    const bulb = hb.mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshStandardMaterial({ color: 0xfff4dd, emissive: 0xffd89a, emissiveIntensity: 0 }), x, y0 + WH - 0.33, z, { cast: false });
    home.lights.push({ bulb });
  }

  // ---------------- Garage ----------------
  const gb = new Builder(game, -214, H, 186, 0, 'garage');
  home.garage = gb;
  gb.box(7.4, 0.24, 9.8, M.concrete, 0, 0.0, 0, { tex: 3, surface: 'concrete' });
  const GY = 0.1, GH = 2.9;
  gb.wallX(-3.6, 3.6, 4.825, GY, GH, 0.15, [{ a: -1.75, b: 1.75, y0: 0, y1: 2.55 }], M.greyBoards, M.greyBoards, 1);
  gb.wallX(-3.6, 3.6, -4.825, GY, GH, 0.15, [], M.greyBoards, M.greyBoards, -1);
  gb.wallZ(-4.75, 4.75, 3.525, GY, GH, 0.15, [{ a: -2.5, b: -1.2, y0: 1.1, y1: 1.9, window: true }], M.greyBoards, M.greyBoards, 1, winMat);
  gb.wallZ(-4.75, 4.75, -3.525, GY, GH, 0.15, [], M.greyBoards, M.greyBoards, -1);
  for (const [x, z] of [[-3.6, -4.9], [3.6, -4.9], [-3.6, 4.9], [3.6, 4.9]]) gb.box(0.16, GH, 0.16, M.trim, x, GY + GH / 2, z, { collide: false });
  gb.box(3.7, 0.18, 0.2, M.trim, 0, GY + 2.64, 4.9, { collide: false });
  gb.gableRoofZ(3.65, 4.9, GY + GH, 1.5, 0.45, M.roofRed, M.greyBoards);
  // open garage doors swung back against the front wall
  gb.box(1.7, 2.5, 0.06, M.faluRed, -2.65, GY + 1.25, 5.0, { collide: false, rot: 0 });
  gb.box(1.7, 2.5, 0.06, M.faluRed, 2.65, GY + 1.25, 5.0, { collide: false, rot: 0 });
  // workbench
  gb.box(0.75, 0.06, 3.4, M.wood, 3.05, GY + 0.93, -1.2, { collide: false });
  for (const dz of [-1.6, 0, 1.6]) gb.box(0.7, 0.9, 0.06, M.wood, 3.05, GY + 0.45, -1.2 + dz, { collide: false });
  gb.collider(0.75, 0.96, 3.4, 3.05, GY + 0.48, -1.2);
  gb.box(0.02, 0.9, 3.4, M.darkWood, 3.44, GY + 1.4, -1.2, { collide: false }); // pegboard
  gb.box(0.2, 0.15, 0.12, M.darkMetal, 3.1, GY + 1.04, -2.6, { collide: false }); // vise
  // tool silhouettes on pegboard
  for (let i = 0; i < 7; i++) gb.box(0.02, 0.22 + (i % 3) * 0.06, 0.04, M.metal, 3.42, GY + 1.5, -2.4 + i * 0.35, { collide: false });
  // shelves west wall
  for (const y of [0.05, 0.75, 1.45, 2.1]) gb.box(0.55, 0.04, 3.2, M.wood, -3.15, GY + y + 0.02, -1.6, { surface: 'wood' });
  for (const dz of [-1.55, 1.55]) gb.box(0.55, 2.2, 0.05, M.wood, -3.15, GY + 1.1, -1.6 + dz, { collide: false });
  // oil drum and tyres
  gb.mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 16), M.red, -2.9, GY + 0.44, 3.9);
  gb.collider(0.6, 0.9, 0.6, -2.9, GY + 0.45, 3.9);
  for (let i = 0; i < 3; i++) gb.mesh(new THREE.TorusGeometry(0.25, 0.1, 8, 16), M.rubber, -2.9, GY + 0.1 + i * 0.2, 2.9, { rotX: Math.PI / 2 });
  gb.collider(0.7, 0.6, 0.7, -2.9, GY + 0.3, 2.9);
  // hanging lamp
  const tube = gb.box(0.12, 0.06, 1.3, M.white, 0, GY + GH - 0.2, -0.5, { collide: false });
  const tubeGlow = new THREE.MeshStandardMaterial({ color: 0xfaf6ea, emissive: 0xeef4ff, emissiveIntensity: 0 });
  gb.box(0.08, 0.03, 1.2, tubeGlow, 0, GY + GH - 0.24, -0.5, { collide: false, cast: false });
  const gl = gb.pointLight(0, GY + GH - 0.4, -0.5, 0xf2f4ff, 0, 12);
  home.garageLight = { light: gl, glow: tubeGlow, on: false };
  const gsw = gb.box(0.08, 0.12, 0.03, M.white, 2.1, GY + 1.3, 4.72, { collide: false });
  gb.interact(gsw, { name: 'Garage light', hint: () => (home.garageLight.on ? 'Light off' : 'Light on'), use: (g) => g.actions.toggleGarageLight() });
  // battery charger on bench
  const charger = new THREE.Group();
  const cbox = new THREE.Mesh(boxGeo(0.3, 0.22, 0.2), M.orange); cbox.position.y = 0.11; cbox.castShadow = true; charger.add(cbox);
  const cled = new THREE.Mesh(boxGeo(0.03, 0.03, 0.01), new THREE.MeshStandardMaterial({ color: 0x331111, emissive: 0xff2a1a, emissiveIntensity: 0 }));
  cled.position.set(0.08, 0.16, 0.101); charger.add(cled);
  charger.position.set(3.05, GY + 0.96, -0.35);
  gb.group.add(charger);
  home.charger = { mesh: charger, led: cled, pos: gb.toWorld(3.05, GY + 1.0, -0.35) };
  gb.interact(cbox, { name: 'Battery charger', hint: (g) => g.actions.chargerHint(), use: (g) => g.actions.useCharger() });
  // wall calendar
  const cal = gb.box(0.4, 0.55, 0.01, new THREE.MeshStandardMaterial({ map: textTexture(['HEINÄKUU', '1979'], { width: 128, height: 176, bg: '#efe8d6', fg: '#8a2c20', font: 'bold 26px "Barlow Condensed", sans-serif' }) }), -1.8, GY + 1.6, -4.73, { collide: false });
  cal.castShadow = false;

  home.garagePos = gb.toWorld(0, GY, -0.6);
  home.carSpot = { x: -214, y: H + GY + 0.12, z: 185.2, yaw: Math.PI };

  // ---------------- Woodshed & chopping ----------------
  const wb = new Builder(game, -253, H, 212.5, 0, 'woodshed');
  for (const [x, z] of [[-2, -1.1], [2, -1.1], [-2, 1.1], [2, 1.1]]) wb.box(0.14, 2.3, 0.14, M.darkWood, x, 1.15, z);
  wb.wallX(-2, 2, -1.15, 0, 2.2, 0.06, [], M.greyBoards, M.greyBoards, -1);
  const shedRoof = wb.box(4.6, 0.08, 3.0, M.roof, 0, 2.35, 0, { collide: false });
  shedRoof.rotation.x = -0.12;
  wb.box(3.8, 0.1, 2.0, M.darkWood, 0, 0.05, -0.05, { surface: 'wood' });
  home.woodStack = { builder: wb, count: 0, meshes: [] };
  // firewood instanced stack
  const logGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.42, 5);
  logGeo.rotateX(Math.PI / 2);
  const logMat = new THREE.MeshStandardMaterial({ color: 0xa9825a, roughness: 0.9 });
  const stack = new THREE.InstancedMesh(logGeo, logMat, 120);
  stack.count = 0; stack.castShadow = true; stack.receiveShadow = true;
  wb.group.add(stack);
  home.woodStack.mesh = stack;
  // chopping block + axe
  const cb = new Builder(game, -249.2, H, 215.8, 0.4, 'chopblock');
  const stump = cb.mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.55, 12), M.wood, 0, 0.27, 0);
  cb.collider(0.6, 0.55, 0.6, 0, 0.27, 0);
  const axe = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.75, 6), M.wood); handle.position.y = 0.37; axe.add(handle);
  const head = new THREE.Mesh(boxGeo(0.2, 0.09, 0.03), M.darkMetal); head.position.set(0.06, 0.02, 0); axe.add(head);
  axe.position.set(0.05, 0.55, 0.05); axe.rotation.z = 0.5;
  cb.group.add(axe);
  home.axe = axe;
  home.chopPos = cb.toWorld(0, 0.55, 0);
  const chopT = { name: 'Chopping block', hint: (g) => g.actions.chopHint(), use: (g) => g.actions.chopWood() };
  cb.interact(stump, chopT); cb.interact(handle, chopT); cb.interact(head, chopT);
  // log pile
  const lp = new Builder(game, -256.5, H, 216.8, 0.1, 'logpile');
  for (let i = 0; i < 9; i++) {
    const row = i < 4 ? 0 : i < 7 ? 1 : 2;
    const col = i < 4 ? i : i < 7 ? i - 4 : i - 7;
    lp.mesh(new THREE.CylinderGeometry(0.16, 0.18, 3.2, 8), M.wood, 0, 0.17 + row * 0.3, -0.5 + col * 0.34 + row * 0.17, { rotZ: Math.PI / 2 });
  }
  lp.collider(3.2, 0.9, 1.4, 0, 0.45, 0);

  // ---------------- Flagpole & mailbox ----------------
  const fp = new Builder(game, -226, H, 207, 0, 'flag');
  fp.mesh(new THREE.CylinderGeometry(0.04, 0.07, 9, 8), M.white, 0, 4.5, 0);
  fp.collider(0.16, 9, 0.16, 0, 4.5, 0);
  const flagCanvas = document.createElement('canvas');
  flagCanvas.width = 180; flagCanvas.height = 110;
  const fc = flagCanvas.getContext('2d');
  fc.fillStyle = '#f4f4f0'; fc.fillRect(0, 0, 180, 110);
  fc.fillStyle = '#1b3f8f'; fc.fillRect(50, 0, 30, 110); fc.fillRect(0, 40, 180, 30);
  const flagTex = new THREE.CanvasTexture(flagCanvas); flagTex.colorSpace = THREE.SRGBColorSpace;
  const flagGeo = new THREE.PlaneGeometry(1.8, 1.1, 12, 4);
  flagGeo.translate(0.9, 0, 0);
  const flag = fp.mesh(flagGeo, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.9 }), 0.05, 8.35, 0);
  home.flag = flag;
  home.flagBase = flagGeo.attributes.position.array.slice();

  const mb = new Builder(game, -218.5, H, 229.5, 0, 'mailbox');
  mb.mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), M.wood, 0, 0.55, 0);
  const mbox = mb.box(0.25, 0.25, 0.45, M.green, 0, 1.2, 0, { collide: false });
  mb.interact(mbox, { name: 'Mailbox', hint: () => 'Read the mail', use: (g) => g.actions.readMail() });

  // ---------------- Sauna ----------------
  const sp = game.terrain.pads.find((p) => p.name === 'sauna');
  const sb = new Builder(game, -283, sp.h, 206, Math.PI / 2, 'sauna');
  home.sauna = { builder: sb, temp: 20, lit: false, fire: 0, steam: 0 };
  sb.box(5.0, 0.4, 4.2, M.stone, 0, 0.0, 0, { tex: 1 });
  sb.box(4.8, 0.05, 4.0, M.floor, 0, 0.22, 0, { surface: 'wood' });
  const SY = 0.2, SH = 2.3;
  const sWin = windowMaterial();
  home.saunaWindow = sWin;
  sb.wallX(-2.4, 2.4, 1.94, SY, SH, 0.14, [{ a: 0.8, b: 1.6, y0: 0, y1: 1.95 }], M.logs, M.logs, 1);
  sb.wallX(-2.4, 2.4, -1.94, SY, SH, 0.14, [{ a: 0.5, b: 1.3, y0: 1.2, y1: 1.7, window: true }], M.logs, M.benchWood, -1, sWin);
  sb.wallZ(-1.87, 1.87, 2.33, SY, SH, 0.14, [], M.logs, M.logs, 1);
  sb.wallZ(-1.87, 1.87, -2.33, SY, SH, 0.14, [], M.logs, M.benchWood, -1);
  sb.wallX(-2.26, 2.26, 0.45, SY, SH, 0.1, [{ a: -0.5, b: 0.3, y0: 0, y1: 1.9 }], M.benchWood, M.benchWood, 0);
  sb.box(4.8, 0.08, 4.0, M.benchWood, 0, SY + SH + 0.04, 0);
  sb.gableRoofX(2.45, 2.0, SY + SH + 0.05, 1.1, 0.45, M.roof, M.logs);
  // benches (lauteet)
  sb.box(4.5, 0.06, 0.55, M.benchWood, 0, SY + 0.5, -1.05, { surface: 'wood' });
  sb.box(4.5, 0.5, 0.05, M.benchWood, 0, SY + 0.25, -0.78, { collide: false });
  sb.box(4.5, 0.06, 0.6, M.benchWood, 0, SY + 1.0, -1.6, { surface: 'wood' });
  sb.box(4.5, 0.5, 0.05, M.benchWood, 0, SY + 0.75, -1.3, { collide: false });
  sb.collider(4.5, 1.0, 0.55, 0, SY + 0.5, -1.55);
  const benchHit = sb.hitBox(3.0, 0.3, 1.1, 0.3, SY + 0.75, -1.35, { name: 'Sauna bench', hint: (g) => g.actions.saunaSitHint(), use: (g) => g.actions.saunaSit() });
  home.saunaSeat = sb.toWorld(0.4, SY + 1.03, -1.6);
  // stove (kiuas)
  const stove = sb.box(0.6, 0.75, 0.55, M.darkMetal, -1.8, SY + 0.4, 0.05);
  const stones = [];
  for (let i = 0; i < 14; i++) {
    const s = sb.mesh(new THREE.DodecahedronGeometry(0.08 + (i % 3) * 0.02, 0), M.stone, -1.8 + ((i * 37) % 7 - 3) * 0.06, SY + 0.82 + (i % 2) * 0.06, 0.05 + ((i * 53) % 7 - 3) * 0.06);
    stones.push(s);
  }
  sb.mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.9, 8), M.darkMetal, -1.8, SY + 1.9, -0.15);
  const fireGlow = new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff5a10, emissiveIntensity: 0 });
  sb.box(0.3, 0.14, 0.02, fireGlow, -1.8, SY + 0.28, 0.33, { collide: false, cast: false });
  home.sauna.glow = fireGlow;
  const sLight = sb.pointLight(-1.6, SY + 0.6, 0.3, 0xff8a3a, 0, 5);
  home.sauna.light = sLight;
  sb.interact(stove, { name: 'Sauna stove', hint: (g) => g.actions.stoveHint(), use: (g) => g.actions.lightStove() });
  // bucket & ladle
  const bucket = sb.mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.22, 12, 1, true), M.wood, -1.0, SY + 0.64, -1.0);
  bucket.material = M.wood;
  const ladle = sb.mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 5), M.wood, -0.95, SY + 0.8, -0.95, { rotZ: 0.6 });
  const loylyT = { name: 'Water bucket', hint: (g) => g.actions.loylyHint(), use: (g) => g.actions.throwLoyly() };
  sb.interact(bucket, loylyT); sb.interact(ladle, loylyT);
  home.sauna.stonesPos = sb.toWorld(-1.8, SY + 0.95, 0.05);
  home.sauna.chimneyTop = sb.toWorld(-1.8, SY + 2.95, -0.15);
  // dressing room bench and towel hooks
  sb.box(2.0, 0.06, 0.4, M.benchWood, -1.1, SY + 0.45, 1.6, { collide: false });
  sb.box(0.9, 0.04, 0.4, M.white, 1.7, SY + 1.5, 1.85, { collide: false });
  // pier
  const pierLen = 24;
  const pb2 = new Builder(game, -289 - pierLen / 2, WATER + 0.6, 206, 0, 'pier');
  pb2.box(pierLen, 0.1, 1.7, M.greyBoards, 0, 0, 0, { tex: 1, surface: 'wood' });
  for (let i = 0; i <= pierLen; i += 3) {
    for (const side of [-0.8, 0.8]) pb2.mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 6), M.darkWood, -pierLen / 2 + i, -1.4, side);
  }
  pb2.box(0.6, 1.1, 0.06, M.metal, -pierLen / 2 + 0.4, -0.45, 0.6, { collide: false }); // ladder hint
  home.pierEnd = pb2.toWorld(-pierLen / 2, 0.1, 0);

  // exclusions for trees
  home.exclusions = [
    { x: -228, z: 200, hx: 44, hz: 40 },
    { x: -290, z: 206, hx: 26, hz: 10 },
  ];

  // smoke particles for sauna chimney
  const smokeMat = new THREE.SpriteMaterial({ map: smokeTexture(), color: 0xcfcfcf, transparent: true, opacity: 0.5, depthWrite: false });
  home.smoke = [];
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(smokeMat.clone());
    s.visible = false;
    game.scene.add(s);
    home.smoke.push({ s, t: Math.random() * 4 });
  }

  return home;
}

// Animations for the homestead (flag, smoke, lights).
export function updateHome(home, game, dt, time) {
  // flag waving
  const arr = home.flag.geometry.attributes.position.array;
  const base = home.flagBase;
  for (let i = 0; i < arr.length; i += 3) {
    const x = base[i];
    arr[i + 2] = Math.sin(x * 3.2 - time * 4.5) * 0.12 * x + Math.sin(x * 7 - time * 7) * 0.03 * x;
  }
  home.flag.geometry.attributes.position.needsUpdate = true;
  home.flag.geometry.computeVertexNormals();

  // chimney smoke when stove is burning
  const sauna = home.sauna;
  for (const p of home.smoke) {
    if (!sauna.lit) { p.s.visible = false; continue; }
    p.t += dt;
    if (p.t > 4) p.t -= 4;
    const k = p.t / 4;
    p.s.visible = true;
    p.s.position.set(sauna.chimneyTop.x + k * 1.5, sauna.chimneyTop.y + k * 5, sauna.chimneyTop.z + Math.sin(p.t * 1.3) * 0.3);
    p.s.scale.setScalar(0.4 + k * 2.2);
    p.s.material.opacity = 0.45 * (1 - k);
  }
}
