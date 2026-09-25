import * as THREE from 'three';
import { clamp, lerp } from '../core/math.js';
import { WATER, PLAY_HALF } from '../world/layout.js';

const GRAV = 9.81;
const GRIP = { asphalt: 1.0, concrete: 0.92, wood: 0.85, tile: 0.8, stone: 0.9, gravel: 0.74, grass: 0.62, field: 0.58, sand: 0.5, water: 0.3 };
const ROLL = { asphalt: 0.013, concrete: 0.013, wood: 0.015, tile: 0.015, stone: 0.015, gravel: 0.022, grass: 0.04, field: 0.05, sand: 0.07, water: 0.12 };

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _n = new THREE.Vector3(), _f = new THREE.Vector3(), _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m3 = new THREE.Matrix3();
const _info = {};

export const GEAR_NAMES = { '-1': 'R', 0: 'N', 1: '1', 2: '2', 3: '3', 4: '4' };

// Rigid-body car: raycast suspension, slip-angle tyres, a small engine and a 4-speed box.
export class Vehicle {
  constructor(game, spec) {
    this.game = game;
    this.spec = spec;
    this.name = spec.name;
    this.id = spec.id;
    this.body = new THREE.Group();          // model frame (origin at ground centre)
    this.body.name = 'vehicle:' + spec.id;
    this.body.userData.vehicle = this;
    game.scene.add(this.body);
    this.com = spec.com.clone();            // centre of mass in model space
    this.x = new THREE.Vector3();           // COM world position
    this.vel = new THREE.Vector3();
    this.angVel = new THREE.Vector3();
    this.q = this.body.quaternion;
    this.setMass(spec.mass);
    this.dims = spec.dims;                  // collision half extents {hx, y0, y1, hz} in model space
    this.wheels = spec.wheels.map((w, i) => ({
      i, hub: new THREE.Vector3(w.x, w.y, w.z), r: w.r, width: w.width || 0.18,
      steer: !!w.steer, driven: !!w.driven, rear: w.z > 0, present: true, mesh: null,
      comp: 0, contact: false, spin: 0, spinVel: 0, slip: 0, surface: 'grass', load: 0, left: w.x < 0,
    }));
    const susp = spec.suspension;
    this.k = susp.k; this.c = susp.c; this.travel = susp.travel; this.arb = susp.arb || 0;
    this.preload = (spec.mass * GRAV) / this.wheels.length;
    this.droop = this.preload / this.k + 0.04;

    // engine & drivetrain
    const e = spec.engine;
    this.engine = {
      running: false, rpm: 0, ignition: false, cranking: false, crankT: 0, stallCause: '',
      idle: e.idle, redline: e.redline, peak: e.peak, peakRpm: e.peakRpm, gears: e.gears, final: e.final,
      temp: 20, fuel: spec.fuel ?? 30, fuelCap: spec.fuelCap ?? 50, battery: spec.battery ?? 0.9, oil: 3.5, wear: 0,
      throttle: 0, load: 0, misfire: 0, backfireT: 0,
    };
    this.gear = 0;
    this.steer = 0;
    this.throttleIn = 0; this.brakeIn = 0; this.handbrake = true;
    this.lights = false;
    this.horn = false;
    this.driver = null;
    this.asleep = false; this.sleepT = 0;
    this.cargo = [];
    this.cargoBoxes = (spec.cargo || []).map((b) => ({ min: b.min.clone(), max: b.max.clone() }));
    this.speed = 0;
    this.lastImpact = 0;
    this.enginePos = spec.enginePos ? spec.enginePos.clone() : new THREE.Vector3(0, 0.6, -1.4);
    this.seat = spec.seat.clone();
    this.exitSide = spec.exitSide ? spec.exitSide.clone() : new THREE.Vector3(-1.4, 0.2, -0.2);
    this.contactPts = [];
    const d = this.dims;
    for (const x of [-d.hx, d.hx]) for (const y of [d.y0, d.y1]) for (const z of [-d.hz, d.hz]) this.contactPts.push(new THREE.Vector3(x, y, z));
    for (const y of [d.y0, d.y1]) {
      this.contactPts.push(new THREE.Vector3(0, y, -d.hz), new THREE.Vector3(0, y, d.hz), new THREE.Vector3(-d.hx, y, 0), new THREE.Vector3(d.hx, y, 0));
    }
    this.contactPts.push(new THREE.Vector3(0, d.y1, 0));
    this.sound = null;
    this.headlightPos = null;
    this.fixed = false;   // on stands / kinematic
    this.driveEnabled = true;
    this.impactCallback = null;
    this.canStart = () => ({ ok: this.engine.fuel > 0, reason: this.engine.fuel > 0 ? '' : 'Out of fuel' });
    this.quality = () => ({ power: 1, rough: 0, startEase: 1, loud: 0, cooling: 1, charging: true, oilOK: true });
  }

