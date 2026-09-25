import * as THREE from 'three';
import { Builder } from './builder.js';
import { materials, windowMaterial } from './materials.js';
import { boxGeo, mergeGeos, paint, mergeObject } from '../core/geo.js';
import { textTexture } from '../core/textures.js';
import { makePerson } from './npc.js';
import { ITEMS, makeItemMesh } from '../game/items.js';
import { nearestSample } from './roads.js';
import { fmtMoney } from '../core/math.js';

function signMat(lines, opts) {
  return new THREE.MeshStandardMaterial({ map: textTexture(lines, opts), roughness: 0.6 });
}

// A closed house used for scenery.
function simpleHouse(game, x, z, rot, { w = 8, d = 6.5, wall, roof, winMat, name = 'house', h: hh } = {}) {
  const M = materials();
  const y = hh ?? game.terrain.heightAt(x, z);
  const b = new Builder(game, x, y, z, rot, name);
  b.box(w + 0.2, 0.6, d + 0.2, M.stone, 0, 0.1, 0, { tex: 1 });
  const H = 2.7;
  b.box(w, H, d, wall, 0, 0.4 + H / 2, 0, { tex: 1.5 });
  // windows as dark panes with trims on the long sides
  const wm = winMat || windowMaterial();
  for (const side of [-1, 1]) {
    for (let i = -1; i <= 1; i += 2) {
      b.box(1.2, 1.0, 0.04, wm, i * w * 0.25, 1.9, side * (d / 2 + 0.02), { collide: false, cast: false, tex: 5 });
      b.box(1.34, 0.08, 0.1, M.trim, i * w * 0.25, 1.36, side * (d / 2 + 0.04), { collide: false });
      b.box(1.34, 0.08, 0.1, M.trim, i * w * 0.25, 2.44, side * (d / 2 + 0.04), { collide: false });
    }
  }
  b.box(1.0, 2.0, 0.06, M.greenBoards, 0, 1.4, d / 2 + 0.03, { collide: false });
  for (const [cx, cz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) b.box(0.14, H, 0.14, M.trim, cx, 0.4 + H / 2, cz, { collide: false });
  b.gableRoofX(w / 2, d / 2, 0.4 + H, 2.0, 0.5, roof, wall);
  b.box(0.5, 1.2, 0.5, M.stone, w * 0.2, 0.4 + H + 1.6, -0.6, { collide: false });
  return { builder: b, winMat: wm };
}

export function buildTown(game) {
  const M = materials();
  const T = game.terrain;
  const highway = T.roads.find((r) => r.id === 'highway');
  const pad = T.pads.find((p) => p.name === 'town');
  const ns = nearestSample(highway, pad.x, pad.z);
  const c = highway.samples[ns.index];
  const ax = c.tx, az = c.tz;      // along the road
  const nx = -c.tz, nz = c.tx;     // across (left)
  const at = (u, v) => ({ x: c.x + ax * u + nx * v, z: c.z + az * u + nz * v });
  const faceRoad = (v) => (v < 0 ? Math.atan2(nx, nz) : Math.atan2(-nx, -nz));
  const town = { frame: { c, ax, az, nx, nz }, windows: [], streetLamps: [], at };
  const H = pad.h;

  // ---------------- Shop ----------------
  const sp = at(-12, -19);
  const sb = new Builder(game, sp.x, H, sp.z, faceRoad(-1), 'shop');
  town.shopBuilder = sb;
  const shopWin = windowMaterial();
  town.windows.push(shopWin);
  sb.box(12.4, 0.5, 9.4, M.stone, 0, 0.1, 0, { tex: 1 });
  sb.box(12, 0.05, 9, M.tiles, 0, 0.35, 0, { tex: 1, surface: 'tile' });
  sb.box(1.5, 0.18, 0.5, M.stone, 3.25, 0.09, 4.95, { surface: 'stone' });
  const SY = 0.35, SH = 3.0;
  sb.wallX(-6, 6, 4.43, SY, SH, 0.14, [
    { a: 2.6, b: 3.9, y0: 0, y1: 2.2 },
    { a: -5.2, b: -1.6, y0: 0.6, y1: 2.3, window: true },
    { a: -1.1, b: 2.0, y0: 0.6, y1: 2.3, window: true },
    { a: 4.4, b: 5.5, y0: 0.9, y1: 2.3, window: true },
  ], M.whiteBoards, M.white, 1, shopWin);
  sb.wallX(-6, 6, -4.43, SY, SH, 0.14, [], M.whiteBoards, M.white, -1);
  sb.wallZ(-4.36, 4.36, 5.93, SY, SH, 0.14, [], M.whiteBoards, M.white, 1);
  sb.wallZ(-4.36, 4.36, -5.93, SY, SH, 0.14, [], M.whiteBoards, M.white, -1);
  sb.box(12, 0.1, 9, M.white, 0, SY + SH + 0.05, 0);
  sb.gableRoofX(6.05, 4.5, SY + SH + 0.1, 1.6, 0.5, M.roofRed, M.whiteBoards);
  for (const [x, z] of [[-6, -4.5], [6, -4.5], [-6, 4.5], [6, 4.5]]) sb.box(0.16, SH, 0.16, M.orange, x, SY + SH / 2, z, { collide: false });
  // sign
  sb.box(6, 0.9, 0.12, signMat('KYLÄN KAUPPA', { width: 512, height: 80, bg: '#a3261e', fg: '#f4efe2', font: 'bold 58px "Big Shoulders Display", "Arial Narrow", sans-serif' }), -1.5, SY + SH - 0.1, 4.62, { collide: false });
  const hoursSign = sb.box(0.5, 0.36, 0.02, signMat(['AUKI', '8 – 21'], { width: 128, height: 96, bg: '#f2efe6', fg: '#1b1a17', font: 'bold 34px "Barlow Condensed", sans-serif' }), 4.3, SY + 1.5, 4.52, { collide: false });
  hoursSign.castShadow = false;
  // door (closes outside opening hours)
  const doorPivot = new THREE.Group();
  doorPivot.position.set(2.62, SY, 4.43);
  sb.group.add(doorPivot);
  const doorLeaf = new THREE.Mesh(boxGeo(1.26, 2.18, 0.05), [M.orange, M.orange, M.orange, M.orange, M.glass, M.glass]);
  doorLeaf.position.set(0.63, 1.09, 0);
  doorLeaf.castShadow = true;
  doorPivot.add(doorLeaf);
  const doorCollider = sb.collider(1.3, 2.2, 0.12, 3.25, SY + 1.1, 4.43);
  town.shopDoor = { pivot: doorPivot, collider: doorCollider, open: null }; // first update syncs door + collider
  // interior lights
  town.shopLights = [];
  for (const x of [-3, 2]) {
    town.shopLights.push(sb.pointLight(x, SY + SH - 0.3, 0, 0xfff2dd, 5, 10));
    sb.box(1.2, 0.05, 0.2, M.lampOn, x, SY + SH - 0.05, 0, { collide: false, cast: false });
  }

  // counter + register + shopkeeper
  sb.box(0.7, 1.0, 4.0, M.wood, 4.55, SY + 0.5, 1.0);
  sb.box(0.76, 0.04, 4.06, M.darkWood, 4.55, SY + 1.02, 1.0, { collide: false, surface: 'wood' });
  sb.collider(0.76, 1.06, 4.06, 4.55, SY + 0.53, 1.0, 0, { mat: 'wood' });
  const reg = new THREE.Group();
  const regBody = new THREE.Mesh(boxGeo(0.4, 0.2, 0.36), M.darkMetal); regBody.position.y = 0.1; reg.add(regBody);
  const regTop = new THREE.Mesh(boxGeo(0.3, 0.12, 0.14), M.metal); regTop.position.set(0, 0.26, -0.08); regTop.rotation.x = -0.4; reg.add(regTop);
  const keys = new THREE.Mesh(boxGeo(0.34, 0.03, 0.18), M.white); keys.position.set(0, 0.21, 0.08); keys.rotation.x = 0.3; reg.add(keys);
  reg.position.set(4.55, SY + 1.04, 2.2);
  reg.rotation.y = -Math.PI / 2;
  regBody.castShadow = true;
  sb.group.add(reg);
  const regT = { name: 'Cash register', hint: (g) => g.shop.registerHint(), use: (g) => g.shop.pay(), alt: (g) => g.shop.clearBasket(), altHint: (g) => g.shop.basket.length ? 'Clear basket' : null };
  sb.interact(regBody, regT); sb.interact(regTop, regT); sb.interact(keys, regT);
  const keeper = makePerson({ shirt: 0x7a8b5a, pants: 0x3a3226, hair: 0x9a9080, apron: 0xe9e3d2 });
  keeper.position.set(5.35, SY, 1.6);
  keeper.rotation.y = -Math.PI / 2;
  sb.group.add(keeper);
  town.shopkeeper = keeper;
  const keeperT = { name: 'Teppo, shopkeeper', hint: () => 'Talk', use: (g) => g.shop.talk() };
  keeper.traverse((o) => { if (o.isMesh) sb.interact(o, keeperT); });
  town.counterTop = sb.toWorld(4.45, SY + 1.1, 0.2);
  town.registerPos = sb.toWorld(4.55, SY + 1.1, 2.2);

  // shelves
  const shelfUnit = (x0, x1, z, depth, tiers, back = false) => {
    const w = x1 - x0, xc = (x0 + x1) / 2;
    for (const [i, ty] of tiers.entries()) sb.box(w, 0.04, depth, M.wood, xc, SY + ty, z, { surface: 'wood', collide: i === 0 });
    sb.box(0.04, tiers[tiers.length - 1] + 0.3, depth, M.darkWood, x0, SY + (tiers[tiers.length - 1] + 0.3) / 2, z, { collide: false });
    sb.box(0.04, tiers[tiers.length - 1] + 0.3, depth, M.darkWood, x1, SY + (tiers[tiers.length - 1] + 0.3) / 2, z, { collide: false });
    if (!back) sb.box(w, tiers[tiers.length - 1], 0.03, M.darkWood, xc, SY + tiers[tiers.length - 1] / 2, z, { collide: false });
    sb.collider(w, tiers[tiers.length - 1] + 0.1, depth, xc, SY + (tiers[tiers.length - 1] + 0.1) / 2, z);
  };
  shelfUnit(-5.6, 3.6, -4.05, 0.55, [0.25, 0.8, 1.35, 1.9], true);
  shelfUnit(-5.0, 1.8, -1.3, 0.9, [0.3, 0.85, 1.4]);
  shelfUnit(-5.0, 1.8, 1.6, 0.9, [0.3, 0.85, 1.4]);

  const slots = [
    // [item, x, tier y, z, side(+1 faces +z)]
    ['sparkplugs', -4.6, 0.8, -4.05, 1], ['oil', -2.6, 0.25, -4.05, 1], ['coolant', -0.6, 0.25, -4.05, 1], ['jerrycan', 1.6, 0.25, -4.05, 1], ['rebuildkit', 2.4, 1.35, -4.05, 1],
    ['sausage', -4.0, 0.85, -0.95, 1], ['pizza', -1.6, 0.85, -0.95, 1], ['bread', 0.7, 0.85, -0.95, 1], ['coffee', -1.6, 1.4, -0.95, 1],
    ['milk', -4.0, 0.85, 1.95, 1], ['juice', -1.6, 0.85, 1.95, 1], ['beer', 0.7, 0.85, 1.95, 1],
  ];
  town.displays = [];
  for (const [type, x, ty, z, side] of slots) {
    const def = ITEMS[type];
    const [hx, hy, hz] = def.size;
    const n = Math.max(2, Math.min(6, Math.floor(1.0 / (hx * 2 + 0.05))));
    const holder = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const m = makeItemMesh(type);
      m.position.set(x - 0.5 + (i + 0.5) * (1.0 / n), SY + ty + 0.02 + hy, z + side * (hz + 0.02));
      if (def.shape === 'jerry') m.rotation.y = Math.PI / 2;
      holder.add(m);
    }
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.08), signMat(fmtMoney(def.price).replace(' mk', ''), { width: 128, height: 48, bg: '#f7e25a', fg: '#1b1a17', font: 'bold 30px "IBM Plex Mono", monospace' }));
    tag.position.set(x, SY + ty - 0.02, z + side * 0.46);
    if (side < 0) tag.rotation.y = Math.PI;
    holder.add(tag);
    const merged = mergeObject(holder);
    sb.group.add(merged);
    const target = {
      name: `${def.name} · ${fmtMoney(def.price)}`,
      hint: (g) => g.shop.isOpen() ? 'Put in basket' : null,
      use: (g) => g.shop.take(type),
    };
    merged.traverse((o) => { if (o.isMesh) sb.interact(o, target); });
    town.displays.push({ type, holder: merged });
  }
  // posters
  sb.box(0.9, 0.6, 0.02, signMat(['TARJOUS!', 'MAKKARA 8,50'], { width: 256, height: 170, bg: '#f4e36a', fg: '#a3261e', font: 'bold 44px "Big Shoulders Display", sans-serif' }), -3.2, SY + 2.5, -4.35, { collide: false, cast: false });

  // ---------------- Fuel station ----------------
  const fp = at(16, -12);
  const fb = new Builder(game, fp.x, H, fp.z, faceRoad(-1), 'fuel');
  fb.box(9, 0.12, 6, M.concrete, 0, 0.0, 0, { tex: 3, surface: 'concrete' });
  for (const [x, z] of [[-3.8, -2.4], [3.8, -2.4], [-3.8, 2.4], [3.8, 2.4]]) fb.box(0.25, 4.2, 0.25, M.white, x, 2.1, z);
  fb.box(9, 0.5, 6, M.white, 0, 4.4, 0, { collide: false });
  fb.box(9.05, 0.3, 6.05, M.red, 0, 4.35, 0, { collide: false });
  fb.box(3.2, 0.7, 0.1, signMat('BENSA', { width: 256, height: 64, bg: '#f4efe2', fg: '#a3261e', font: 'bold 50px "Big Shoulders Display", sans-serif' }), 0, 4.4, 3.06, { collide: false });
  town.pumps = [];
  for (const x of [-1.8, 1.8]) {
    const pump = new THREE.Group();
    const body = new THREE.Mesh(boxGeo(0.6, 1.5, 0.45), M.red); body.position.y = 0.81; body.castShadow = true; pump.add(body);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.4), signMat(['BENSIINI', '1,95 /L'], { width: 128, height: 112, bg: '#efe9da', fg: '#1b1a17', font: 'bold 26px "IBM Plex Mono", monospace' }));
    face.position.set(0, 1.2, 0.227); pump.add(face);
    const face2 = face.clone(); face2.position.z = -0.227; face2.rotation.y = Math.PI; pump.add(face2);
    const top = new THREE.Mesh(boxGeo(0.64, 0.12, 0.5), M.white); top.position.y = 1.62; pump.add(top);
    const hose = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 12, Math.PI), M.rubber); hose.position.set(0.31, 0.9, 0); hose.rotation.y = Math.PI / 2; pump.add(hose);
    pump.position.set(x, 0.06, 0);
    fb.group.add(pump);
    fb.collider(0.6, 1.7, 0.45, x, 0.9, 0);
    const pos = fb.toWorld(x, 1, 0);
    const p = { pos, mesh: pump };
    town.pumps.push(p);
    const t = {
      name: 'Fuel pump · 1,95 mk/L', hint: (g) => g.actions.pumpHint(p), use: (g) => g.actions.pumpUse(p),
      carryHint: (g, item) => (item.type === 'jerrycan' ? 'Fill the jerry can' : null), carryUse: (g) => g.actions.pumpUse(p),
    };
    pump.traverse((o) => { if (o.isMesh) fb.interact(o, t); });
  }

  // ---------------- Inspection hall ----------------
  const ip = at(-4, 27);
  const ib = new Builder(game, ip.x, H, ip.z, faceRoad(1), 'inspection');
  town.inspectionBuilder = ib;
  const inWin = windowMaterial();
  town.windows.push(inWin);
  ib.box(11.2, 0.1, 16.2, M.concrete, 0, 0.0, 0, { tex: 3, surface: 'concrete' });
  const IY = 0.05, IH = 4.6;
  ib.wallX(-5.6, 5.6, 8.03, IY, IH, 0.16, [{ a: -2.5, b: 2.5, y0: 0, y1: 3.8 }], M.yellowBoards, M.white, 1);
  ib.wallX(-5.6, 5.6, -8.03, IY, IH, 0.16, [], M.yellowBoards, M.white, -1);
  ib.wallZ(-7.95, 7.95, 5.52, IY, IH, 0.16, [{ a: -4, b: -2, y0: 1.8, y1: 3.2, window: true }, { a: 2, b: 4, y0: 1.8, y1: 3.2, window: true }], M.yellowBoards, M.white, 1, inWin);
  ib.wallZ(-7.95, 7.95, -5.52, IY, IH, 0.16, [], M.yellowBoards, M.white, -1);
  ib.box(11.2, 0.12, 16.2, M.white, 0, IY + IH + 0.06, 0, { collide: false });
  ib.gableRoofZ(5.6, 8.1, IY + IH + 0.1, 1.4, 0.4, M.roof, M.yellowBoards);
  ib.box(5.0, 0.9, 0.12, signMat('KATSASTUS', { width: 512, height: 90, bg: '#1d3f7a', fg: '#f4efe2', font: 'bold 64px "Big Shoulders Display", sans-serif' }), 0, IY + 4.2, 8.13, { collide: false });
  // yellow lane markings and pit grating
  ib.box(0.15, 0.01, 11, M.yellow, -1.6, 0.06, -1.5, { collide: false, cast: false });
  ib.box(0.15, 0.01, 11, M.yellow, 1.6, 0.06, -1.5, { collide: false, cast: false });
  ib.box(0.9, 0.012, 7, M.darkMetal, 0, 0.061, -2.5, { collide: false, cast: false });
  // office booth
  ib.wallX(-5.45, -2.9, -3.2, IY, 2.6, 0.12, [], M.white, M.white, 0);
  ib.wallZ(-7.9, -3.2, -2.9, IY, 2.6, 0.12, [{ a: -5.2, b: -3.8, y0: 1.0, y1: 2.0, window: true }], M.white, M.white, 1);
  ib.box(2.6, 0.08, 4.8, M.white, -4.2, IY + 2.64, -5.55, { collide: false });
  ib.box(0.5, 0.05, 1.4, M.wood, -3.2, IY + 1.0, -4.5, { collide: false });
  const inspector = makePerson({ shirt: 0x2a3e66, pants: 0x222831, hair: 0x2b231c, hat: 0x2a3e66 });
  inspector.position.set(-4.0, IY, -4.5);
  inspector.rotation.y = Math.PI / 2;
  ib.group.add(inspector);
  town.inspector = inspector;
  const insT = { name: 'Inspection office', hint: (g) => g.inspection.hint(), use: (g) => g.inspection.request() };
  ib.hitBox(0.4, 1.2, 1.6, -2.75, IY + 1.5, -4.5, insT);
  inspector.traverse((o) => { if (o.isMesh) ib.interact(o, insT); });
  ib.box(0.6, 0.4, 0.02, signMat(['KATSASTUS', '120 mk'], { width: 160, height: 110, bg: '#f2efe6', fg: '#1d3f7a', font: 'bold 30px "Barlow Condensed", sans-serif' }), -2.82, IY + 2.2, -4.5, { collide: false, rot: Math.PI / 2, cast: false });
  const hallLight = ib.pointLight(0, IY + 4.2, -1, 0xf4f6ff, 7, 16);
  town.hallLight = hallLight;
  town.inspectionZone = { builder: ib, x0: -2.6, x1: 2.6, z0: -7.5, z1: 5.0 };

  // ---------------- Church, houses, bus stop ----------------
  const cp = at(-62, -42);
  const cb = new Builder(game, cp.x, H, cp.z, faceRoad(-1), 'church');
  cb.box(8.4, 0.5, 16.4, M.stone, 0, 0.1, 0, { tex: 1 });
  cb.box(8, 5, 16, M.whiteBoards, 0, 2.85, 0);
  cb.gableRoofZ(4, 8, 5.35, 4.2, 0.6, M.roof, M.whiteBoards);
  for (const z of [-5, -1.5, 2]) for (const side of [-1, 1]) cb.box(0.05, 2.4, 1.0, windowMaterial(), side * 4.03, 3.2, z, { collide: false, cast: false, tex: 5 });
  cb.box(3.6, 9, 3.6, M.whiteBoards, 0, 4.85, 9.4);
  const spire = cb.mesh(new THREE.ConeGeometry(2.6, 6, 4), M.roof, 0, 12.3, 9.4, { rot: Math.PI / 4 });
  spire.castShadow = true;
  cb.mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), M.darkMetal, 0, 15.9, 9.4);
  cb.mesh(new THREE.BoxGeometry(0.6, 0.1, 0.1), M.darkMetal, 0, 16.0, 9.4);
  cb.box(1.6, 2.6, 0.08, M.darkWood, 0, 1.65, 11.22, { collide: false });
  town.churchDoor = cb.toWorld(0, 0, 13);

  const houses = [
    [-38, 22, 1, M.greenBoards, M.roof], [75, 30, 1, M.yellowBoards, M.roofRed],
    [-88, 20, 1, M.faluRed, M.roofRed], [85, -28, -1, M.whiteBoards, M.roof], [-30, -26, -1, M.faluRed, M.roof],
  ];
  for (const [u, v, side, wall, roof] of houses) {
    const p = at(u, v);
    const res = simpleHouse(game, p.x, p.z, faceRoad(side), { wall, roof, h: H });
    town.windows.push(res.winMat);
  }

  // bus stop
  const bp = at(34, 7.5);
  const bs = new Builder(game, bp.x, H, bp.z, faceRoad(1), 'busstop');
  bs.box(3, 2.3, 0.08, M.glass, 0, 1.2, -0.75, { cast: false });
  bs.box(0.08, 2.3, 1.5, M.glass, -1.5, 1.2, 0, { cast: false });
  bs.box(3.3, 0.1, 1.7, M.darkMetal, 0, 2.4, 0, { collide: false });
  bs.box(2.6, 0.06, 0.4, M.wood, 0, 0.5, -0.5);
  bs.mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), M.metal, 1.9, 1.3, 0.3);
  bs.box(0.5, 0.5, 0.04, signMat(['LINJA-', 'AUTO'], { width: 128, height: 128, bg: '#1d3f7a', fg: '#fff', font: 'bold 34px "Barlow Condensed", sans-serif' }), 1.9, 2.4, 0.33, { collide: false, cast: false });

  // street lamps along the road through the village
  const lampGeo = mergeGeos([
    paint(new THREE.CylinderGeometry(0.06, 0.09, 7, 6).translate(0, 3.5, 0), '#6b6f72'),
    paint(new THREE.BoxGeometry(0.1, 0.1, 1.6).translate(0, 7, 0.75), '#6b6f72'),
  ]);
  const lampMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffd49a, emissiveIntensity: 0 });
  town.lampHeadMat = headMat;
  for (let u = -90; u <= 90; u += 30) {
    for (const v of [-7.2, 7.2]) {
      if (Math.abs(u - 16) < 8 && v < 0) continue;
      const p = at(u + (v > 0 ? 15 : 0), v);
      const y = T.heightAt(p.x, p.z);
      const m = new THREE.Mesh(lampGeo, lampMat);
      m.position.set(p.x, y, p.z);
      m.rotation.y = Math.atan2(-nx * Math.sign(v), -nz * Math.sign(v));
      m.castShadow = true;
      game.scene.add(m);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.5), headMat);
      head.position.set(0, 6.95, 1.4);
      m.add(head);
      game.colliders.addTree(p.x, p.z, 0.12, 7, y);
    }
  }

  // place-name signs (white on blue)
  for (const [u, v, dir] of [[-115, -6.5, 1], [115, 6.5, -1]]) {
    const p = at(u, v);
    const y = T.heightAt(p.x, p.z);
    const g = new THREE.Group();
    g.position.set(p.x, y, p.z);
    g.rotation.y = Math.atan2(-ax * dir, -az * dir);
    for (const x of [-0.8, 0.8]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), M.metal); post.position.set(x, 1.2, 0); g.add(post); }
    const sgn = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 0.04), signMat('KYLÄNMÄKI', { width: 400, height: 100, bg: '#1d4b9a', fg: '#ffffff', font: 'bold 64px "Barlow Condensed", sans-serif', border: '#ffffff', borderWidth: 6 }));
    sgn.position.set(0, 2.2, 0.03);
    sgn.castShadow = true;
    g.add(sgn);
    game.scene.add(g);
  }

  town.exclusions = [{ x: pad.x, z: pad.z, hx: pad.hx + 15, hz: pad.hz + 15 }];
  return town;
}

