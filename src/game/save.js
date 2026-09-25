import * as THREE from 'three';

const SAVE_KEY = 'midsummer-motors:save';

export function saveSummary() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return `day ${d.survival.day}, ${Math.floor(d.survival.hours)}:${String(Math.floor((d.survival.hours % 1) * 60)).padStart(2, '0')}`;
  } catch (e) { return null; }
}

export function loadGame() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
}

const vec = (v) => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
const quat = (q) => [+q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4), +q.w.toFixed(4)];

// The game saves into this browser's localStorage only.
export function saveGame(game) {
  const p = game.player;
  const data = {
    v: 1, t: Date.now(),
    survival: game.survival.serialize(),
    player: { pos: vec(p.mode === 'drive' && p.vehicle ? p.vehicle.body.localToWorld(p.vehicle.exitSide.clone()) : p.pos), yaw: p.yaw },
    vehicles: game.vehicles.map((v) => ({
      id: v.id, pos: vec(v.body.position), q: quat(v.body.quaternion),
      fuel: v.engine.fuel, battery: v.engine.battery, rear: !!v.rearDoorsOpen,
    })),
    project: game.project.serialize(),
    props: game.props.list.filter((pr) => !pr.part || !pr.part.attached).map((pr) => ({
      type: pr.type, id: pr.id, pos: vec(pr.pos), q: quat(pr.quat), data: pr.data,
      veh: pr.vehicle ? pr.vehicle.id : null, local: pr.vehicle ? vec(pr.local) : null, lq: pr.vehicle ? quat(pr.localQuat) : null,
    })),
    home: {
      wood: game.home.woodStack.count, lights: game.home.lightsOn, garage: game.home.garageLight.on,
      sauna: { temp: game.home.sauna.temp, lit: game.home.sauna.lit, fire: game.home.sauna.fire },
    },
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}

export function applySave(game, d) {
  game.survival.restore(d.survival);
  const pc = game.project;
  pc.restore(d.project);
  for (const vs of d.vehicles) {
    const v = game.vehicles.find((x) => x.id === vs.id);
    if (!v) continue;
    if (v === pc.v && d.project.onStands) { pc.placeOnStands(); }
    else {
      if (v === pc.v) { pc.onStands = false; v.fixed = false; for (const s of pc.stands) s.visible = false; }
      v.q.set(vs.q[0], vs.q[1], vs.q[2], vs.q[3]);
      v.body.position.set(vs.pos[0], vs.pos[1] + 0.05, vs.pos[2]);
      v.x.copy(v.com).applyQuaternion(v.q).add(v.body.position);
      v.body.updateMatrixWorld(true);
      v.vel.set(0, 0, 0); v.angVel.set(0, 0, 0);
    }
    v.engine.fuel = vs.fuel;
    v.engine.battery = vs.battery;
    if (vs.rear && v.toggleRear && !v.rearDoorsOpen) v.toggleRear();
  }
  for (const s of d.props) {
    let prop;
    if (s.type.startsWith('part:')) {
      const id = s.type.slice(5);
      if (pc.parts[id].attached) continue;
      prop = pc.spawnPartProp(id, new THREE.Vector3(...s.pos), 0, { propId: s.id });
    } else {
      prop = game.props.spawn(s.type, new THREE.Vector3(...s.pos), { contents: s.data?.contents, amount: s.data?.amount, portions: s.data?.portions });
    }
    prop.quat.set(s.q[0], s.q[1], s.q[2], s.q[3]);
    Object.assign(prop.data, s.data || {});
    if (s.veh) {
      const v = game.vehicles.find((x) => x.id === s.veh);
      if (v) {
        prop.vehicle = v;
        prop.local.set(...s.local);
        prop.localQuat.set(s.lq[0], s.lq[1], s.lq[2], s.lq[3]);
        prop.asleep = true;
        v.cargo.push(prop);
      }
    }
  }
  const h = game.home;
  h.woodStack.count = d.home.wood || 0;
  game.actions.updateWoodStack();
  h.lightsOn = !!d.home.lights;
  if (d.home.garage) game.actions.toggleGarageLight();
  Object.assign(h.sauna, d.home.sauna || {});
  game.player.teleport(d.player.pos[0], d.player.pos[1] + 0.05, d.player.pos[2], d.player.yaw);
}