  setMass(m) {
    this.mass = m;
    this.invMass = 1 / m;
    const s = this.spec.inertiaDims || { w: 1.7, h: 1.2, l: 4.2 };
    const Ix = (m / 12) * (s.h * s.h + s.l * s.l);
    const Iy = (m / 12) * (s.w * s.w + s.l * s.l);
    const Iz = (m / 12) * (s.w * s.w + s.h * s.h);
    this.invI = new THREE.Vector3(1 / Ix, 1 / Iy, 1 / Iz);
    if (this.wheels) this.preload = (m * GRAV) / Math.max(1, this.wheels.filter((w) => w.present).length || 4);
  }

  // place with model origin at (x,y,z) and yaw
  place(x, y, z, yaw) {
    this.q.setFromAxisAngle(_v1.set(0, 1, 0), yaw);
    this.body.position.set(x, y, z);
    this.x.copy(this.com).applyQuaternion(this.q).add(this.body.position);
    this.vel.set(0, 0, 0); this.angVel.set(0, 0, 0);
    this.body.updateMatrixWorld(true);
    this.asleep = false;
  }

  get yaw() {
    _v1.set(0, 0, -1).applyQuaternion(this.q);
    return Math.atan2(-_v1.x, -_v1.z);
  }

  forward(out = new THREE.Vector3()) { return out.set(0, 0, -1).applyQuaternion(this.q); }
  up(out = new THREE.Vector3()) { return out.set(0, 1, 0).applyQuaternion(this.q); }

  localToWorld(v, out = new THREE.Vector3()) { return out.copy(v).applyMatrix4(this.body.matrixWorld); }

  insideCargo(local) {
    for (const b of this.cargoBoxes) {
      if (local.x > b.min.x && local.x < b.max.x && local.y > b.min.y - 0.1 && local.y < b.max.y && local.z > b.min.z && local.z < b.max.z) return true;
    }
    return false;
  }

  cargoFloorAt(local) {
    for (const b of this.cargoBoxes) {
      if (local.x > b.min.x && local.x < b.max.x && local.z > b.min.z && local.z < b.max.z) return b.min.y;
    }
    return this.cargoBoxes.length ? this.cargoBoxes[0].min.y : 0.5;
  }

  wake() { this.asleep = false; this.sleepT = 0; }

  // world-space inverse inertia applied to a vector
  applyInvI(v, out) {
    _q.copy(this.q).invert();
    out.copy(v).applyQuaternion(_q);
    out.x *= this.invI.x; out.y *= this.invI.y; out.z *= this.invI.z;
    return out.applyQuaternion(this.q);
  }

  applyImpulse(J, point) {
    this.vel.addScaledVector(J, this.invMass);
    _v3.subVectors(point, this.x).cross(J);
    this.applyInvI(_v3, _v4);
    this.angVel.add(_v4);
  }

  // ground under a suspension ray
  groundAlong(a, dir, maxLen) {
    const C = this.game.colliders;
    if (dir.y > -0.35) return null;
    let t = 0;
    let h = 0;
    for (let i = 0; i < 3; i++) {
      const px = a.x + dir.x * t, pz = a.z + dir.z * t;
      h = C.surfaceHeight(px, pz, a.y + 0.05, _info);
      const bump = this.surfaceBump(px, pz, _info.box);
      t = (a.y - (h + bump)) / -dir.y;
      if (t < 0) { t = 0; break; }
    }
    if (t > maxLen) return null;
    return { t, box: _info.box };
  }

  surfaceBump(x, z, box) {
    if (box) return 0;
    const T = this.game.terrain;
    const e = T.roadEdge(x, z);
    if (e < 0.5) {
      const idx = T.cellIndex(x, z);
      if (T.rType[idx] === 2) return T.n3(x * 0.9, z * 0.9) * 0.022 + T.n3(x * 3.1, z * 3.1) * 0.008;
      return T.n3(x * 0.4, z * 0.4) * 0.004;
    }
    return T.n3(x * 0.6, z * 0.6) * 0.035;
  }

