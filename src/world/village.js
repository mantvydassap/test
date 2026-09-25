import * as THREE from 'three';
import { Builder } from './builder.js';
import { materials, windowMaterial } from './materials.js';
import { boxGeo } from '../core/geo.js';
import { textTexture } from '../core/textures.js';
import { makePerson } from './npc.js';

function signMat(lines, opts) {
  return new THREE.MeshStandardMaterial({ map: textTexture(lines, opts), roughness: 0.6 });
}

// The pub, the repair shop, grandma's porch and the other villagers.
export function buildVillage(game) {
  const M = materials();
  const T = game.terrain;
  const town = game.town;
  const { nx, nz } = town.frame;
  const faceRoad = (v) => (v < 0 ? Math.atan2(nx, nz) : Math.atan2(-nx, -nz));
  const H = T.pads.find((p) => p.name === 'town').h;
  const V = { npcs: [], windows: [] };
  const npc = (id, person, builder, x, y, z, rot, target) => {
    person.position.set(x, y, z);
    person.rotation.y = rot;
    builder.group.add(person);
    person.traverse((o) => { if (o.isMesh) builder.interact(o, target); });
    const n = { id, person, builder, target };
    V.npcs.push(n);
    return n;
  };

  // ---------------- Baari (pub) ----------------
  const pp = town.at(42, -22);
  const pb = new Builder(game, pp.x, H, pp.z, faceRoad(-1), 'pub');
  const pubWin = windowMaterial();
  V.windows.push(pubWin);
  pb.box(11.4, 0.45, 9.4, M.stone, 0, 0.08, 0, { tex: 1 });
  pb.box(11, 0.05, 9, M.floor, 0, 0.3, 0, { tex: 2, surface: 'wood' });
  pb.box(1.4, 0.16, 0.5, M.stone, -3.45, 0.08, 4.95, { surface: 'stone' });
  const PY = 0.3, PH = 2.9;
  pb.wallX(-5.5, 5.5, 4.43, PY, PH, 0.14, [
    { a: -4.0, b: -2.9, y0: 0, y1: 2.1 },
    { a: -1.8, b: 0.4, y0: 0.9, y1: 2.0, window: true },
    { a: 1.6, b: 3.8, y0: 0.9, y1: 2.0, window: true },
  ], M.greenBoards, M.wood, 1, pubWin);
  pb.wallX(-5.5, 5.5, -4.43, PY, PH, 0.14, [], M.greenBoards, M.wood, -1);
  pb.wallZ(-4.36, 4.36, 5.43, PY, PH, 0.14, [{ a: -1, b: 1, y0: 1.0, y1: 1.9, window: true }], M.greenBoards, M.wood, 1, pubWin);
  pb.wallZ(-4.36, 4.36, -5.43, PY, PH, 0.14, [], M.greenBoards, M.wood, -1);
  pb.box(11, 0.08, 9, M.darkWood, 0, PY + PH + 0.04, 0);
  pb.gableRoofX(5.55, 4.5, PY + PH + 0.08, 1.7, 0.5, M.roof, M.greenBoards);
  pb.box(3.4, 0.8, 0.12, signMat('BAARI', { width: 320, height: 80, bg: '#1b1a14', fg: '#f2c14e', font: 'bold 60px "Big Shoulders Display", sans-serif', border: '#f2c14e', borderWidth: 4 }), -1.0, PY + PH - 0.2, 4.6, { collide: false });
  pb.box(0.6, 0.4, 0.02, signMat(['AUKI', '12 – 02'], { width: 128, height: 96, bg: '#f2efe6', fg: '#1b1a14', font: 'bold 32px "Barlow Condensed", sans-serif' }), -2.3, PY + 1.5, 4.52, { collide: false, cast: false });
  // bar counter + shelves of bottles
  pb.box(5.6, 1.05, 0.7, M.darkWood, 1.6, PY + 0.52, -2.2, { surface: 'wood' });
  pb.box(5.7, 0.05, 0.8, M.wood, 1.6, PY + 1.07, -2.2, { collide: false });
  for (const y of [1.2, 1.7]) pb.box(5.2, 0.04, 0.3, M.wood, 1.6, PY + y, -4.2, { collide: false });
  const bottleCols = [0x3f6a2a, 0x6b4f14, 0xd8d4c6, 0x7a1f1f, 0x2d4f7a];
  for (let i = 0; i < 26; i++) {
    const y = i < 13 ? 1.2 : 1.7;
    const b = pb.mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 8), new THREE.MeshStandardMaterial({ color: bottleCols[i % 5], roughness: 0.15, metalness: 0.1 }), -0.8 + (i % 13) * 0.38, PY + y + 0.16, -4.2);
    b.castShadow = false;
  }
  pb.box(0.8, 0.5, 0.4, M.metal, 3.9, PY + 1.32, -2.2, { collide: false }); // beer tap tower
  for (let i = 0; i < 4; i++) {
    const x = -0.4 + i * 1.2;
    pb.mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12), M.red, x, PY + 0.72, -1.5);
    pb.mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), M.chrome, x, PY + 0.35, -1.5);
  }
  // tables and chairs
  const table = (x, z) => {
    pb.box(1.0, 0.05, 1.0, M.wood, x, PY + 0.74, z, { collide: false });
    pb.box(0.08, 0.72, 0.08, M.darkWood, x, PY + 0.36, z, { collide: false });
    pb.collider(1.0, 0.77, 1.0, x, PY + 0.38, z);
    for (const [dx, dz] of [[0, -0.8], [0, 0.8]]) {
      pb.box(0.42, 0.04, 0.42, M.wood, x + dx, PY + 0.45, z + dz, { collide: false });
      pb.box(0.42, 0.5, 0.04, M.wood, x + dx, PY + 0.7, z + dz + Math.sign(dz) * 0.2, { collide: false });
    }
  };
  table(-3.6, -1.6); table(-3.6, 1.8); table(0.4, 1.9);
  // beer bottles on the drunk's table
  for (let i = 0; i < 5; i++) pb.mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.24, 8), new THREE.MeshStandardMaterial({ color: 0x5b4a1f, roughness: 0.2 }), -3.9 + (i % 3) * 0.2, PY + 0.89, -1.8 + Math.floor(i / 3) * 0.25);
  // dartboard and posters
  pb.mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 20), M.black, -5.33, PY + 1.7, 0.3, { rotZ: Math.PI / 2 });
  pb.box(0.02, 0.6, 0.45, signMat(['HUMPPA', 'LA 20:00'], { width: 128, height: 170, bg: '#e8c547', fg: '#8a2c20', font: 'bold 30px "Big Shoulders Display", sans-serif' }), -5.34, PY + 1.6, 2.3, { collide: false, cast: false });
  // jukebox
  const jb = new THREE.Group();
  const jbBody = new THREE.Mesh(boxGeo(0.8, 1.4, 0.5), M.wood); jbBody.position.y = 0.7; jb.add(jbBody);
  const jbTop = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 16, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0xf29a2e, emissiveIntensity: 0.6 }));
  jbTop.rotation.set(Math.PI / 2, 0, Math.PI / 2); jbTop.position.set(0, 1.4, 0); jb.add(jbTop);
  const jbFace = new THREE.Mesh(boxGeo(0.6, 0.5, 0.02), M.chrome); jbFace.position.set(0, 0.9, 0.26); jb.add(jbFace);
  jb.position.set(4.8, PY, 3.6); jb.rotation.y = -Math.PI / 2;
  pb.group.add(jb);
  pb.collider(0.6, 1.5, 0.9, 4.8, PY + 0.75, 3.6);
  const jukebox = { on: false, pos: pb.toWorld(4.8, PY + 1, 3.6), player: null };
  V.jukebox = jukebox;
  const jbT = { name: 'Jukebox', hint: () => (jukebox.on ? 'Stop the music' : 'Play a record (1 mk)'), use: (g) => g.npcs.jukebox() };
  jb.traverse((o) => { if (o.isMesh) pb.interact(o, jbT); });
  V.pubLight = pb.pointLight(0, PY + 2.4, 0, 0xffc98a, 14, 14);
  pb.box(1.2, 0.05, 0.2, M.lampOn, 1, PY + PH - 0.06, 0, { collide: false, cast: false });
  V.pub = pb;

  // bartender
  const bartender = makePerson({ shirt: 0xe9e3d2, pants: 0x222222, hair: 0x2b231c, beard: 0x2b231c, apron: 0x7a1f1f, belly: 1 });
  npc('bartender', bartender, pb, 2.0, PY, -3.3, 0, { name: 'Raimo, bartender', hint: (g) => g.npcs.barHint(), use: (g) => g.npcs.buyBeer(), altHint: (g) => g.npcs.barOpen() ? 'Buy a shot of kossu (3,50 mk)' : null, alt: (g) => g.npcs.buyShot() });
  // the regular, sitting at his table with his bottles
  const drunk = makePerson({ shirt: 0x6b7d4a, pants: 0x3a3226, hair: 0x8a7a60, beard: 0x7a6a50, sitting: true, belly: 1.2, skin: 0xd98f78 });
  npc('drunk', drunk, pb, -3.6, PY + 0.47, -2.4, 0, {
    name: 'Jaska, a regular', hint: () => 'Talk', use: (g) => g.npcs.talkDrunk(),
    carryHint: (g, item) => (item.type === 'beer' ? 'Give him the beer' : null), carryUse: (g, item) => g.npcs.giveDrunkBeer(item),
  }).drunk = 1;

  // ---------------- Korjaamo (repair shop) ----------------
  const kp = town.at(42, 28);
  const kb = new Builder(game, kp.x, H, kp.z, faceRoad(1), 'repairshop');
  kb.box(10.4, 0.1, 12.4, M.concrete, 0, 0.0, 0, { tex: 3, surface: 'concrete' });
  const KY = 0.05, KH = 4.2;
  kb.wallX(-5.2, 5.2, 6.13, KY, KH, 0.16, [{ a: -3.2, b: 1.2, y0: 0, y1: 3.4 }, { a: 2.4, b: 4.2, y0: 1.2, y1: 2.4, window: true }], M.greyBoards, M.greyBoards, 1, windowMaterial());
  kb.wallX(-5.2, 5.2, -6.13, KY, KH, 0.16, [], M.greyBoards, M.greyBoards, -1);
  kb.wallZ(-6.05, 6.05, 5.13, KY, KH, 0.16, [], M.greyBoards, M.greyBoards, 1);
  kb.wallZ(-6.05, 6.05, -5.13, KY, KH, 0.16, [{ a: -2, b: 1, y0: 1.5, y1: 2.6, window: true }], M.greyBoards, M.greyBoards, -1, windowMaterial());
  kb.gableRoofZ(5.2, 6.2, KY + KH, 1.3, 0.4, M.roof, M.greyBoards);
  kb.box(5.5, 0.8, 0.12, signMat('KORJAAMO', { width: 480, height: 80, bg: '#f2efe6', fg: '#1d3f7a', font: 'bold 58px "Big Shoulders Display", sans-serif', border: '#1d3f7a', borderWidth: 5 }), -1.0, KY + 3.85, 6.25, { collide: false });
  // lift posts, tool cabinet, tyres
  for (const x of [-2.6, 0.6]) kb.box(0.25, 3.0, 0.25, M.red, x, KY + 1.5, -1.5);
  kb.box(3.4, 0.2, 0.4, M.red, -1.0, KY + 3.0, -1.5, { collide: false });
  kb.box(1.8, 1.0, 0.5, M.red, 4.4, KY + 0.5, -3.5);
  kb.box(1.8, 0.05, 0.55, M.metal, 4.4, KY + 1.02, -3.5, { collide: false });
  for (let i = 0; i < 4; i++) kb.mesh(new THREE.TorusGeometry(0.28, 0.1, 8, 16), M.rubber, 4.5, KY + 0.12 + i * 0.2, 2.5, { rotX: Math.PI / 2 });
  kb.collider(0.8, 0.8, 0.8, 4.5, KY + 0.4, 2.5);
  kb.box(0.02, 1.2, 2.2, M.darkWood, -5.03, KY + 1.8, -3, { collide: false });
  kb.pointLight(-1, KY + 3.6, 0, 0xf4f6ff, 6, 14);
  V.repairShop = kb;
  const mechanic = makePerson({ shirt: 0x2f4f7a, pants: 0x2f4f7a, hair: 0x4a3a2a, hat: 0xa3261e });
  npc('mechanic', mechanic, kb, 3.2, KY, -2.2, -Math.PI / 2 + 0.6, { name: 'Veikko, mechanic', hint: () => 'Talk', use: (g) => g.npcs.talkMechanic() });

  // ---------------- Grandma's house (Mummola) ----------------
  const gp = T.pads.find((p) => p.name === 'neighbour3');
  V.grandmaHouse = { x: gp.x, z: gp.z, h: gp.h };
  const porch = new Builder(game, gp.x + Math.sin(1.4) * 4.6, gp.h, gp.z + Math.cos(1.4) * 4.6, 1.4, 'porch');
  porch.box(3, 0.2, 2, M.wood, 0, 0.3, 0, { surface: 'wood' });
  const chair = porch.box(0.6, 0.06, 0.6, M.wood, 0.5, 0.85, 0.1, { collide: false });
  porch.box(0.6, 0.7, 0.06, M.wood, 0.5, 1.15, -0.2, { collide: false });
  void chair;
  const granny = makePerson({ shirt: 0x6a3a6a, hair: 0xd8d8d8, dress: true, scarf: 0x8a2c50, glasses: true, skin: 0xe0b098 });
  const grandmaT = { name: 'Mummo', hint: (g) => g.npcs.grandmaHint(), use: (g) => g.npcs.talkGrandma() };
  const gn = npc('grandma', granny, porch, 0.5, 0.4, 0.4, 0, grandmaT);
  gn.home = { builder: porch, x: 0.5, y: 0.4, z: 0.4, rot: 0 };
  // a sitting copy used as a passenger
  V.grannySitting = makePerson({ shirt: 0x6a3a6a, pants: 0x6a3a6a, hair: 0xd8d8d8, sitting: true, scarf: 0x8a2c50, glasses: true, skin: 0xe0b098 });
  V.grannySitting.visible = false;
  game.scene.add(V.grannySitting);
  V.churchDoor = town.churchDoor;

  // ---------------- Farmer, fisherman, bus-stop passenger ----------------
  const farm = T.pads.find((p) => p.name === 'farm');
  const fb = new Builder(game, farm.x, farm.h, farm.z, 0, 'farmyard');
  const farmer = makePerson({ shirt: 0x7a4a2a, pants: 0x2f3a4a, hair: 0x9a9080, hat: 0x3a5a2a, beard: 0xa09080 });
  npc('farmer', farmer, fb, 2, 0, 10, Math.PI * 0.8, { name: 'Heikki, farmer', hint: () => 'Talk', use: (g) => g.npcs.talkFarmer() });

  const lake = T.lakes[1];
  const fx = lake.x - lake.r - 3, fz = lake.z;
  const fh = T.heightAt(fx, fz);
  const fsb = new Builder(game, fx, fh, fz, Math.PI / 2, 'fisher');
  const fisher = makePerson({ shirt: 0x3a5a3a, pants: 0x2d3440, hair: 0x6a5238, hat: 0x5a6e3a, sitting: true });
  const stool = fsb.box(0.4, 0.4, 0.4, M.wood, 0, 0.2, 0, { collide: true });
  void stool;
  npc('fisher', fisher, fsb, 0, 0.42, 0, 0, { name: 'Old man fishing', hint: () => 'Talk', use: (g) => g.npcs.talkFisher() });
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.015, 2.6, 5), M.darkWood);
  rod.position.set(0.25, 1.2, 1.0); rod.rotation.x = 0.9;
  fisher.add(rod);

  const bsp = town.at(34, 7.5);
  const bus = new Builder(game, bsp.x, H, bsp.z, faceRoad(1), 'busstop-npc');
  const waiter = makePerson({ shirt: 0xc4622d, pants: 0x3a4a6a, hair: 0x2b231c, sitting: true });
  npc('bus', waiter, bus, -0.5, 0.52, -0.5, 0, { name: 'Someone waiting for the bus', hint: () => 'Talk', use: (g) => g.npcs.talkBus() });

  return V;
}
