import * as THREE from 'three';
import { smokeTexture } from '../core/textures.js';

// Dust kicked up behind cars on gravel and dirt.
export class Dust {
  constructor(scene, n = 90) {
    this.parts = [];
    const base = new THREE.SpriteMaterial({ map: smokeTexture(), color: 0xc9b894, transparent: true, depthWrite: false, opacity: 0 });
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(base.clone());
      s.visible = false;
      scene.add(s);
      this.parts.push({ s, t: 1, life: 1, vel: new THREE.Vector3(), size: 1, a: 0 });
    }
    this.i = 0;
    this.acc = new Map();
    this._v = new THREE.Vector3();
  }

  emit(pos, vel, strength) {
    const p = this.parts[this.i++ % this.parts.length];
    p.s.position.copy(pos); p.s.position.y += 0.25;
    p.vel.copy(vel).multiplyScalar(0.15).add(this._v.set((Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8));
    p.t = 0; p.life = 1.8 + Math.random() * 1.8; p.size = 1.0 + Math.random() * 0.8; p.a = 0.5 * strength;
    p.s.visible = true;
  }

  update(dt, vehicles) {
    for (const v of vehicles) {
      if (v.fixed || v.speed < 3) continue;
      for (const w of v.wheels) {
        if (!w.present || !w.contact || !w.rear) continue;
        if (!['gravel', 'sand', 'field', 'grass'].includes(w.surface)) continue;
        const k = v.id + w.i;
        const rate = (w.surface === 'grass' ? 3 : 10) * Math.min(1, v.speed / 18);
        const a = (this.acc.get(k) || 0) + rate * dt;
        let n = Math.floor(a);
        this.acc.set(k, a - n);
        while (n-- > 0) this.emit(w.contactPt, v.vel, w.surface === 'grass' ? 0.5 : 1);
      }
    }
    for (const p of this.parts) {
      if (!p.s.visible) continue;
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) { p.s.visible = false; continue; }
      p.s.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - 0.8 * dt);
      p.s.scale.setScalar(p.size * (1 + k * 4));
      p.s.material.opacity = p.a * (1 - k) * Math.min(1, k * 8);
    }
  }
}