  // ------------------------------------------------------------------
  step(h) {
    if (this.fixed) return;
    const game = this.game;
    const C = game.colliders;
    const T = game.terrain;
    const q = this.q;
    const up = _v1.set(0, 1, 0).applyQuaternion(q).clone();
    const fwd = _v1.set(0, 0, -1).applyQuaternion(q).clone();
    const right = _v1.set(1, 0, 0).applyQuaternion(q).clone();
    const dir = up.clone().negate();
    const force = new THREE.Vector3(0, -GRAV * this.mass, 0);
    const torque = new THREE.Vector3();
    const addForce = (F, p) => {
      force.add(F);
      _v2.subVectors(p, this.x).cross(F);
      torque.add(_v2);
    };
    const qual = this._qual || this.quality();
    const eng = this.engine;
    this.body.position.copy(this.com).applyQuaternion(q).negate().add(this.x);
    this.body.updateMatrixWorld(true);

    // --- engine & drivetrain
    const driven = this.wheels.filter((w) => w.driven && w.present);
    let vfDriven = 0, nContactDriven = 0;
    for (const w of driven) { vfDriven += w.spinVel * w.r; nContactDriven++; }
    vfDriven = nContactDriven ? vfDriven / nContactDriven : 0;
    const ratio = (this.gear === 0 ? 0 : eng.gears[this.gear]) * eng.final;
    const shaftRpm = (vfDriven / (driven[0] ? driven[0].r : 0.3)) * ratio * 60 / (2 * Math.PI);
    let engTorque = 0;
    let clutch = 0;
    const throttle = eng.running ? this.throttleIn : 0;
    eng.throttle = throttle;
    if (eng.running) {
      const torqueCurve = (rpm) => {
        const x = (rpm - eng.peakRpm) / (eng.redline * 0.75);
        return eng.peak * clamp(1 - x * x * 1.1, 0.42, 1) * qual.power * (1 - eng.wear * 0.006);
      };
      if (this.gear !== 0 && this.driveEnabled) {
        const engage = 1250;
        if (Math.abs(shaftRpm) < engage && !(throttle < 0.05 && Math.abs(shaftRpm) < 700)) {
          // slipping clutch while pulling away
          const target = Math.max(eng.idle + throttle * 1900, Math.abs(shaftRpm));
          eng.rpm = lerp(eng.rpm, target, 1 - Math.exp(-7 * h));
          clutch = throttle < 0.05 ? 0.25 : 1;
          engTorque = torqueCurve(eng.rpm) * throttle * clutch - (throttle < 0.05 ? 18 * Math.sign(shaftRpm) : 0);
        } else if (throttle < 0.05 && Math.abs(shaftRpm) < 700) {
          eng.rpm = lerp(eng.rpm, eng.idle, 1 - Math.exp(-5 * h));
          clutch = 0;
        } else {
          clutch = 1;
          eng.rpm = Math.max(eng.idle * 0.9, Math.abs(shaftRpm));
          const brakeT = 26 * (eng.rpm / eng.redline) + 8;
          engTorque = torqueCurve(eng.rpm) * throttle - brakeT * (1 - throttle);
          if (Math.sign(shaftRpm) < 0 && this.gear > 0) engTorque = torqueCurve(eng.rpm) * throttle;
        }
      } else {
        const target = eng.idle + throttle * (eng.redline * 1.05 - eng.idle);
        eng.rpm = lerp(eng.rpm, target, 1 - Math.exp(-(throttle > eng.rpm / eng.redline ? 6 : 2.5) * h));
      }
      if (eng.rpm > eng.redline) { engTorque = Math.min(engTorque, 0); eng.rpm = eng.redline + Math.random() * 60; }
      eng.rpm = Math.max(eng.rpm, 350);
      // rough running jitter
      if (qual.rough > 0) eng.rpm += (Math.random() - 0.5) * qual.rough * 180;
    }
    this.engineAux(h, qual);
    // engine braking / drive split across driven wheels
    const eff = 0.86;
    const driveTotal = this.driveEnabled ? engTorque * ratio * eff : 0;

    // --- wheels: pass 1 (ray casts)
    const pts = [];
    for (const w of this.wheels) {
      if (!w.present) { w.contact = false; continue; }
      const a = _v2.set(w.hub.x, w.hub.y + this.travel, w.hub.z).applyMatrix4(this.body.matrixWorld).clone();
      const maxLen = this.travel + w.r + this.droop;
      const g = this.groundAlong(a, dir, maxLen);
      if (g) {
        w.contact = true;
        w.comp = this.travel + w.r - g.t;
        w.contactPt = a.clone().addScaledVector(dir, g.t);
        w.box = g.box;
        w.surface = g.box ? (g.box.mat || 'concrete') : T.surfaceAt(w.contactPt.x, w.contactPt.z);
        if (w.contactPt.y < WATER - 0.2 && !g.box) w.surface = 'water';
      } else {
        w.contact = false;
        w.comp = -this.droop + 0.02;
      }
      pts.push(a);
    }
    // anti-roll
    const arbF = new Map();
    if (this.arb) {
      for (const rear of [false, true]) {
        const L = this.wheels.find((w) => w.rear === rear && w.left && w.present);
        const R = this.wheels.find((w) => w.rear === rear && !w.left && w.present);
        if (L && R && L.contact && R.contact) {
          const d = (L.comp - R.comp) * this.arb;
          arbF.set(L, d); arbF.set(R, -d);
        }
      }
    }

    // --- wheels: pass 2 (forces)
    const steerAngle = this.steer;
    let slipSum = 0;
    const brakeMax = this.spec.brake || 5200;
    for (const w of this.wheels) {
      if (!w.present) continue;
      const mShare = this.mass / 4;
      if (!w.contact) {
        // free wheel: spin decays or follows the engine
        if (w.driven && clutch > 0.5) w.spinVel = lerp(w.spinVel, (shaftRpm / (ratio || 1)) * 2 * Math.PI / 60, 0.2);
        w.spinVel *= 1 - 0.8 * h;
        if (this.handbrake && w.rear) w.spinVel = 0;
        if (this.brakeIn > 0) w.spinVel *= 1 - 8 * h;
        w.spin += w.spinVel * h;
        w.load = 0;
        continue;
      }
      const cp = w.contactPt;
      const rel = _v2.subVectors(cp, this.x);
      const vp = _v3.copy(this.angVel).cross(rel).add(this.vel);
      const vUp = vp.dot(up);
      let Fs = this.k * w.comp + this.preload - this.c * vUp + (arbF.get(w) || 0);
      if (w.comp > this.travel * 0.85) Fs += this.k * 12 * (w.comp - this.travel * 0.85);
      Fs = Math.max(0, Fs);
      w.load = Fs;
      // ground normal
      if (w.box) _n.set(0, 1, 0); else T.normalAt(cp.x, cp.z, _n);
      // tyre directions
      const sa = w.steer ? steerAngle : 0;
      _f.copy(fwd).multiplyScalar(Math.cos(sa)).addScaledVector(right, -Math.sin(sa));
      _f.addScaledVector(_n, -_f.dot(_n)).normalize();
      _s.crossVectors(_n, _f).normalize(); // points left
      const vf = vp.dot(_f), vs = vp.dot(_s);
      let mu = (GRIP[w.surface] ?? 0.7) * (this.spec.grip || 1);
      // lateral force from slip angle
      const alpha = Math.atan2(vs, Math.max(Math.abs(vf), 2.2));
      const aPeak = 0.14;
      const a = Math.abs(alpha) / aPeak;
      let gl = a < 1 ? a * (2 - a) : Math.max(0.7, 1 - (a - 1) * 0.1);
      let latMul = 1;
      if (this.handbrake && w.rear && Math.abs(vf) > 2) latMul = 0.45;
      let Fy = -Math.sign(alpha) * gl * mu * Fs * latMul;
      // longitudinal
      let Fx = 0;
      if (w.driven && driven.length) Fx += driveTotal / driven.length / w.r;
      let brake = this.brakeIn * brakeMax * (w.rear ? 0.4 : 0.6);
      if (this.handbrake && w.rear) brake += 3500;
      if (!eng.running && this.gear !== 0 && w.driven) brake += 250; // engine compression
      const vfAbs = Math.abs(vf);
      if (brake > 0) Fx -= Math.sign(vf) * Math.min(brake, vfAbs * mShare / h * 0.9);
      const roll = (ROLL[w.surface] ?? 0.02) * Fs;
      Fx -= Math.sign(vf) * Math.min(roll, vfAbs * mShare / h * 0.5);
      // friction circle
      const maxF = mu * Fs * 1.05;
      const mag = Math.hypot(Fx, Fy);
      let slip = 0;
      if (mag > maxF && mag > 1) {
        const sc = maxF / mag;
        slip = (mag - maxF) / Math.max(maxF, 1);
        Fx *= sc; Fy *= sc;
      }
      slip = Math.max(slip, Math.min(1, Math.abs(alpha) / 0.35) * Math.min(1, vfAbs / 6));
      w.slip = slip;
      slipSum += slip;
      // wheel spin for visuals / drivetrain
      let target = vf / w.r;
      if (w.driven && clutch > 0.5 && slip > 0.3 && Math.abs(driveTotal) > 1) target += Math.sign(driveTotal) * slip * 20;
      if (this.handbrake && w.rear) target = 0;
      if (this.brakeIn > 0.5 && slip > 0.5) target *= 0.2;
      w.spinVel = target;
      w.spin += w.spinVel * h;
      const F = _v4.copy(up).multiplyScalar(Fs).addScaledVector(_f, Fx).addScaledVector(_s, Fy);
      const applyAt = cp.clone().addScaledVector(up, w.r * 0.6);
      addForce(F, applyAt);
    }
    this.skid = slipSum;

    // aero drag
    const sp = this.vel.length();
    this.speed = sp;
    force.addScaledVector(this.vel, -(this.spec.drag || 0.45) * sp);
    // water drag
    if (this.x.y < WATER + 0.3) { force.addScaledVector(this.vel, -this.mass * 1.5); force.y += this.mass * GRAV * 0.5; }

    // integrate
    this.vel.addScaledVector(force, this.invMass * h);
    this.applyInvI(torque, _v2);
    this.angVel.addScaledVector(_v2, h);
    this.angVel.multiplyScalar(1 - 0.2 * h);
    this.x.addScaledVector(this.vel, h);
    const w = this.angVel.length();
    if (w > 1e-6) {
      _q.setFromAxisAngle(_v2.copy(this.angVel).divideScalar(w), w * h);
      q.premultiply(_q).normalize();
    }
    this.body.position.copy(this.com).applyQuaternion(q).negate().add(this.x);
    this.body.updateMatrixWorld(true);

    // --- chassis contacts
    let maxImpact = 0;
    const others = game.vehicles.filter((o) => o !== this && !o.fixed && o.body.position.distanceToSquared(this.x) < 64);
    const traffic = game.traffic ? game.traffic.nearby(this.x, 10) : [];
    for (const lp of this.contactPts) {
      const p = _v2.copy(lp).applyMatrix4(this.body.matrixWorld);
      let n = null, depth = 0, otherVel = null, other = null;
      // terrain / floors
      const sh = C.surfaceHeight(p.x, p.z, p.y + 0.5, _info);
      if (p.y < sh) {
        depth = sh - p.y;
        n = _info.box ? new THREE.Vector3(0, 1, 0) : T.normalAt(p.x, p.z);
      }
      const bc = C.pointContact(p.x, p.y, p.z);
      if (bc && bc.depth > depth && !(bc.ny > 0.5 && n)) { depth = bc.depth; n = new THREE.Vector3(bc.nx, bc.ny, bc.nz); }
      const tc = C.treeContact(p.x, p.y, p.z);
      if (tc && tc.depth > depth) { depth = tc.depth; n = new THREE.Vector3(tc.nx, 0, tc.nz); }
      for (const o of others) {
        const c = o.pointInside(p);
        if (c && c.depth > depth) { depth = c.depth; n = c.n; other = o; }
      }
      for (const tcar of traffic) {
        const c = tcar.pointInside(p);
        if (c && c.depth > depth) { depth = c.depth; n = c.n; otherVel = tcar.velocity; other = tcar; }
      }
      if (!n) continue;
      const rel = _v3.subVectors(p, this.x).clone();
      const vp = _v4.copy(this.angVel).cross(rel).add(this.vel).clone();
      if (other && other.vel && !otherVel) vp.sub(other.pointVelocity(p));
      if (otherVel) vp.sub(otherVel);
      const vn = vp.dot(n);
      if (vn < 0) {
        const rn = rel.clone().cross(n);
        const k = this.invMass + n.dot(this.applyInvI(rn, new THREE.Vector3()).cross(rel)) + (other && other.invMass && !otherVel ? other.invMass : 0);
        const jn = -(1.15 * vn) / k;
        const J = n.clone().multiplyScalar(jn);
        // friction
        const vt = vp.clone().addScaledVector(n, -vn);
        const vtl = vt.length();
        if (vtl > 1e-4) {
          const jt = Math.min(vtl / k * 0.5, 0.6 * jn);
          J.addScaledVector(vt, -jt / vtl);
        }
        this.applyImpulse(J, p);
        if (other && other.applyImpulse && !otherVel) { other.wake(); other.applyImpulse(J.clone().negate(), p); }
        const impact = -vn;
        if (impact > maxImpact) maxImpact = impact;
      }
      this.x.addScaledVector(n, Math.max(0, depth - 0.005) * 0.5);
    }
    this.body.position.copy(this.com).applyQuaternion(q).negate().add(this.x);
    this.body.updateMatrixWorld(true);
    if (maxImpact > 4 && this.impactCallback) this.impactCallback(maxImpact);
    this.lastImpact = Math.max(this.lastImpact, maxImpact);

    // bounds
    if (Math.abs(this.x.x) > PLAY_HALF || Math.abs(this.x.z) > PLAY_HALF) {
      this.x.x = clamp(this.x.x, -PLAY_HALF, PLAY_HALF); this.x.z = clamp(this.x.z, -PLAY_HALF, PLAY_HALF);
      this.vel.multiplyScalar(0.5);
    }
    // safety: never fall through the world
    const gh = T.heightAt(this.x.x, this.x.z);
    if (this.x.y < gh - 2) { this.x.y = gh + 1.5; this.vel.set(0, 0, 0); }
  }

