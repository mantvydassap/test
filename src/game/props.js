import * as THREE from 'three';
import { ITEMS, makeItemMesh } from './items.js';
import { WATER, PLAY_HALF } from '../world/layout.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _corner = new THREE.Vector3();
const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)];

let nextId = 1;

// Loose objects: groceries, tools, car parts. Simple box physics that settles on flat faces.
export class Props {
  constructor(game) {
    this.game = game;
    this.list = [];
  }

  spawn(type, pos, opts = {}) {
    const def = ITEMS[type];
    const mesh = makeItemMesh(type);
    const prop = this.register(mesh, { type, half: def.size, mass: def.mass, name: def.name, ...opts });
    prop.data.amount = opts.amount ?? def.amount;
    if (def.portions) prop.data.portions = opts.portions ?? def.portions;
    if (type === 'bag') prop.data.contents = opts.contents || [];
    prop.pos.copy(pos);
    if (opts.yaw) prop.quat.setFromAxisAngle(UP, opts.yaw);
    return prop;
  }

  register(mesh, { type, half, mass, name, part = null, id = null, data = null }) {
    const prop = {
      id: id || nextId++, type, mesh, name,
      pos: mesh.position, quat: mesh.quaternion,
      vel: new THREE.Vector3(), angVel: new THREE.Vector3(),
      half: new THREE.Vector3(half[0], half[1], half[2]),
      mass, asleep: false, carried: false, sleepT: 0,
      vehicle: null, local: new THREE.Vector3(), localQuat: new THREE.Quaternion(),
      part, data: data || {},
    };
    if (id && id >= nextId) nextId = id + 1;
    mesh.userData.prop = prop;
    mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.game.scene.add(mesh);
    this.list.push(prop);
    return prop;
  }

  remove(prop) {
    const i = this.list.indexOf(prop);
    if (i >= 0) this.list.splice(i, 1);
    if (prop.vehicle) this.detachFromVehicle(prop);
    if (prop.mesh.parent) prop.mesh.parent.remove(prop.mesh);
  }

  wake(prop) { prop.asleep = false; prop.sleepT = 0; }

  wakeNear(pos, r) {
    for (const p of this.list) if (p.asleep && !p.vehicle && p.pos.distanceToSquared(pos) < r * r) this.wake(p);
  }

  attachToVehicle(prop, v) {
    prop.vehicle = v;
    v.body.worldToLocal(prop.local.copy(prop.pos));
    _q.copy(v.body.quaternion).invert();
    prop.localQuat.copy(_q).multiply(prop.quat);
    // settle on the cargo floor
    const floor = v.cargoFloorAt(prop.local);
    prop.local.y = floor + this.lowestExtent(prop, prop.localQuat);
    prop.vel.set(0, 0, 0); prop.angVel.set(0, 0, 0);
    prop.asleep = true;
    v.cargo.push(prop);
  }

  detachFromVehicle(prop) {
    const v = prop.vehicle;
    if (!v) return;
    const i = v.cargo.indexOf(prop);
    if (i >= 0) v.cargo.splice(i, 1);
    prop.vehicle = null;
    prop.vel.copy(v.vel || _v.set(0, 0, 0));
    this.wake(prop);
  }

  // half-height of the prop along world up for a given orientation
  lowestExtent(prop, quat) {
    let m = 0;
    for (let i = 0; i < 3; i++) {
      _v.set(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0).applyQuaternion(quat);
      const h = i === 0 ? prop.half.x : i === 1 ? prop.half.y : prop.half.z;
      m += Math.abs(_v.y) * h;
    }
    return m;
  }

