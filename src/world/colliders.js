import * as THREE from 'three';

// Static world collision: yaw-rotated boxes and tree trunks, bucketed in a grid.
const CELL = 8;
const key = (ix, iz) => (ix + 2048) * 4096 + (iz + 2048);

export class Colliders {
  constructor(terrain) {
    this.terrain = terrain;
    this.boxes = [];
    this.grid = new Map();
    this.treeGrid = new Map();
    this.dynamic = []; // objects with getOBB() (vehicles)
  }

  addBox(b) {
    const box = {
      x: b.x, y: b.y, z: b.z, hx: b.hx, hy: b.hy, hz: b.hz,
      rot: b.rot || 0, c: Math.cos(b.rot || 0), s: Math.sin(b.rot || 0),
      enabled: b.enabled !== false, tag: b.tag || '', walkable: b.walkable !== false,
      mat: b.mat || 'wood', cells: [],
    };
    this.boxes.push(box);
    this.insert(box);
    return box;
  }

  insert(box) {
    const r = Math.hypot(box.hx, box.hz);
    const ix0 = Math.floor((box.x - r) / CELL), ix1 = Math.floor((box.x + r) / CELL);
    const iz0 = Math.floor((box.z - r) / CELL), iz1 = Math.floor((box.z + r) / CELL);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const k = key(ix, iz);
      let arr = this.grid.get(k);
      if (!arr) { arr = []; this.grid.set(k, arr); }
      arr.push(box);
      box.cells.push(k);
    }
  }

  removeBox(box) {
    for (const k of box.cells) {
      const arr = this.grid.get(k);
      if (arr) { const i = arr.indexOf(box); if (i >= 0) arr.splice(i, 1); }
    }
    box.cells.length = 0;
    const i = this.boxes.indexOf(box); if (i >= 0) this.boxes.splice(i, 1);
  }

  moveBox(box, x, y, z, rot) {
    for (const k of box.cells) {
      const arr = this.grid.get(k);
      if (arr) { const i = arr.indexOf(box); if (i >= 0) arr.splice(i, 1); }
    }
    box.cells.length = 0;
    box.x = x; box.y = y; box.z = z; box.rot = rot; box.c = Math.cos(rot); box.s = Math.sin(rot);
    this.insert(box);
  }

  addTree(x, z, r, h, y0) {
    const k = key(Math.floor(x / CELL), Math.floor(z / CELL));
    let arr = this.treeGrid.get(k);
    if (!arr) { arr = []; this.treeGrid.set(k, arr); }
    arr.push({ x, z, r, y0, y1: y0 + h });
  }

  near(x, z, radius, out = []) {
    out.length = 0;
    const ix0 = Math.floor((x - radius) / CELL), ix1 = Math.floor((x + radius) / CELL);
    const iz0 = Math.floor((z - radius) / CELL), iz1 = Math.floor((z + radius) / CELL);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const arr = this.grid.get(key(ix, iz));
      if (!arr) continue;
      for (const b of arr) if (b.enabled && out.indexOf(b) < 0) out.push(b);
    }
    return out;
  }

  nearTrees(x, z, radius, out = []) {
    out.length = 0;
    const ix0 = Math.floor((x - radius) / CELL), ix1 = Math.floor((x + radius) / CELL);
    const iz0 = Math.floor((z - radius) / CELL), iz1 = Math.floor((z + radius) / CELL);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const arr = this.treeGrid.get(key(ix, iz));
      if (arr) for (const t of arr) out.push(t);
    }
    return out;
  }

  // local coordinates of (x,z) in box space
  toLocal(b, x, z) {
    const dx = x - b.x, dz = z - b.z;
    return [b.c * dx - b.s * dz, b.s * dx + b.c * dz];
  }

  toWorldDir(b, lx, lz) {
    return [b.c * lx + b.s * lz, -b.s * lx + b.c * lz];
  }

  // Highest walkable surface at (x,z) not above maxY (terrain or box top).
  surfaceHeight(x, z, maxY, info = null) {
    let h = this.terrain.heightAt(x, z);
    let hit = null;
    const list = this.near(x, z, 0.5, this._tmp || (this._tmp = []));
    for (const b of list) {
      if (!b.walkable) continue;
      const top = b.y + b.hy;
      if (top > h && top <= maxY) {
        const [lx, lz] = this.toLocal(b, x, z);
        if (Math.abs(lx) <= b.hx && Math.abs(lz) <= b.hz) { h = top; hit = b; }
      }
    }
    if (info) { info.box = hit; }
    return h;
  }

  // Lowest box bottom above y at (x,z) (for ceilings).
  ceilingHeight(x, z, y) {
    let c = Infinity;
    const list = this.near(x, z, 0.5, this._tmp2 || (this._tmp2 = []));
    for (const b of list) {
      const bot = b.y - b.hy;
      if (bot >= y && bot < c) {
        const [lx, lz] = this.toLocal(b, x, z);
        if (Math.abs(lx) <= b.hx && Math.abs(lz) <= b.hz) c = bot;
      }
    }
    return c;
  }

  // Push a vertical cylinder out of boxes and trunks. Mutates pos (Vector3). Returns true if hit.
  pushCircle(pos, r, yMin, yMax, ignoreTrees = false) {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const list = this.near(pos.x, pos.z, r + 0.5, this._tmp3 || (this._tmp3 = []));
      for (const b of list) {
        if (b.y - b.hy >= yMax || b.y + b.hy <= yMin) continue;
        const [lx, lz] = this.toLocal(b, pos.x, pos.z);
        const cx = Math.max(-b.hx, Math.min(b.hx, lx));
        const cz = Math.max(-b.hz, Math.min(b.hz, lz));
        let dx = lx - cx, dz = lz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let px, pz;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          px = (dx / d) * (r - d); pz = (dz / d) * (r - d);
        } else {
          // centre inside: push along the shallowest axis
          const ox = b.hx - Math.abs(lx), oz = b.hz - Math.abs(lz);
          if (ox < oz) { px = Math.sign(lx || 1) * (ox + r); pz = 0; } else { px = 0; pz = Math.sign(lz || 1) * (oz + r); }
        }
        const [wx, wz] = this.toWorldDir(b, px, pz);
        pos.x += wx; pos.z += wz;
        moved = true; hit = true;
      }
      if (!ignoreTrees) {
        const trees = this.nearTrees(pos.x, pos.z, r + 1, this._tmp4 || (this._tmp4 = []));
        for (const t of trees) {
          if (t.y0 >= yMax || t.y1 <= yMin) continue;
          const dx = pos.x - t.x, dz = pos.z - t.z;
          const d = Math.hypot(dx, dz);
          const rr = r + t.r;
          if (d < rr && d > 1e-6) {
            pos.x += (dx / d) * (rr - d); pos.z += (dz / d) * (rr - d);
            moved = true; hit = true;
          }
        }
      }
      if (!moved) break;
    }
    return hit;
  }

  // Is a world point inside any box? returns {box, nx, nz, ny, depth} for the shallowest exit.
  pointContact(x, y, z, out) {
    const list = this.near(x, z, 0.5, this._tmp5 || (this._tmp5 = []));
    let best = null;
    for (const b of list) {
      const ly = y - b.y;
      if (Math.abs(ly) > b.hy) continue;
      const [lx, lz] = this.toLocal(b, x, z);
      if (Math.abs(lx) > b.hx || Math.abs(lz) > b.hz) continue;
      const ox = b.hx - Math.abs(lx), oy = b.hy - Math.abs(ly), oz = b.hz - Math.abs(lz);
      let depth, nlx = 0, nly = 0, nlz = 0;
      if (oy < ox && oy < oz) { depth = oy; nly = Math.sign(ly || 1); }
      else if (ox < oz) { depth = ox; nlx = Math.sign(lx || 1); }
      else { depth = oz; nlz = Math.sign(lz || 1); }
      if (!best || depth < best.depth) {
        const [wx, wz] = this.toWorldDir(b, nlx, nlz);
        best = { box: b, nx: wx, ny: nly, nz: wz, depth };
      }
    }
    if (best && out) Object.assign(out, best);
    return best;
  }

  treeContact(x, y, z) {
    const trees = this.nearTrees(x, z, 1, this._tmp6 || (this._tmp6 = []));
    for (const t of trees) {
      if (y < t.y0 || y > t.y1) continue;
      const dx = x - t.x, dz = z - t.z;
      const d = Math.hypot(dx, dz);
      if (d < t.r) return { nx: dx / (d || 1), ny: 0, nz: dz / (d || 1), depth: t.r - d, tree: t };
    }
    return null;
  }

  // Ray against boxes (and optionally terrain). Returns distance or Infinity.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, withTerrain = true, tag = null) {
    let best = maxDist;
    const midx = ox + dx * maxDist * 0.5, midz = oz + dz * maxDist * 0.5;
    const list = this.near(midx, midz, maxDist * 0.5 + 1, this._tmp7 || (this._tmp7 = []));
    for (const b of list) {
      if (tag && b.tag !== tag) continue;
      // transform ray into box space
      const rx = ox - b.x, rz = oz - b.z;
      const lox = b.c * rx - b.s * rz, loz = b.s * rx + b.c * rz, loy = oy - b.y;
      const ldx = b.c * dx - b.s * dz, ldz = b.s * dx + b.c * dz, ldy = dy;
      let tmin = 0, tmax = best;
      let ok = true;
      for (const [o, d, h] of [[lox, ldx, b.hx], [loy, ldy, b.hy], [loz, ldz, b.hz]]) {
        if (Math.abs(d) < 1e-9) { if (o < -h || o > h) { ok = false; break; } }
        else {
          let t1 = (-h - o) / d, t2 = (h - o) / d;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
          if (t1 > tmin) tmin = t1;
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) { ok = false; break; }
        }
      }
      if (ok && tmin < best && tmin >= 0) best = tmin;
    }
    if (withTerrain) {
      const step = 0.25;
      for (let t = 0; t < best; t += step) {
        const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
        if (y < this.terrain.heightAt(x, z)) { best = Math.max(0, t - step * 0.5); break; }
      }
    }
    return best;
  }
}

export const tmpV = new THREE.Vector3();