  // Fuel, heat, oil, battery and stalling. Runs whether or not the car is on the ground.
  engineAux(h, qual) {
    const eng = this.engine;
    const game = this.game;
    if (eng.running) {
      const throttle = eng.throttle;
      eng.fuel = Math.max(0, eng.fuel - 1.6e-6 * eng.rpm * (0.25 + throttle) * h * (this.spec.thirst || 1));
      const heat = 0.8 + 3.0 * (eng.rpm / 6000) * (0.3 + throttle);
      let kc = 0.025 * qual.cooling;
      if (eng.temp > 95 && qual.cooling > 0.5) kc *= 1 + (eng.temp - 95) * 0.15;
      eng.temp += (heat - kc * (eng.temp - 20)) * h;
      if (!qual.oilOK) eng.wear = Math.min(100, eng.wear + h * (0.8 + eng.rpm / 3000));
      if (eng.temp > 120) eng.wear = Math.min(100, eng.wear + h * 0.6);
      eng.battery = clamp(eng.battery + (qual.charging ? 0.004 : -0.0012) * h - (this.lights ? 0.0006 * h : 0), 0, 1);
      let stall = '';
      if (eng.fuel <= 0) stall = 'Out of fuel';
      else if (eng.temp > 128) stall = 'The engine overheated';
      else if (eng.wear >= 100) stall = 'The engine seized';
      else if (!eng.ignition) stall = 'off';
      else if (this.x.y < WATER - 0.1) stall = 'Water got into the engine';
      else { const cs = this._canStart || this.canStart(); if (!cs.ok) stall = cs.reason; }
      if (stall) {
        eng.running = false;
        eng.stallCause = stall;
        if (stall !== 'off' && this.driver) game.ui.message(stall + '.');
        if (stall === 'The engine seized') game.audio.play('clunk', { pos: this.x });
      }
    } else {
      eng.rpm = Math.max(0, eng.rpm - 2500 * h);
      eng.temp += (20 - eng.temp) * 0.004 * h;
      if (eng.cranking) {
        eng.rpm = 180 + Math.sin(performance.now() * 0.02) * 40;
        eng.battery = Math.max(0, eng.battery - 0.02 * h);
      }
    }
  }

