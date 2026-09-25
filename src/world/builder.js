import * as THREE from 'three';
import { boxGeo } from '../core/geo.js';
import { materials } from './materials.js';

// Places boxes in a building's local frame and registers matching colliders.
export class Builder {
  constructor(game, x, y, z, rotY = 0, name = 'building') {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = name;
    this.group.position.set(x, y, z);
    this.group.rotation.y = rotY;
    game.scene.add(this.group);
    this.ox = x; this.oy = y; this.oz = z;
    this.rot = rotY;
    this.c = Math.cos(rotY); this.s = Math.sin(rotY);
    this.M = materials();
    this.colliderBoxes = [];
  }

  toWorld(lx, ly, lz, out = new THREE.Vector3()) {
    return out.set(this.ox + this.c * lx + this.s * lz, this.oy + ly, this.oz - this.s * lx + this.c * lz);
  }

  toLocal(wx, wz) {
    const dx = wx - this.ox, dz = wz - this.oz;
    return [this.c * dx - this.s * dz, this.s * dx + this.c * dz];
  }

  collider(w, h, d, x, y, z, rot = 0, opts = {}) {
    const p = this.toWorld(x, y, z);
    const b = this.game.colliders.addBox({ x: p.x, y: p.y, z: p.z, hx: w / 2, hy: h / 2, hz: d / 2, rot: this.rot + rot, ...opts });
    this.colliderBoxes.push(b);
    return b;
  }

  box(w, h, d, mat, x, y, z, opts = {}) {
    const geo = boxGeo(w, h, d, opts.tex ?? 1.5);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    if (opts.rot) mesh.rotation.y = opts.rot;
    if (opts.rotX) mesh.rotation.x = opts.rotX;
    if (opts.rotZ) mesh.rotation.z = opts.rotZ;
    mesh.castShadow = opts.cast !== false;
    mesh.receiveShadow = opts.receive !== false;
    (opts.parent || this.group).add(mesh);
    if (opts.collide !== false && !opts.rotX && !opts.rotZ) {
      mesh.userData.collider = this.collider(w, h, d, x, y, z, opts.rot || 0, { walkable: opts.walkable, mat: opts.surface });
    }
    return mesh;
  }