// Farm, neighbours, power lines and road signs.
export function buildCountryside(game) {
  const M = materials();
  const T = game.terrain;
  const out = { windows: [], exclusions: [] };
  const farm = T.pads.find((p) => p.name === 'farm');
  // barn
  const bb = new Builder(game, farm.x - 10, farm.h, farm.z - 6, 0.3, 'barn');
  bb.box(10.4, 0.5, 16.4, M.stone, 0, 0.1, 0, { tex: 1 });
  bb.box(10, 5, 16, M.faluRed, 0, 2.85, 0);
  bb.gableRoofZ(5, 8, 5.35, 3.4, 0.6, M.roof, M.faluRed);
  bb.box(3.4, 3.4, 0.08, M.trim, 0, 2.1, 8.03, { collide: false });
  bb.box(3.0, 3.0, 0.1, M.faluRed, 0, 2.05, 8.05, { collide: false });
  const fh = simpleHouse(game, farm.x + 10, farm.z + 8, -0.2, { wall: M.yellowBoards, roof: M.roofRed, h: farm.h });
  out.windows.push(fh.winMat);
  // hay bales ("tractor eggs") in the fields
  const baleGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 14);
  baleGeo.rotateZ(Math.PI / 2);
  const bales = [[95, -150], [118, -140], [150, 20], [165, 40], [190, 15], [210, 55], [232, 30], [178, 70], [385, 500], [420, 520], [450, 490], [-440, 440], [-410, 460]];
  const bm = new THREE.InstancedMesh(baleGeo, M.hay, bales.length);
  const d = new THREE.Object3D();
  bales.forEach(([x, z], i) => {
    const y = T.heightAt(x, z) + 0.72;
    d.position.set(x, y, z); d.rotation.set(0, (x * 7 + z) % 3, 0); d.updateMatrix();
    bm.setMatrixAt(i, d.matrix);
    game.colliders.addTree(x, z, 0.75, 1.5, y - 0.75);
  });
  bm.castShadow = true; bm.receiveShadow = true;
  game.scene.add(bm);

  for (const [name, wall, roof, rot] of [['neighbour1', M.whiteBoards, M.roof, 0.4], ['neighbour2', M.faluRed, M.roof, -0.3], ['neighbour3', M.greenBoards, M.roofRed, 1.4]]) {
    const p = T.pads.find((q) => q.name === name);
    const r = simpleHouse(game, p.x, p.z, rot, { wall, roof, h: p.h });
    out.windows.push(r.winMat);
    out.exclusions.push({ x: p.x, z: p.z, hx: p.hx + 6, hz: p.hz + 6 });
  }
  out.exclusions.push({ x: farm.x, z: farm.z, hx: farm.hx + 8, hz: farm.hz + 8 });

  // wooden power poles along the highway
  const highway = T.roads.find((r) => r.id === 'highway');
  const poleGeo = mergeGeos([
    paint(new THREE.CylinderGeometry(0.1, 0.14, 9, 6).translate(0, 4.5, 0), '#4f3b2a'),
    paint(new THREE.BoxGeometry(1.8, 0.1, 0.1).translate(0, 8.4, 0), '#4f3b2a'),
  ]);
  const poleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const poles = [];
  const ss = highway.samples;
  const step = 25;
  for (let i = 0; i < ss.length; i += step) {
    const s = ss[i];
    const off = highway.hw + 5.5;
    const x = s.x - s.tz * off, z = s.z + s.tx * off;
    if (T.padW[T.cellIndex(x, z)] > 0.3) continue;
    const y = T.heightAt(x, z);
    poles.push({ x, y, z, rot: Math.atan2(s.tx, s.tz) + Math.PI / 2 });
  }
  const pm = new THREE.InstancedMesh(poleGeo, poleMat, poles.length);
  poles.forEach((p, i) => {
    d.position.set(p.x, p.y - 0.3, p.z); d.rotation.set(0, p.rot, 0); d.updateMatrix();
    pm.setMatrixAt(i, d.matrix);
    game.colliders.addTree(p.x, p.z, 0.16, 9, p.y);
  });
  pm.castShadow = true;
  game.scene.add(pm);
  const wirePts = [];
  for (let i = 0; i < poles.length; i++) {
    const a = poles[i], b = poles[(i + 1) % poles.length];
    if (Math.hypot(a.x - b.x, a.z - b.z) > 80) continue;
    for (const side of [-0.8, 0.8]) {
      const ax = a.x + Math.cos(a.rot) * side, az = a.z - Math.sin(a.rot) * side;
      const bx = b.x + Math.cos(b.rot) * side, bz = b.z - Math.sin(b.rot) * side;
      let px = ax, py = a.y + 8.1, pz = az;
      for (let k = 1; k <= 8; k++) {
        const t = k / 8;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const y = a.y + 8.1 + (b.y - a.y) * t - Math.sin(t * Math.PI) * 0.8;
        wirePts.push(px, py, pz, x, y, z);
        px = x; py = y; pz = z;
      }
    }
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
  game.scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1c1c1c })));

  // speed limit signs
  const limitMat = new THREE.MeshStandardMaterial({ map: textTexture('80', { width: 128, height: 128, bg: '#ffffff', fg: '#111', font: 'bold 60px "Barlow Condensed", sans-serif' }) });
  for (const idx of [60, 400, 900, 1300]) {
    const s = ss[idx % ss.length];
    const off = highway.hw + 2;
    const x = s.x + s.tz * off, z = s.z - s.tx * off;
    const g = new THREE.Group();
    g.position.set(x, T.heightAt(x, z), z);
    g.rotation.y = Math.atan2(-s.tx, -s.tz);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.2, 6), M.metal); post.position.y = 1.1; g.add(post);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 20), M.red); ring.rotation.x = Math.PI / 2; ring.position.y = 2.2; g.add(ring);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.26, 20), limitMat); face.position.set(0, 2.2, 0.02); g.add(face);
    game.scene.add(g);
  }
  return out;
}