  // Engine only (car on stands or wheels in the air): free-revving like neutral.
  engineFree(h) {
    const eng = this.engine;
    const qual = this._qual || this.quality();
    eng.throttle = eng.running ? this.throttleIn : 0;
    if (eng.running) {
      const target = eng.idle + eng.throttle * (eng.redline * 1.05 - eng.idle);
      eng.rpm = lerp(eng.rpm, target, 1 - Math.exp(-(eng.throttle > eng.rpm / eng.redline ? 6 : 2.5) * h));
      if (eng.rpm > eng.redline) eng.rpm = eng.redline + Math.random() * 60;
      if (qual.rough > 0) eng.rpm += (Math.random() - 0.5) * qual.rough * 180;
    }
    this.engineAux(h, qual);
  }

  // point test in this vehicle's box (for vehicle-vehicle contacts)
  pointInside(p) {
    const l = this.body.worldToLocal(_v1.copy(p));
    const d = this.dims;
    const cy = (d.y0 + d.y1) / 2, hy = (d.y1 - d.y0) / 2;
    const ox = d.hx - Math.abs(l.x), oy = hy - Math.abs(l.y - cy), oz = d.hz - Math.abs(l.z);
    if (ox < 0 || oy < 0 || oz < 0) return null;
    let n;
    let depth;
    if (ox < oz && ox < oy) { n = new THREE.Vector3(Math.sign(l.x), 0, 0); depth = ox; }
    else if (oz < oy) { n = new THREE.Vector3(0, 0, Math.sign(l.z)); depth = oz; }
    else { n = new THREE.Vector3(0, Math.sign(l.y - cy), 0); depth = oy; }
    n.applyQuaternion(this.q);
    return { n, depth };
  }

