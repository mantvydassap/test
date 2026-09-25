import * as THREE from 'three';

// A few real lights are shared among many lamps: each frame the nearest lit
// lamps borrow them. Keeps shader light counts fixed (no recompiles, fast).
export class LightPool {
  constructor(scene, nPoint = 3, nSpot = 2) {
    this.points = [];
    for (let i = 0; i < nPoint; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 1.6);
      l.castShadow = false;
      scene.add(l);
      this.points.push(l);
    }
    this.spots = [];
    for (let i = 0; i < nSpot; i++) {
      const s = new THREE.SpotLight(0xfff0d0, 0, 70, 0.42, 0.45, 1.3);
      s.castShadow = false;
      scene.add(s); scene.add(s.target);
      this.spots.push(s);
    }
    this.sources = [];
    this._p = new THREE.Vector3();
  }

  // obj: an Object3D whose world position is the lamp
  add(obj, color, intensity, distance) {
    const src = { obj, color: new THREE.Color(color), intensity, distance, isLight: true, world: new THREE.Vector3() };
    this.sources.push(src);
    return src;
  }

  update(camPos, headlightCar) {
    const act = [];
    for (const s of this.sources) {
      if (s.intensity <= 0.01) continue;
      s.obj.getWorldPosition(s.world);
      const d = s.world.distanceToSquared(camPos);
      if (d > 60 * 60) continue;
      act.push([d, s]);
    }
    act.sort((a, b) => a[0] - b[0]);
    this.points.forEach((l, i) => {
      const e = act[i];
      if (!e) { l.intensity = 0; return; }
      const s = e[1];
      l.position.copy(s.world);
      l.color.copy(s.color);
      l.intensity = s.intensity;
      l.distance = s.distance;
    });
    // headlights of one car
    const v = headlightCar;
    this.spots.forEach((sp, i) => {
      if (!v || !v.headlightPos || !v.headlightPos[i]) { sp.intensity = 0; return; }
      sp.intensity = 45;
      sp.position.copy(v.headlightPos[i]).applyMatrix4(v.body.matrixWorld);
      this._p.set(v.headlightPos[i].x * 1.6, v.headlightPos[i].y - 1.4, v.headlightPos[i].z - 14).applyMatrix4(v.body.matrixWorld);
      sp.target.position.copy(this._p);
      sp.target.updateMatrixWorld();
    });
  }
}
