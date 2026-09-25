import * as THREE from 'three';
import { ITEMS, itemDisplayName } from './items.js';
import { PART_BY_ID, IDEAL_MIXTURE } from './projectCar.js';
import { clamp } from '../core/math.js';
import { boxGeo } from '../core/geo.js';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const BOLT_MAX = 4;

// Everything the player does with their hands: carrying, using, pouring, wrenching.
export class Hands {
  constructor(game) {
    this.game = game;
    this.carried = null;
    this.toolMode = false;
    this.carryYaw = 0;
    this.carryVel = new THREE.Vector3();
    this.prevCarry = new THREE.Vector3();
    this.ratchetT = 0;
    this.ghost = null; this.ghostId = null;
    this.pouring = false;
    this.swing = 0;
    this.buildViewmodels();
    this.buildPee();
  }

  buildViewmodels() {
    const cam = this.game.camera;
    const metal = new THREE.MeshStandardMaterial({ color: 0xb9bec2, roughness: 0.3, metalness: 0.9 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x9a2a1e, roughness: 0.6 });
    const w = new THREE.Group();
    const shaft = new THREE.Mesh(boxGeo(0.025, 0.012, 0.26), metal); shaft.position.z = -0.06; w.add(shaft);
    const handle = new THREE.Mesh(boxGeo(0.032, 0.02, 0.12), grip); handle.position.z = 0.09; w.add(handle);
    const head = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.009, 6, 12), metal); head.rotation.x = Math.PI / 2; head.position.z = -0.2; w.add(head);
    w.scale.setScalar(0.55);
    w.position.set(0.17, -0.13, -0.3);
    w.rotation.set(0.25, 0.5, -0.35);
    w.visible = false;
    w.traverse((o) => { if (o.isMesh) { o.renderOrder = 10; o.material.depthTest = true; } });
    cam.add(w);
    this.wrench = w;
    this.wrenchBase = w.rotation.clone();
  }

  buildPee() {
    const n = 40;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mat = new THREE.PointsMaterial({ color: 0xe8d25a, size: 0.035, transparent: true, opacity: 0.8 });
    this.pee = new THREE.Points(geo, mat);
    this.pee.frustumCulled = false;
    this.pee.visible = false;
    this.game.scene.add(this.pee);
    this.peeT = 0;
  }

  get project() { return this.game.project; }

  pick(prop) {
    const game = this.game;
    if (prop.mass > 130) { game.ui.message('Too heavy to lift.'); return; }
    if (prop.vehicle) game.props.detachFromVehicle(prop);
    this.carried = prop;
    prop.carried = true;
    prop.asleep = false;
    prop.vel.set(0, 0, 0); prop.angVel.set(0, 0, 0);
    this.carryYaw = 0;
    this.prevCarry.copy(prop.pos);
    // keep its current heading relative to the view
    const e = new THREE.Euler().setFromQuaternion(prop.quat, 'YXZ');
    this.carryYaw = e.y - this.game.player.yaw;
    this.toolMode = false;
    game.audio.play('pickup', { pos: prop.pos });
    if (prop.mass > 40) game.ui.message(`${prop.name} is heavy. You can only shuffle while carrying it.`, 3);
  }

  drop(throwIt = false) {
    const p = this.carried;
    if (!p) return;
    this.carried = null;
    p.carried = false;
    p.asleep = false;
    p.sleepT = 0;
    if (throwIt) {
      const dir = _d.set(0, 0, -1).applyQuaternion(this.game.camera.quaternion);
      p.vel.copy(dir).multiplyScalar(11 / Math.sqrt(Math.max(1, p.mass))).addScaledVector(this.carryVel, 0.3);
      p.angVel.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
      this.game.audio.play('pickup', { pos: p.pos, vol: 0.6 });
    } else {
      p.vel.copy(this.carryVel).multiplyScalar(0.4);
      if (p.vel.lengthSq() > 16) p.vel.setLength(4);
    }
    this.hideGhost();
  }

  hideGhost() {
    if (this.ghost) { this.ghost.parent?.remove(this.ghost); this.ghost = null; this.ghostId = null; }
  }

  showGhost(id, near) {
    const pc = this.project;
    if (this.ghostId !== id) {
      this.hideGhost();
      const g = pc.buildPartMesh(id);
      pc.partHalf(g);
      const d = PART_BY_ID[id];
      g.position.set(d.pos[0], d.pos[1], d.pos[2]);
      if (d.rot) g.rotation.set(d.rot[0], d.rot[1], d.rot[2]);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.raycast = () => {}; } });
      pc.v.body.add(g);
      this.ghost = g; this.ghostId = id;
    }
    const K = near ? pc.constructor.ghostNear : null;
    this.ghost.traverse((o) => { if (o.isMesh) o.material = near ? ghostMats.near : ghostMats.far; });
    void K;
  }

  consume(prop) {
    const game = this.game;
    const def = ITEMS[prop.type];
    const u = def.use;
    game.survival.apply(u);
    game.audio.play(u.verb === 'Eat' ? 'eat' : 'drink');
    const pos = prop.pos.clone();
    const wasCarried = this.carried === prop;
    if (wasCarried) { this.carried = null; prop.carried = false; }
    game.props.remove(prop);
    if (u.leaves) {
      const b = game.props.spawn(u.leaves, pos);
      if (wasCarried) this.pick(b);
    }
    if (prop.type === 'beer') {
      const d = game.survival.drunk;
      if (d > 1.6) game.ui.message('The world is spinning.');
      else if (d > 0.8) game.ui.message('You feel pleasantly drunk.');
      if (Math.random() < 0.25) setTimeout(() => game.audio.play('belch'), 900);
    }
    game.survival.advance(2 / 60);
  }

  openItem(prop) {
    const game = this.game;
    const def = ITEMS[prop.type];
    const pos = prop.pos.clone();
    const wasCarried = this.carried === prop;
    if (wasCarried) { this.carried = null; prop.carried = false; }
    game.props.remove(prop);
    if (prop.type === 'bag') {
      const items = prop.data.contents || [];
      items.forEach((t, i) => {
        const a = (i / Math.max(1, items.length)) * Math.PI * 2;
        const p = game.props.spawn(t, _v.set(pos.x + Math.cos(a) * 0.25, pos.y + 0.2 + i * 0.05, pos.z + Math.sin(a) * 0.25));
        p.vel.set(Math.cos(a) * 0.5, 0.5, Math.sin(a) * 0.5);
      });
      game.ui.message(`You unpack ${items.length} item${items.length === 1 ? '' : 's'}.`);
    } else if (def.opens) {
      for (let i = 0; i < def.opens.count; i++) {
        const id = 'plug' + (i + 1);
        const P = this.project.parts[id];
        // pick a free plug identity
        const free = ['plug1', 'plug2', 'plug3', 'plug4'].find((k) => !this.project.parts[k].attached && !this.project.parts[k].prop);
        const use = free || id;
        void P;
        const pr = this.project.spawnPartProp(use, _v.set(pos.x + (i - 1.5) * 0.06, pos.y + 0.05, pos.z));
        pr.vel.set((i - 1.5) * 0.3, 0.6, 0);
      }
      game.ui.message('Four spark plugs. They screw into the cylinder head.');
    }
    game.audio.play('pickup', { pos });
  }

  // Liquids: what is the carried container pointed at?
  pourTarget(prop, hit) {
    const def = ITEMS[prop.type];
    const pc = this.project;
    const amount = prop.data.amount ?? 0;
    const ruskaNear = (id, r) => pc && pc.has(id) && pc.mountWorld(id, _v).distanceTo(this.game.camera.position) < r;
    if (def.liquid === 'oil' && hit && ((hit.kind === 'part' && ['head', 'rocker', 'block', 'carb', 'airfilter'].includes(hit.part.def.id)) || (hit.kind === 'vehicle' && hit.vehicle === pc?.v && ruskaNear('head', 2.2)))) {
      if (!pc.has('head')) return null;
      return { label: 'Pour oil into the engine', kind: 'oil', rate: 0.5, room: 3.5 - pc.v.engine.oil, amount };
    }
    if (def.liquid === 'coolant' && hit && ((hit.kind === 'part' && ['radiator', 'hoses'].includes(hit.part.def.id)) || (hit.kind === 'vehicle' && hit.vehicle === pc?.v && ruskaNear('radiator', 2.2)))) {
      return { label: 'Fill the radiator', kind: 'coolant', rate: 0.6, room: 4.5 - (pc.v.engine.coolant || 0), amount };
    }
    if (def.liquid === 'fuel' && hit && (hit.kind === 'vehicle' || hit.kind === 'part')) {
      const v = hit.kind === 'vehicle' ? hit.vehicle : pc.v;
      if (v === pc?.v && !pc.has('fueltank')) return null;
      return { label: `Pour fuel into the ${v === pc?.v ? 'Ruska' : 'van'}`, kind: 'fuel', rate: 1.6, room: v.engine.fuelCap - v.engine.fuel, amount, v };
    }
    return null;
  }

  update(dt, input) {
    const game = this.game;
    const player = game.player;
    const cam = game.camera;
    const ui = game.ui;
    this.wrench.visible = this.toolMode && player.mode === 'walk';
    this.updatePee(dt, input);
    if (player.mode !== 'walk' && player.mode !== 'sit') { this.hideGhost(); return null; }

    if (input.wasPressed('KeyF') && player.mode === 'walk') {
      if (this.carried) this.drop();
      this.toolMode = !this.toolMode;
      game.audio.play('metal', { vol: 0.25 });
    }

    // candidates for the ray
    const extra = [];
    const cp = cam.position;
    for (const p of game.props.list) if (!p.carried && p.pos.distanceToSquared(cp) < 20) extra.push(p.mesh);
    for (const v of game.vehicles) if (v.body.position.distanceToSquared(cp) < 64) extra.push(v.body);
    const reach = 2.4;
    const hit = game.interact.update(cam, reach, extra, (info) => {
      if (info.kind === 'prop' && info.prop === this.carried) return false;
      if (info.kind === 'bolt' && !this.toolMode) { info.kind = 'part'; info.part = info.bolt.part; }
      return true;
    });

    let title = '', sub = '', actions = [];
    const E = input.wasPressed('KeyE');
    const X = input.wasPressed('KeyX');
    const wheel = input.wheel;

    // ------------------------------------------------ carrying something
    if (this.carried) {
      const p = this.carried;
      this.updateCarry(dt, input);
      title = p.part ? PART_BY_ID[p.type.slice(5)].name : itemDisplayName(p);
      let used = false;
      if (p.part && this.project) {
        const camDir = _d.set(0, 0, -1).applyQuaternion(cam.quaternion).clone();
        const nm = this.project.nearMount(p, cam.position, camDir);
        if (nm) {
          const near = nm.near;
          this.showGhost(nm.id, near && nm.ok);
          if (!nm.ok) sub = nm.reason;
          else if (near) {
            actions.push({ key: 'E', label: 'Attach' });
            if (E) {
              this.carried = null; p.carried = false;
              this.hideGhost();
              this.project.attach(nm.id, p);
              game.ui.message(`${PART_BY_ID[nm.id].name} fitted. Tighten its bolts with the wrench (F).`, 3);
              used = true;
            }
          } else sub = 'Aim at the green outline';
        } else this.hideGhost();
      } else {
        this.hideGhost();
        const def = ITEMS[p.type];
        if (def?.use) { actions.push({ key: 'E', label: def.use.verb }); if (E) { this.consume(p); used = true; } }
        else if (p.type === 'bag' || def?.opens) { actions.push({ key: 'E', label: p.type === 'bag' ? 'Unpack' : 'Open the box' }); if (E) { this.openItem(p); used = true; } }
        else if (def?.liquid) {
          const tgt = this.pourTarget(p, hit);
          const amt = p.data.amount ?? 0;
          if (tgt && amt > 0.01 && tgt.room > 0.01) {
            actions.push({ key: 'Hold E', label: tgt.label });
            if (input.isDown('KeyE')) this.pour(p, tgt, dt);
            else this.pouring = false;
          } else if (tgt && tgt.room <= 0.01) { sub = 'It is already full'; this.pouring = false; }
          else if (amt <= 0.01) { sub = 'Empty'; this.pouring = false; }
          else this.pouring = false;
          if (def.liquid === 'fuel' && hit && hit.kind === 'target' && hit.target.carryHint) {
            const h = hit.target.carryHint(game, p);
            if (h) { actions.push({ key: 'E', label: h }); if (E) hit.target.carryUse(game, p); }
          }
        } else if (p.type === 'rebuildkit') {
          if (hit && hit.kind === 'part' && hit.part.def.id === 'block') {
            actions.push({ key: 'E', label: 'Rebuild the engine' });
            if (E) {
              this.project.v.engine.wear = 0;
              this.carried = null; p.carried = false; game.props.remove(p);
              game.survival.advance(1.5, { working: 1 });
              game.ui.message('Ninety minutes of greasy work later, the engine is like new.');
              game.audio.play('ratchet');
              used = true;
            }
          }
        }
        if (def?.desc && !actions.length) sub = def.desc;
      }
      game.audio.loop('pouring', this.pouring ? 0.4 : 0);
      if (!used && this.carried) {
        actions.push({ key: 'LMB', label: 'Drop' }, { key: 'RMB', label: 'Throw' });
        if (input.mousePressed(0)) this.drop();
        else if (input.mousePressed(2)) this.drop(true);
        else if (wheel) this.carryYaw += wheel * 0.25;
      }
      ui.prompt(title, actions, sub);
      return hit;
    }
    this.pouring = false;
    game.audio.loop('pouring', 0);
    this.hideGhost();

    // ------------------------------------------------ tool mode on a bolt
    if (hit && hit.kind === 'bolt') {
      const { part: P, index } = hit.bolt;
      const n = P.bolts.length;
      title = P.def.name;
      sub = `Bolt ${index + 1} of ${n}`;
      const t = P.bolts[index];
      actions.push({ key: 'Scroll ↑ / LMB', label: 'Tighten' }, { key: 'Scroll ↓ / RMB', label: 'Loosen' });
      this.ratchetT -= dt;
      let dir = 0;
      if (wheel < 0) dir = 1; else if (wheel > 0) dir = -1;
      if (!dir && this.ratchetT <= 0) {
        if (input.mouse(0)) dir = 1; else if (input.mouse(2)) dir = -1;
      }
      if (dir) {
        this.ratchetT = 0.13;
        if (this.project.turnBolt(P, index, dir)) {
          this.swing = 1;
          const nt = P.bolts[index];
          game.audio.play(nt === BOLT_MAX && dir > 0 ? 'tight' : 'ratchet', { pos: hit.point });
          game.survival.apply({ dirt: 0.12, fatigue: 0.02 });
          if (dir > 0 && P.bolts.every((b) => b >= BOLT_MAX)) game.ui.message(`${P.def.name} is tight.`, 1.6);
        }
      }
      ui.prompt(title, actions, sub, { pips: P.bolts[index], max: BOLT_MAX, tight: t >= BOLT_MAX });
      this.animWrench(dt);
      return hit;
    }
    this.animWrench(dt);

    // ------------------------------------------------ a fitted car part
    if (hit && hit.kind === 'part') {
      const P = hit.part;
      const pc = this.project;
      const id = P.def.id;
      title = P.def.name;
      const t = pc.tightness(P);
      const nb = P.bolts.length;
      const tight = P.bolts.filter((b) => b >= BOLT_MAX).length;
      sub = nb ? (t >= 1 ? 'All bolts tight' : `${tight} of ${nb} bolts tight`) : 'No bolts';
      const cd = pc.canDetach(P);
      if (id === 'carb') {
        sub += ` · Mixture ${pc.v.engine.mixture.toFixed(1).replace('.', ',')} : 1`;
        if (this.toolMode) {
          actions.push({ key: 'Scroll', label: 'Turn the mixture screw' });
          if (wheel) { pc.v.engine.mixture = clamp(pc.v.engine.mixture - wheel * 0.1, 9, 21); game.audio.play('ratchet', { vol: 0.3 }); }
        } else sub += ' (adjust with the screwdriver: F)';
      }
      if (id === 'distributor') {
        sub += ` · Timing ${Math.round(pc.v.engine.timing)}° BTDC`;
        if (P.bolts[0] < BOLT_MAX) {
          actions.push({ key: 'Scroll', label: 'Turn the distributor' });
          if (wheel) { pc.v.engine.timing = clamp(pc.v.engine.timing - wheel, -12, 28); game.audio.play('ratchet', { vol: 0.3 }); }
        } else sub += ' (loosen its clamp bolt to turn it)';
      }
      if (id === 'hood' && !cd.ok) {
        actions.push({ key: 'E', label: pc.hoodOpen ? 'Close the hood' : 'Open the hood' });
        if (E) { pc.setHood(!pc.hoodOpen); game.audio.play('door', { pos: hit.point }); }
      } else if (cd.ok) {
        actions.push({ key: 'E', label: 'Remove' });
        if (E && !this.toolMode) {
          const prop = pc.detach(id);
          if (prop) this.pick(prop);
        } else if (E) { this.toolMode = false; const prop = pc.detach(id); if (prop) this.pick(prop); }
      } else if (cd.reason && !actions.length) {
        sub += ' · ' + cd.reason;
      }
      if (id.startsWith('wheel') && pc.onStands && pc.canLower()) {
        actions.push({ key: 'X', label: 'Lower the car' });
        if (X) pc.lower();
      }
      if (pc.v.fixed && !pc.onStands) void 0;
      if (!this.toolMode && nb && t < 1) actions.push({ key: 'F', label: 'Wrench' });
      ui.prompt(title, actions, sub);
      return hit;
    }

    // ------------------------------------------------ loose props
    if (hit && hit.kind === 'prop') {
      const p = hit.prop;
      title = p.part ? PART_BY_ID[p.type.slice(5)].name : itemDisplayName(p);
      const def = ITEMS[p.type];
      if (!this.toolMode) actions.push({ key: 'LMB', label: 'Pick up' });
      if (def?.use) actions.push({ key: 'E', label: def.use.verb });
      if (p.type === 'bag' || def?.opens) actions.push({ key: 'E', label: p.type === 'bag' ? 'Unpack' : 'Open the box' });
      if (p.part) sub = `${p.mass} kg · belongs on the Ruska`;
      else if (def?.desc) sub = def.desc;
      if (input.mousePressed(0) && !this.toolMode) this.pick(p);
      else if (E) {
        if (def?.use) this.consume(p);
        else if (p.type === 'bag' || def?.opens) this.openItem(p);
      }
      ui.prompt(title, actions, sub);
      return hit;
    }

    // ------------------------------------------------ vehicles
    if (hit && hit.kind === 'vehicle') {
      const v = hit.vehicle;
      const pc = this.project;
      title = v.name;
      if (v.id === 'van' && hit.zone === 'rear') {
        actions.push({ key: 'E', label: v.rearDoorsOpen ? 'Close the rear doors' : 'Open the rear doors' });
        if (E) v.toggleRear();
      } else if (v === pc?.v) {
        const cs = pc.has('seat');
        if (!cs) sub = 'There is no seat to sit on';
        else { actions.push({ key: 'E', label: 'Get in' }); if (E) game.enterVehicle(v); }
        if (pc.onStands) sub = (sub ? sub + ' · ' : '') + 'On jack stands';
      } else {
        actions.push({ key: 'E', label: 'Drive' });
        if (E) game.enterVehicle(v);
      }
      ui.prompt(title, actions, sub);
      return hit;
    }

    // ------------------------------------------------ fixed world objects
    if (hit && hit.kind === 'target') {
      const t = hit.target;
      title = typeof t.name === 'function' ? t.name(game) : t.name;
      const h = t.hint ? t.hint(game) : 'Use';
      if (h) { actions.push({ key: 'E', label: h }); if (E) t.use(game); }
      const ah = t.altHint ? t.altHint(game) : null;
      if (ah) { actions.push({ key: 'X', label: ah }); if (X) t.alt(game); }
      if (t.sub) sub = t.sub(game);
      ui.prompt(title, actions, sub);
      return hit;
    }

    ui.prompt('', []);
    return hit;
  }

  updateCarry(dt, input) {
    const p = this.carried;
    const game = this.game;
    const cam = game.camera;
    const dir = _d.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const size = Math.max(p.half.x, p.half.z, p.half.y);
    let dist = clamp(0.75 + size * 1.3, 0.95, 2.1);
    const heavy = p.mass > 40;
    const target = _v.copy(cam.position).addScaledVector(dir, dist);
    if (heavy) target.y = Math.min(target.y, cam.position.y - 0.55);
    // don't push through walls
    const wall = game.colliders.raycast(cam.position.x, cam.position.y, cam.position.z, dir.x, dir.y, dir.z, dist + size, false, 'wall');
    if (wall < dist + size) target.copy(cam.position).addScaledVector(dir, Math.max(0.4, wall - size));
    const ext = game.props.lowestExtent(p, p.quat);
    const ground = game.colliders.surfaceHeight(target.x, target.z, target.y + 0.2);
    if (target.y - ext < ground) target.y = ground + ext;
    this.prevCarry.copy(p.pos);
    p.pos.lerp(target, 1 - Math.exp(-(heavy ? 8 : 18) * dt));
    this.carryVel.subVectors(p.pos, this.prevCarry).divideScalar(Math.max(dt, 1e-3));
    _q.setFromAxisAngle(UP, game.player.yaw + this.carryYaw);
    p.quat.slerp(_q, 1 - Math.exp(-10 * dt));
    void input;
  }

  pour(p, tgt, dt) {
    const game = this.game;
    const pc = this.project;
    const amt = Math.min(tgt.rate * dt, p.data.amount, tgt.room);
    if (amt <= 0) { this.pouring = false; return; }
    this.pouring = true;
    p.data.amount -= amt;
    if (tgt.kind === 'oil') {
      if (!pc.has('oilpan')) { if (!this._leakMsg) { game.ui.message('The oil runs straight out of the bottom. The oil pan is missing!'); this._leakMsg = true; } }
      else pc.v.engine.oil += amt;
    } else if (tgt.kind === 'coolant') {
      if (!pc.has('hoses')) { if (!this._leakMsg2) { game.ui.message('Coolant gushes out. The radiator hoses are missing!'); this._leakMsg2 = true; } }
      else pc.v.engine.coolant = (pc.v.engine.coolant || 0) + amt;
    } else if (tgt.kind === 'fuel') {
      tgt.v.engine.fuel += amt;
    }
    if (p.data.amount <= 0.01) game.ui.message('Empty.', 1.5);
  }

  animWrench(dt) {
    if (!this.wrench.visible) return;
    this.swing = Math.max(0, this.swing - dt * 6);
    const b = this.wrenchBase;
    this.wrench.rotation.set(b.x + Math.sin(this.swing * Math.PI) * 0.3, b.y, b.z - Math.sin(this.swing * Math.PI) * 0.5);
  }

  updatePee(dt, input) {
    const game = this.game;
    const S = game.survival;
    const peeing = input.isDown('KeyP') && S.urine > 0.5 && game.player.mode === 'walk';
    game.audio.loop('pee', peeing ? 0.25 : 0);
    this.pee.visible = peeing;
    if (!peeing) { this.peeT = 0; return; }
    this.peeT += dt;
    S.urine = Math.max(0, S.urine - dt * 22);
    if (S.urine <= 0.5) game.ui.message('Ahh. That is better.', 2);
    const pl = game.player;
    const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
    const ox = pl.pos.x + fx * 0.25, oy = pl.pos.y + (pl.crouch ? 0.55 : 0.92), oz = pl.pos.z + fz * 0.25;
    const arr = this.pee.geometry.attributes.position.array;
    const n = arr.length / 3;
    const v0 = 2.4;
    for (let i = 0; i < n; i++) {
      const t = ((i / n) + this.peeT * 1.7) % 1 * 0.55;
      arr[i * 3] = ox + fx * v0 * t + (Math.random() - 0.5) * 0.01;
      arr[i * 3 + 1] = oy + 0.6 * t - 4.9 * t * t;
      arr[i * 3 + 2] = oz + fz * v0 * t + (Math.random() - 0.5) * 0.01;
    }
    this.pee.geometry.attributes.position.needsUpdate = true;
  }
}

const ghostMats = {
  far: new THREE.MeshBasicMaterial({ color: 0x7fdc6a, transparent: true, opacity: 0.22, depthWrite: false }),
  near: new THREE.MeshBasicMaterial({ color: 0xc8ff8a, transparent: true, opacity: 0.5, depthWrite: false }),
};

export { IDEAL_MIXTURE };