  pointVelocity(p) {
    return _v1.subVectors(p, this.x).clone().cross(this.angVel).negate().add(this.vel);
  }

  // physics tick with sleeping
  update(dt, substeps) {
    this._qual = this.quality();
    this._canStart = this.canStart();
    if (this.fixed) { this.engineFree(dt); this.syncVisuals(dt); return; }
    const inputActive = this.throttleIn > 0 || this.brakeIn > 0 || Math.abs(this.steer) > 0.01 || this.engine.cranking || (this.engine.running && this.gear !== 0);
    if (this.asleep) {
      if (inputActive || (!this.handbrake && this.driver)) this.wake();
      else { this.engineFree(dt); this.syncVisuals(dt); return; }
    }
    const h = dt / substeps;
    for (let i = 0; i < substeps; i++) this.step(h);
    const still = this.vel.lengthSq() < 0.01 && this.angVel.lengthSq() < 0.01;
    const grounded = this.wheels.filter((w) => w.present && w.contact).length >= 3;
    if (still && !inputActive && (grounded || this.wheels.every((w) => !w.present))) {
      this.sleepT += dt;
      if (this.sleepT > 1.2) { this.asleep = true; this.vel.set(0, 0, 0); this.angVel.set(0, 0, 0); }
    } else this.sleepT = 0;
    this.syncVisuals(dt);
  }

