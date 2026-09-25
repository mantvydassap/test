import * as THREE from 'three';

// Finds what the crosshair points at: registered objects, loose props, car parts and bolts.
export class Interact {
  constructor(game) {
    this.game = game;
    this.static = [];
    this.raycaster = new THREE.Raycaster();
    this.hit = null;
    this._wp = new THREE.Vector3();
    this._cands = [];
  }

  add(mesh, target) {
    mesh.userData.target = target;
    this.static.push(mesh);
    mesh.updateWorldMatrix(true, false);
    mesh.userData._wp = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
  }

  remove(mesh) {
    const i = this.static.indexOf(mesh);
    if (i >= 0) this.static.splice(i, 1);
  }

  // extra: array of Object3D (props, parts, bolts) already filtered by the caller
  update(camera, range, extra, filter = null) {
    const cp = camera.position;
    const cands = this._cands;
    cands.length = 0;
    for (const m of this.static) {
      const wp = m.userData._wp;
      if (!wp || wp.distanceToSquared(cp) < 49) {
        if (m.visible !== false) cands.push(m);
      }
    }
    for (const o of extra) cands.push(o);
    const dir = this._wp.set(0, 0, -1).applyQuaternion(camera.quaternion);
    this.raycaster.set(cp, dir);
    this.raycaster.far = range;
    this.raycaster.near = 0;
    const hits = this.raycaster.intersectObjects(cands, true);
    const wall = this.game.colliders.raycast(cp.x, cp.y, cp.z, dir.x, dir.y, dir.z, range, false, 'wall');
    this.hit = null;
    for (const h of hits) {
      if (h.distance > wall + 0.12) break;
      let o = h.object;
      let info = null;
      while (o) {
        const u = o.userData;
        if (u.bolt) { info = { kind: 'bolt', bolt: u.bolt, object: o }; break; }
        if (u.part) { info = { kind: 'part', part: u.part, object: o }; break; }
        if (u.prop) { info = { kind: 'prop', prop: u.prop, object: o }; break; }
        if (u.vehicle) { info = { kind: 'vehicle', vehicle: u.vehicle, object: o, zone: u.zone }; break; }
        if (u.target) { info = { kind: 'target', target: u.target, object: o }; break; }
        o = o.parent;
      }
      if (!info) continue;
      if (filter && !filter(info)) continue;
      info.point = h.point;
      info.distance = h.distance;
      this.hit = info;
      break;
    }
    return this.hit;
  }
}
