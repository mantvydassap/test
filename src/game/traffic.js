import * as THREE from 'three';
import { makeSedanMesh } from './vehicleModels.js';
import { clamp } from '../core/math.js';
import { mulberry32 } from '../core/rng.js';

const COLORS = [0x8a2c20, 0x2f5a7a, 0xd8cfae, 0x3d5e3a, 0xc4a02e, 0x5a5f63, 0x7a4a8a, 0xe9e5da];
const _v = new THREE.Vector3();

// Other drivers circling the highway, kinematic and polite (they brake for you).
export class Traffic {
  constructor(game, road, count = 5) {
    this.game = game;
    this.road = road;
    this.cars = [];
    const rand = mulberry32(99);
    const ss = road.samples;
    this.step = road.length / ss.length;
    for (let i = 0; i < count; i++) {
      const color = COLORS[i % COLORS.length];
      const mesh = makeSedanMesh(color);
      mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      game.scene.add(mesh);
      const dir = i % 2 === 0 ? 1 : -1;
      const car = {
        mesh, dir, s: (i / count) * road.length + rand() * 50, speed: 15,
        cruise: 17 + rand() * 6, lane: 1.85, wait: 0, ghost: 0,
        velocity: new THREE.Vector3(), q: new THREE.Quaternion(), pos: mesh.position,
        half: { hx: 0.86, hy: 0.75, hz: 2.2 }, honk: 0,
      };
      car.pointInside = (p) => this.pointInside(car, p);
      this.cars.push(car);
      this.place(car, 0);
    }
  }

  sampleAt(s) {
    const ss = this.road.samples;
    const L = this.road.length;
    s = ((s % L) + L) % L;
    let i = Math.floor(s / this.step);
    i = clamp(i, 0, ss.length - 1);
    // walk to the right segment (step is approximately uniform)
    while (i > 0 && ss[i].s > s) i--;
    while (i < ss.length - 1 && ss[i + 1].s <= s) i++;
    const a = ss[i], b = ss[(i + 1) % ss.length];
    const segLen = (i + 1 < ss.length ? b.s : L) - a.s;
    const t = segLen > 0 ? (s - a.s) / segLen : 0;
    return {
      x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
      tx: a.tx + (b.tx - a.tx) * t, tz: a.tz + (b.tz - a.tz) * t,
    };
  }

  place(car, dt) {
    const T = this.game.terrain;
    const smp = this.sampleAt(car.s);
    let tx = smp.tx * car.dir, tz = smp.tz * car.dir;
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    // right-hand traffic: lane is to the right of travel direction
    const rx = -tz, rz = tx;
    const x = smp.x - rx * car.lane, z = smp.z - rz * car.lane;
    const yF = T.heightAt(x + tx * 1.3, z + tz * 1.3), yB = T.heightAt(x - tx * 1.3, z - tz * 1.3);
    const y = (yF + yB) / 2 + 0.05;
    const prev = _v.copy(car.pos);
    car.pos.set(x, y, z);
    const yaw = Math.atan2(-tx, -tz);
    const pitch = Math.atan2(yF - yB, 2.6);
    car.mesh.rotation.set(pitch, yaw, 0, 'YXZ');
    car.q.copy(car.mesh.quaternion);
    if (dt > 0) car.velocity.subVectors(car.pos, prev).divideScalar(dt);
    car.fx = tx; car.fz = tz;
  }

  pointInside(car, p) {
    const l = car.mesh.worldToLocal(_v.copy(p));
    const h = car.half;
    const ly = l.y - 0.75;
    const ox = h.hx - Math.abs(l.x), oy = h.hy - Math.abs(ly), oz = h.hz - Math.abs(l.z);
    if (ox < 0 || oy < 0 || oz < 0) return null;
    let n, depth;
    if (ox < oz && ox < oy) { n = new THREE.Vector3(Math.sign(l.x), 0, 0); depth = ox; }
    else if (oz < oy) { n = new THREE.Vector3(0, 0, Math.sign(l.z)); depth = oz; }
    else { n = new THREE.Vector3(0, Math.sign(ly), 0); depth = oy; }
    n.applyQuaternion(car.q);
    return { n, depth };
  }

  nearby(pos, r) {
    return this.cars.filter((c) => c.pos.distanceToSquared(pos) < r * r);
  }

  update(dt, obstacles, daylight) {
    for (const car of this.cars) {
      let target = car.cruise;
      // slow down in the village
      const tp = this.game.town ? this.game.town.frame.c : null;
      if (tp && Math.hypot(car.pos.x - tp.x, car.pos.z - tp.z) < 150) target = Math.min(target, 13);
      if (car.ghost > 0) car.ghost -= dt;
      else {
        const check = (p, size = 2) => {
          const dx = p.x - car.pos.x, dz = p.z - car.pos.z;
          const along = dx * car.fx + dz * car.fz;
          const lat = Math.abs(dx * -car.fz + dz * car.fx);
          if (along > 0 && along < 45 && lat < size) target = Math.min(target, Math.max(0, (along - 6) * 0.45));
        };
        for (const o of obstacles) check(o, 2.4);
        for (const o of this.cars) if (o !== car && o.dir === car.dir) check(o.pos, 1.5);
      }
      if (car.speed < 0.5 && target < 1) {
        car.wait += dt;
        if (car.wait > 1.5 && car.honk <= 0) { car.honk = 6; this.game.audio.loop('horn:t' + this.cars.indexOf(car), 0.25, { pos: car.pos }); }
        if (car.wait > 14) { car.ghost = 5; car.wait = 0; }
      } else car.wait = 0;
      if (car.honk > 0) { car.honk -= dt; if (car.honk < 5.3) this.game.audio.loop('horn:t' + this.cars.indexOf(car), 0, { pos: car.pos }); }
      const acc = target > car.speed ? 2.2 : 7;
      car.speed += clamp(target - car.speed, -acc * dt, acc * dt);
      car.s += car.dir * car.speed * dt;
      this.place(car, dt);
      for (const w of car.mesh.userData.wheels) w.children[0].rotation.x -= car.speed / 0.3 * dt;
      car.mesh.userData.lightMat.emissiveIntensity = daylight < 0.55 ? 2.5 : 0.3;
    }
  }
}