  syncVisuals() {
    for (const w of this.wheels) {
      if (!w.mesh) continue;
      w.mesh.position.set(w.hub.x, w.hub.y + clamp(w.comp, -this.droop, this.travel), w.hub.z);
      w.mesh.rotation.set(0, 0, 0);
      w.mesh.rotation.order = 'YXZ';
      if (w.steer) w.mesh.rotation.y = this.steer;
      w.mesh.rotation.x = -w.spin;
    }
    if (this.steeringWheel) this.steeringWheel.rotation.z = -this.steer * 5;
    if (this.lightMat) this.lightMat.emissiveIntensity = this.lights && this.engine.battery > 0.02 ? 3 : 0;
    if (this.brakeMat) this.brakeMat.emissiveIntensity = (this.brakeIn > 0.1 ? 2.5 : 0) + (this.lights ? 0.6 : 0);
  }

  // ------------------------------------------------------------------
  // Driver controls (player).
  drive(input, dt, settings) {
    const eng = this.engine;
    // ignition: tap I switches the key on/off, hold I cranks the starter
    const game = this.game;
    if (input.wasPressed('KeyI')) {
      this._iHeld = 0;
      this._iWasRunning = eng.running;
      this._iWasOn = eng.ignition;
      if (!eng.ignition) { eng.ignition = true; game.audio.play('switch'); }
    }
    if (input.isDown('KeyI')) {
      this._iHeld = (this._iHeld || 0) + dt;
      if (!this._iWasRunning && !eng.running && this._iHeld > 0.2) this.crank(dt);
      else if (eng.running) eng.cranking = false;
    } else if (eng.cranking) {
      eng.cranking = false;
      eng.crankT = 0;
    }
    if (input.wasReleased('KeyI') && (this._iHeld || 0) <= 0.25) {
      if (this._iWasRunning) { eng.running = false; eng.ignition = false; eng.stallCause = 'off'; game.audio.play('switch'); }
      else if (this._iWasOn) { eng.ignition = false; game.audio.play('switch'); }
    }

    const auto = settings.autoGear;
    const fwdSpeed = this.vel.dot(this.forward(_v1));
    // gears
    if (input.wasPressed('KeyR') && this.gear < 4) { this.gear++; this.game.audio.play('switch', { vol: 0.5 }); }
    if (input.wasPressed('KeyF') && this.gear > -1) { this.gear--; this.game.audio.play('switch', { vol: 0.5 }); }
    let wantThrottle = input.isDown('KeyW') ? 1 : 0;
    let wantBrake = input.isDown('KeyS') ? 1 : 0;
    if (auto && eng.running) {
      if (this.gear === 0 && wantThrottle) this.gear = 1;
      if (this.gear > 0 && wantBrake && fwdSpeed < 0.6) { this.gear = -1; }
      if (this.gear === -1) {
        if (wantThrottle && fwdSpeed > -0.6) this.gear = 1;
        else { const t = wantBrake; wantBrake = wantThrottle; wantThrottle = t; }
      }
      if (this.gear > 0) {
        this._shiftT = (this._shiftT || 0) - dt;
        if (this._shiftT <= 0) {
          if (eng.rpm > eng.redline * 0.86 && this.gear < 4) { this.gear++; this._shiftT = 0.6; }
          else if (eng.rpm < eng.idle * 1.9 && this.gear > 1) { this.gear--; this._shiftT = 0.6; }
        }
      }
    }
    this.throttleIn = lerp(this.throttleIn, wantThrottle, 1 - Math.exp(-10 * dt));
    if (wantThrottle === 0 && this.throttleIn < 0.02) this.throttleIn = 0;
    this.brakeIn = wantBrake;
    this.handbrake = input.isDown('Space');
    // steering (speed sensitive)
    const sIn = (input.isDown('KeyA') ? 1 : 0) - (input.isDown('KeyD') ? 1 : 0);
    const maxSteer = (this.spec.maxSteer || 0.6) / (1 + this.speed / 16);
    const target = sIn * maxSteer;
    const rate = sIn === 0 ? 4 : 2.6;
    this.steer += clamp(target - this.steer, -rate * dt, rate * dt);
    // lights & horn
    if (input.wasPressed('KeyL')) { this.lights = !this.lights; this.game.audio.play('switch'); }
    this.horn = input.isDown('KeyH') && eng.battery > 0.05;
    this.game.audio.loop('horn:' + this.id, this.horn ? 0.3 : 0, { pos: this.x });
  }