  mesh(geo, mat, x, y, z, opts = {}) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    if (opts.rot) mesh.rotation.y = opts.rot;
    if (opts.rotX) mesh.rotation.x = opts.rotX;
    if (opts.rotZ) mesh.rotation.z = opts.rotZ;
    if (opts.scale) mesh.scale.setScalar(opts.scale);
    mesh.castShadow = opts.cast !== false;
    mesh.receiveShadow = opts.receive !== false;
    (opts.parent || this.group).add(mesh);
    return mesh;
  }

  // Wall running along local X at depth z. outer: +1 if +z face is the exterior, -1 if -z, 0 interior both sides.
  wallX(x0, x1, z, y0, h, t, openings, outerMat, innerMat, outer = 1, glassMat = null) {
    const mats = (ext) => {
      const o = ext ? outerMat : innerMat;
      const i = innerMat;
      // px, nx, py, ny, pz, nz
      if (outer > 0) return [o, o, o, o, o, i];
      if (outer < 0) return [o, o, o, o, i, o];
      return [i, i, i, i, i, i];
    };
    const seg = (a, b, ya, yb) => {
      if (b - a < 0.01 || yb - ya < 0.01) return;
      const w = b - a, hh = yb - ya;
      const geo = boxGeo(w, hh, t, 1.5);
      const m = new THREE.Mesh(geo, mats(true));
      m.position.set((a + b) / 2, y0 + (ya + yb) / 2, z);
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
      this.collider(w, hh, t, (a + b) / 2, y0 + (ya + yb) / 2, z, 0, { tag: 'wall' });
    };
    const ops = (openings || []).slice().sort((p, q) => p.a - q.a);
    let cur = x0;
    for (const o of ops) {
      seg(cur, o.a, 0, h);
      if (o.y0 > 0) seg(o.a, o.b, 0, o.y0);
      if (o.y1 < h) seg(o.a, o.b, o.y1, h);
      if (o.window) this.windowPane((o.a + o.b) / 2, y0 + (o.y0 + o.y1) / 2, z, o.b - o.a, o.y1 - o.y0, 'x', t, glassMat);
      cur = o.b;
    }
    seg(cur, x1, 0, h);
  }

  // Wall running along local Z at x. outer: +1 if +x face is exterior.
  wallZ(z0, z1, x, y0, h, t, openings, outerMat, innerMat, outer = 1, glassMat = null) {
    const mats = () => {
      const o = outerMat, i = innerMat;
      if (outer > 0) return [o, i, o, o, o, o];
      if (outer < 0) return [i, o, o, o, o, o];
      return [i, i, i, i, i, i];
    };
    const seg = (a, b, ya, yb) => {
      if (b - a < 0.01 || yb - ya < 0.01) return;
      const d = b - a, hh = yb - ya;
      const geo = boxGeo(t, hh, d, 1.5);
      const m = new THREE.Mesh(geo, mats());
      m.position.set(x, y0 + (ya + yb) / 2, (a + b) / 2);
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
      this.collider(t, hh, d, x, y0 + (ya + yb) / 2, (a + b) / 2, 0, { tag: 'wall' });
    };
    const ops = (openings || []).slice().sort((p, q) => p.a - q.a);
    let cur = z0;
    for (const o of ops) {
      seg(cur, o.a, 0, h);
      if (o.y0 > 0) seg(o.a, o.b, 0, o.y0);
      if (o.y1 < h) seg(o.a, o.b, o.y1, h);
      if (o.window) this.windowPane(x, y0 + (o.y0 + o.y1) / 2, (o.a + o.b) / 2, o.b - o.a, o.y1 - o.y0, 'z', t, glassMat);
      cur = o.b;
    }
    seg(cur, z1, 0, h);
  }

  windowPane(x, y, z, w, h, axis, t, glassMat) {
    const M = this.M;
    const g = glassMat || M.glass;
    const fr = 0.07;
    if (axis === 'x') {
      this.box(w, h, 0.03, g, x, y, z, { cast: false, tex: 10 });
      this.box(w + fr * 2, fr, t + 0.06, M.trim, x, y + h / 2 + fr / 2, z, { collide: false });
      this.box(w + fr * 2, fr, t + 0.1, M.trim, x, y - h / 2 - fr / 2, z, { collide: false });
      this.box(fr, h, t + 0.06, M.trim, x - w / 2 - fr / 2, y, z, { collide: false });
      this.box(fr, h, t + 0.06, M.trim, x + w / 2 + fr / 2, y, z, { collide: false });
      this.box(0.04, h, t * 0.5, M.trim, x, y, z, { collide: false });
    } else {
      this.box(0.03, h, w, g, x, y, z, { cast: false, tex: 10 });
      this.box(t + 0.06, fr, w + fr * 2, M.trim, x, y + h / 2 + fr / 2, z, { collide: false });
      this.box(t + 0.1, fr, w + fr * 2, M.trim, x, y - h / 2 - fr / 2, z, { collide: false });
      this.box(t + 0.06, h, fr, M.trim, x, y, z - w / 2 - fr / 2, { collide: false });
      this.box(t + 0.06, h, fr, M.trim, x, y, z + w / 2 + fr / 2, { collide: false });
      this.box(t * 0.5, h, 0.04, M.trim, x, y, z, { collide: false });
    }
  }

  // Gable roof with the ridge along local X.
  gableRoofX(hx, hz, top, rise, over, roofMat, gableMat) {
    const slopeLen = Math.hypot(hz + over, rise * (hz + over) / hz);
    const ang = Math.atan2(rise, hz);
    for (const side of [-1, 1]) {
      const geo = boxGeo(hx * 2 + over * 2, 0.1, slopeLen, 1.2);
      const m = new THREE.Mesh(geo, roofMat);
      const zc = side * (hz + over) / 2;
      const yc = top + rise - (rise * (hz + over) / hz) / 2 + 0.06;
      m.position.set(0, yc, zc);
      m.rotation.x = side * ang;
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }
    const shape = new THREE.Shape();
    shape.moveTo(-hz, 0); shape.lineTo(hz, 0); shape.lineTo(0, rise); shape.closePath();
    for (const side of [-1, 1]) {
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
      g.rotateY(Math.PI / 2);
      const m = new THREE.Mesh(g, gableMat);
      m.position.set(side * hx - 0.06, top, 0);
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }
    // ridge cap
    this.box(hx * 2 + over * 2, 0.08, 0.3, roofMat, 0, top + rise + 0.05, 0, { collide: false });
  }

  // Gable roof with the ridge along local Z.
  gableRoofZ(hx, hz, top, rise, over, roofMat, gableMat) {
    const slopeLen = Math.hypot(hx + over, rise * (hx + over) / hx);
    const ang = Math.atan2(rise, hx);
    for (const side of [-1, 1]) {
      const geo = boxGeo(slopeLen, 0.1, hz * 2 + over * 2, 1.2);
      const m = new THREE.Mesh(geo, roofMat);
      const xc = side * (hx + over) / 2;
      const yc = top + rise - (rise * (hx + over) / hx) / 2 + 0.06;
      m.position.set(xc, yc, 0);
      m.rotation.z = -side * ang;
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }
    const shape = new THREE.Shape();
    shape.moveTo(-hx, 0); shape.lineTo(hx, 0); shape.lineTo(0, rise); shape.closePath();
    for (const side of [-1, 1]) {
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
      const m = new THREE.Mesh(g, gableMat);
      m.position.set(0, top, side * hz - 0.06);
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }
    this.box(0.3, 0.08, hz * 2 + over * 2, roofMat, 0, top + rise + 0.05, 0, { collide: false });
  }

  // Register an interactive mesh; target is {name, hint(game), use(game), ...}
  interact(mesh, target) {
    this.game.interact.add(mesh, target);
    return mesh;
  }

  // Invisible box used only as an interaction hit area.
  hitBox(w, h, d, x, y, z, target) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.set(x, y, z);
    this.group.add(m);
    this.interact(m, target);
    return m;
  }

  // A lamp position; the shared LightPool lends it a real light when it is near and on.
  pointLight(x, y, z, color = 0xffd9a0, intensity = 6, dist = 9) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    this.group.add(o);
    return this.game.lights.add(o, color, intensity, dist);
  }
}
