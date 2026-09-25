import * as THREE from 'three';
import { clamp, lerp, damp } from '../core/math.js';
import { WATER, PLAY_HALF } from '../world/layout.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

// First-person body: walking, jumping, swimming, sitting, driving camera.
export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.radius = 0.3;
    this.height = 1.78;
    this.eye = 1.64;
    this.onGround = false;
    this.crouch = false;
    this.mode = 'walk';
    this.vehicle = null;
    this.camMode = 'fp';
    this.lookYaw = 0; this.lookPitch = 0;   // head look while seated
    this.bobPhase = 0; this.bobAmt = 0;
    this.stepAcc = 0;
    this.shake = 0;
    this.swimming = false;
    this.underwater = 0;
    this.sprinting = false;
    this.airTime = 0; this.maxFall = 0;
    this.sitPos = null;
    this.time = 0;
    this.chase = new THREE.Vector3();
    this.surface = 'grass';
  }

  teleport(x, y, z, yaw = this.yaw) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
  }

  look(input, settings, dt) {
    const s = settings.sensitivity * 0.0022;
    const inv = settings.invertY ? -1 : 1;
    const dx = input.mdx * s, dy = input.mdy * s * inv;
    if (this.mode === 'drive' || this.mode === 'sit') {
      this.lookYaw = clamp(this.lookYaw - dx, -2.2, 2.2);
      this.lookPitch = clamp(this.lookPitch - dy, -1.2, 1.0);
      if (this.mode === 'sit') { this.yaw -= dx; this.pitch = clamp(this.pitch - dy, -1.5, 1.5); }
    } else {
      this.yaw -= dx;
      this.pitch = clamp(this.pitch - dy, -1.53, 1.53);
    }
  }

  update(dt, input, settings) {
    const game = this.game;
    this.time += dt;
    this.look(input, settings, dt);
    if (this.mode !== 'walk') return;
    const C = game.colliders;
    const T = game.terrain;
    const S = game.survival;
    const drunk = S.drunk;

    this.crouch = input.isDown('KeyC') || input.isDown('ControlLeft');
    const targetH = this.crouch ? 1.2 : 1.78;
    this.height = damp(this.height, targetH, 12, dt);
    this.eye = this.height - 0.14;

    let f = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
    let r = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    const moving = f !== 0 || r !== 0;
    this.sprinting = input.isDown('ShiftLeft') && f > 0 && !this.crouch && S.fatigue < 97;
    let speed = this.crouch ? 1.6 : this.sprinting ? 5.4 : 3.1;
    const carried = game.hands.carried;
    if (carried) speed *= clamp(1 - (carried.mass - 12) / 150, 0.33, 1);
    if (S.fatigue > 90) speed *= 0.72;
    if (this.swimming) speed = input.isDown('ShiftLeft') ? 2.2 : 1.5;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * f + cy * r, wz = -cy * f - sy * r;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx = wx / wl * speed; wz = wz / wl * speed; }
    if (drunk > 0.1) {
      const sway = Math.sin(this.time * 0.9) * Math.min(1.5, drunk) * 0.9 + Math.sin(this.time * 2.3) * drunk * 0.3;
      wx += cy * sway * (moving ? 1 : 0.3); wz += -sy * sway * (moving ? 1 : 0.3);
    }
    const accel = this.onGround || this.swimming ? 11 : 2.2;
    this.vel.x += (wx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wz - this.vel.z) * Math.min(1, accel * dt);

    // water
    const gh = T.heightAt(this.pos.x, this.pos.z);
    const depth = WATER - gh;
    this.swimming = depth > 1.25 && this.pos.y < WATER - 0.9;
    if (this.swimming) {
      const targetY = WATER - 1.45 + (drunk > 1.4 ? -0.6 : 0);
      this.vel.y = (targetY - this.pos.y) * 3;
      if (input.isDown('Space')) this.vel.y += 1;
      S.dirt = Math.max(0, S.dirt - dt * 4);
      S.stress = Math.max(0, S.stress - dt * 0.4);
      if (this.pos.y + this.eye < WATER - 0.05) this.underwater += dt; else this.underwater = Math.max(0, this.underwater - dt * 2);
    } else {
      this.vel.y -= 20 * dt;
      this.underwater = 0;
      if (input.wasPressed('Space') && this.onGround && !carried?.heavy) {
        this.vel.y = 5.2;
        this.onGround = false;
      }
    }
    if (this.underwater > 18) { game.die('drown'); return; }

    this.pos.addScaledVector(this.vel, dt);
    // walls, trees, vehicles
    const stepH = 0.42;
    C.pushCircle(this.pos, this.radius, this.pos.y + stepH, this.pos.y + this.height);
    this.pushVehicles(dt);
    // ground
    const info = {};
    const ground = C.surfaceHeight(this.pos.x, this.pos.z, this.pos.y + stepH, info);
    const wasGround = this.onGround;
    if (this.pos.y <= ground + 0.001) {
      if (!wasGround && this.maxFall > 11) {
        game.audio.play('thud');
        if (this.maxFall > 15) { game.die('fall'); return; }
        this.shake = 0.8;
        S.stress += 8;
      }
      this.pos.y = ground;
      if (this.vel.y < 0) this.vel.y = 0;
      this.onGround = true;
      this.maxFall = 0;
    } else if (wasGround && this.vel.y <= 0 && this.pos.y - ground < 0.3) {
      this.pos.y = ground;  // stick to slopes and stairs going down
      this.vel.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
      if (this.vel.y < 0) this.maxFall = Math.max(this.maxFall, -this.vel.y);
    }
    if (this.swimming) this.onGround = false;
    // ceiling
    const ceil = C.ceilingHeight(this.pos.x, this.pos.z, this.pos.y + 0.9);
    if (this.pos.y + this.height > ceil) { this.pos.y = Math.max(ground, ceil - this.height); if (this.vel.y > 0) this.vel.y = 0; }
    // map edge
    if (Math.abs(this.pos.x) > PLAY_HALF || Math.abs(this.pos.z) > PLAY_HALF) {
      this.pos.x = clamp(this.pos.x, -PLAY_HALF, PLAY_HALF);
      this.pos.z = clamp(this.pos.z, -PLAY_HALF, PLAY_HALF);
      if (!this._edgeMsg) { game.ui.message('The forest is too thick to go further.'); this._edgeMsg = true; }
    } else this._edgeMsg = false;
    if (this.pos.y < gh - 1) this.pos.y = gh;

    // footsteps and bob
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.surface = info.box ? (info.box.mat || 'wood') : T.surfaceAt(this.pos.x, this.pos.z);
    if (this.onGround && hs > 0.4) {
      this.stepAcc += hs * dt;
      this.bobPhase += hs * dt * 2.1;
      const stride = this.sprinting ? 0.95 : this.crouch ? 0.6 : 0.72;
      if (this.stepAcc > stride) { this.stepAcc = 0; game.audio.play('step', { surface: this.surface, vol: this.crouch ? 0.4 : 1 }); }
    } else if (this.swimming && hs > 0.3) {
      this.stepAcc += hs * dt;
      if (this.stepAcc > 1.4) { this.stepAcc = 0; game.audio.play('splash', { vol: 0.25 }); }
    }
    this.bobAmt = damp(this.bobAmt, this.onGround ? Math.min(1, hs / 4) : 0, 8, dt);
    // kick small props
    for (const p of game.props.list) {
      if (p.carried || p.vehicle || p.mass > 6 || p.part && p.part.attached) continue;
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.2 && p.pos.y < this.pos.y + 0.5 && hs > 1) {
        const d = Math.sqrt(d2) || 1;
        p.vel.x += dx / d * hs * 0.6; p.vel.z += dz / d * hs * 0.6; p.vel.y += 1;
        game.props.wake(p);
      }
    }
  }

  pushVehicles() {
    const game = this.game;
    const list = [];
    for (const v of game.vehicles) list.push({ obj: v.body, hx: v.dims.hx, hz: v.dims.hz, y0: v.dims.y0 - 0.3, y1: v.dims.y1, vel: v.vel, q: v.body.quaternion, v });
    if (game.traffic) for (const c of game.traffic.nearby(this.pos, 8)) list.push({ obj: c.mesh, hx: c.half.hx, hz: c.half.hz, y0: 0, y1: 1.5, vel: c.velocity, q: c.q, traffic: c });
    for (const o of list) {
      if (o.obj.position.distanceToSquared(this.pos) > 36) continue;
      o.obj.updateMatrixWorld();
      const l = o.obj.worldToLocal(_v.copy(this.pos));
      if (l.y + this.height < o.y0 || l.y > o.y1) continue;
      const r = this.radius;
      const ox = o.hx + r - Math.abs(l.x), oz = o.hz + r - Math.abs(l.z);
      if (ox <= 0 || oz <= 0) continue;
      // standing on the roof: allow if above
      if (l.y > o.y1 - 0.25) continue;
      const speed = o.vel.length();
      if (speed > 4.5 && this.mode === 'walk') {
        game.die(o.traffic ? 'traffic' : 'runover');
        return;
      }
      if (ox < oz) l.x += Math.sign(l.x || 1) * ox; else l.z += Math.sign(l.z || 1) * oz;
      o.obj.localToWorld(l);
      this.pos.x = l.x; this.pos.z = l.z;
    }
  }

  // Camera placement for every mode.
  updateCamera(camera, dt) {
    const game = this.game;
    const S = game.survival;
    const drunk = S.drunk;
    let roll = 0;
    if (drunk > 0.05) roll = Math.sin(this.time * 0.8) * Math.min(1.5, drunk) * 0.05;
    const shake = this.shake;
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const sx = (Math.random() - 0.5) * shake * 0.05, sy = (Math.random() - 0.5) * shake * 0.05;

    if (this.mode === 'drive' && this.vehicle) {
      const v = this.vehicle;
      if (this.camMode === 'chase') {
        const fwd = v.forward(_v);
        const back = new THREE.Vector3(v.x.x - fwd.x * 6.5, v.x.y + 2.4, v.x.z - fwd.z * 6.5);
        const gh = game.terrain.heightAt(back.x, back.z);
        if (back.y < gh + 0.8) back.y = gh + 0.8;
        if (this.chase.lengthSq() === 0) this.chase.copy(back);
        this.chase.lerp(back, 1 - Math.exp(-6 * dt));
        camera.position.copy(this.chase);
        camera.up.set(0, 1, 0);
        camera.lookAt(v.x.x + fwd.x * 2, v.x.y + 0.9, v.x.z + fwd.z * 2);
        camera.rotateY(this.lookYaw * 0.6);
      } else {
        this.chase.set(0, 0, 0);
        const seat = _v.copy(v.seat).applyMatrix4(v.body.matrixWorld);
        camera.position.copy(seat);
        _e.set(this.lookPitch + sy, this.lookYaw + sx, roll, 'YXZ');
        _q.setFromEuler(_e);
        camera.quaternion.copy(v.body.quaternion).multiply(_q);
        // road vibration
        if (v.speed > 1) camera.position.y += (Math.random() - 0.5) * Math.min(0.01, v.speed * 0.0004);
      }
      return;
    }
    if (this.mode === 'sit' && this.sitPos) {
      camera.position.copy(this.sitPos);
      camera.rotation.set(this.pitch + sy, this.yaw + sx, roll, 'YXZ');
      return;
    }
    if (this.mode === 'sleep') {
      return;
    }
    const bob = Math.sin(this.bobPhase * Math.PI) * 0.04 * this.bobAmt;
    const sway = Math.cos(this.bobPhase * Math.PI * 0.5) * 0.025 * this.bobAmt;
    camera.position.set(
      this.pos.x + Math.cos(this.yaw) * sway,
      this.pos.y + this.eye + bob,
      this.pos.z - Math.sin(this.yaw) * sway,
    );
    camera.rotation.set(this.pitch + sy, this.yaw + sx + (drunk > 0.1 ? Math.sin(this.time * 0.5) * drunk * 0.02 : 0), roll, 'YXZ');
  }

  eyePos(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.eye, this.pos.z); }
}