  crank(dt) {
    const eng = this.engine;
    const game = this.game;
    if (eng.battery < 0.06) {
      if (!this._deadMsg) { game.ui.message('Click. The battery is flat.'); game.audio.play('switch'); this._deadMsg = true; }
      eng.cranking = false;
      return;
    }
    this._deadMsg = false;
    eng.cranking = true;
    eng.crankT += dt;
    this.wake();
    const cs = this.canStart();
    const qual = this.quality();
    const needed = 0.7 / Math.max(0.15, qual.startEase) + (eng.temp < 30 ? 0.4 : 0);
    if (cs.ok && eng.crankT > needed && eng.battery > 0.1) {
      eng.running = true;
      eng.cranking = false;
      eng.crankT = 0;
      eng.rpm = eng.idle * 1.4;
      eng.stallCause = '';
      if (qual.rough > 0.4) game.audio.play('backfire', { pos: this.x });
    } else if (!cs.ok && eng.crankT > 2.5 && !this._whyShown) {
      this._whyShown = true;
      if (cs.hint) game.ui.message(cs.hint);
    }
    if (!eng.cranking) this._whyShown = false;
  }

  // Audio + headlights, called every frame.
  updateSound(camera, inside) {
    const eng = this.engine;
    const audio = this.game.audio;
    if (!audio.enabled) return;
    if (!this.sound || !this.sound.alive) {
      if (!eng.running && !eng.cranking && this.speed < 1) return;
      this.sound = audio.createEngine({ cylinders: 4, character: this.spec.soundChar || 1 });
    }
    const q = this.quality();
    const pos = _v1.copy(this.enginePos).applyMatrix4(this.body.matrixWorld);
    this.sound.update({ rpm: eng.cranking ? eng.rpm : eng.rpm, throttle: eng.throttle, running: eng.running, loud: q.loud, rough: q.rough, pos, inside, cranking: eng.cranking, crankRate: 0.6 + eng.battery * 0.6 });
    const vol = Math.min(1, this.skid * 0.6) * Math.min(1, this.speed / 5);
    audio.loop('skid:' + this.id, this.wheels.some((w) => w.contact && (w.surface === 'asphalt' || w.surface === 'concrete')) ? vol * 0.35 : 0, { pos: this.x });
    const onGravel = this.wheels.some((w) => w.contact && (w.surface === 'gravel' || w.surface === 'grass' || w.surface === 'field'));
    audio.loop('gravel:' + this.id, onGravel ? Math.min(0.28, this.speed / 45) : 0, { pos: this.x });
    if (eng.running && q.rough > 0.3 && Math.random() < q.rough * 0.004) audio.play('backfire', { pos, vol: 0.6 });
  }
}