  update(dt) {
    const game = this.game;
    const C = game.colliders;
    for (const p of this.list) {
      if (p.carried) continue;
      if (p.vehicle) {
        const v = p.vehicle;
        p.pos.copy(p.local).applyMatrix4(v.body.matrixWorld);
        p.quat.copy(v.body.quaternion).multiply(p.localQuat);
        continue;
      }
      if (p.asleep) continue;

      const steps = 2;
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        p.vel.y -= 9.81 * h;
        // water: light things float, heavy things sink slowly
        const depth = WATER - p.pos.y;
        if (depth > 0) {
          const floaty = p.mass < 3 && !p.part;
          p.vel.y += (floaty ? 14 : 7) * h * Math.min(1, depth / Math.max(0.05, p.half.y));
          p.vel.multiplyScalar(1 - 2.5 * h);
          p.angVel.multiplyScalar(1 - 3 * h);
        }
        p.pos.addScaledVector(p.vel, h);
        const w = p.angVel.length();
        if (w > 1e-4) {
          _q.setFromAxisAngle(_v.copy(p.angVel).divideScalar(w), w * h);
          p.quat.premultiply(_q).normalize();
        }
        // ground contact via the lowest point
        const ext = this.lowestExtent(p, p.quat);
        const bottom = p.pos.y - ext;
        const support = C.surfaceHeight(p.pos.x, p.pos.z, bottom + 0.35);
        let onGround = false;
        if (bottom <= support) {
          p.pos.y = support + ext;
          if (p.vel.y < -1.5) {
            p.vel.y = -p.vel.y * 0.22;
            if (Math.abs(p.vel.y) > 0.6) game.audio.play(p.type === 'bottle' || p.type === 'beer' ? 'bottle' : p.mass > 5 ? 'thud' : 'drop', { pos: p.pos, vol: Math.min(1, p.mass / 3 + 0.3) });
          } else if (p.vel.y < 0) p.vel.y = 0;
          const fr = Math.max(0, 1 - 7 * h);
          p.vel.x *= fr; p.vel.z *= fr;
          p.angVel.multiplyScalar(Math.max(0, 1 - 6 * h));
          onGround = true;
          // settle toward the flat face closest to the ground
          let best = null, bd = -2;
          for (const a of AXES) {
            _v.copy(a).applyQuaternion(p.quat);
            if (_v.y > bd) { bd = _v.y; best = a; }
          }
          _v.copy(best).applyQuaternion(p.quat);
          _q2.setFromUnitVectors(_v, UP);
          _q.identity().slerp(_q2, Math.min(1, 10 * h));
          p.quat.premultiply(_q).normalize();
        }
        // walls and trees
        const r = Math.max(0.05, Math.min(p.half.x, p.half.z));
        const ox = p.pos.x, oz = p.pos.z;
        if (C.pushCircle(p.pos, r, p.pos.y - ext + 0.05, p.pos.y + ext)) {
          const dx = p.pos.x - ox, dz = p.pos.z - oz;
          const l = Math.hypot(dx, dz);
          if (l > 1e-6) {
            const nx = dx / l, nz = dz / l;
            const vn = p.vel.x * nx + p.vel.z * nz;
            if (vn < 0) { p.vel.x -= 1.4 * vn * nx; p.vel.z -= 1.4 * vn * nz; }
          }
        }
        // keep inside the map
        p.pos.x = Math.max(-PLAY_HALF, Math.min(PLAY_HALF, p.pos.x));
        p.pos.z = Math.max(-PLAY_HALF, Math.min(PLAY_HALF, p.pos.z));

        if (onGround && p.vel.lengthSq() < 0.004 && p.angVel.lengthSq() < 0.01) {
          p.sleepT += h;
          if (p.sleepT > 0.4) {
            p.asleep = true;
            p.vel.set(0, 0, 0); p.angVel.set(0, 0, 0);
            // snap exactly upright on its resting face
            let best = null, bd = -2;
            for (const a of AXES) { _v.copy(a).applyQuaternion(p.quat); if (_v.y > bd) { bd = _v.y; best = a; } }
            _v.copy(best).applyQuaternion(p.quat);
            _q2.setFromUnitVectors(_v, UP);
            p.quat.premultiply(_q2).normalize();
            p.pos.y = support + this.lowestExtent(p, p.quat);
            break;
          }
        } else p.sleepT = 0;
      }
      if (p.asleep) continue;
      // did it land in a vehicle's cargo space?
      for (const v of game.vehicles) {
        if (!v.cargoBoxes || !v.cargoBoxes.length) continue;
        if (v.body.position.distanceToSquared(p.pos) > 36) continue;
        v.body.worldToLocal(_corner.copy(p.pos));
        if (v.insideCargo(_corner) && p.vel.y <= 0.5) { this.attachToVehicle(p, v); break; }
      }
    }
  }

  nearby(pos, r) {
    return this.list.filter((p) => !p.carried && p.pos.distanceToSquared(pos) < r * r);
  }
}
