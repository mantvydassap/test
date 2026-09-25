import * as THREE from 'three';
import { fmtMoney, clamp } from '../core/math.js';
import { smokeTexture } from '../core/textures.js';

const FUEL_PRICE = 1.95;
const WOOD_PRICE = 4.5;

// Interactions with the house, sauna, woodshed, pumps and phone.
export class Actions {
  constructor(game) {
    this.game = game;
    this.charging = false;
    this.chopSwings = 0;
    this.steam = [];
    this.buildSteam();
  }

  get home() { return this.game.home; }
  get S() { return this.game.survival; }

  // --- kitchen & bathroom
  drinkTap() {
    const g = this.game;
    if (this.S.thirst < 3) { g.ui.message('You are not thirsty.'); return; }
    this.S.apply({ thirst: -20, urine: 6 });
    g.audio.play('drink');
    g.survival.advance(1 / 60);
  }

  shower() {
    const g = this.game;
    g.fade(1.2, () => {
      this.S.dirt = 0;
      this.S.apply({ stress: -8, fatigue: -4 });
      g.survival.advance(0.25);
      g.ui.message('Clean. The water heater clanked the whole time.');
    });
    g.audio.loop('shower', 0.3);
    setTimeout(() => g.audio.loop('shower', 0), 1600);
  }

  toilet() {
    const g = this.game;
    if (this.S.urine < 5) { g.ui.message('You don\'t need to go.'); return; }
    g.audio.loop('pee', 0.2);
    setTimeout(() => { g.audio.loop('pee', 0); g.audio.loop('tap', 0.3); setTimeout(() => g.audio.loop('tap', 0), 900); }, 1200);
    this.S.urine = 0;
    this.S.apply({ stress: -3 });
    g.survival.advance(3 / 60);
  }

  sleepHint() {
    if (this.S.fatigue < 18) return null;
    return 'Sleep';
  }

  sleep(passOut = false) {
    const g = this.game;
    if (!passOut && this.S.fatigue < 18) { g.ui.message('You are not tired enough to sleep.'); return; }
    const hours = passOut ? 6 : clamp(this.S.fatigue / 11 + 1, 2, 10);
    g.player.mode = 'sleep';
    g.audio.play('snore');
    g.fade(2.4, () => {
      const steps = Math.ceil(hours * 4);
      for (let i = 0; i < steps; i++) g.survival.advance(hours / steps, { sleeping: true });
      this.S.fatigue = passOut ? 35 : 0;
      this.S.apply({ stress: passOut ? 10 : -18 });
      this.S.drunk = Math.max(0, this.S.drunk - 1);
      if (!passOut) g.player.mode = 'walk';
      else { g.player.mode = 'walk'; }
      g.sky.update(g.survival.hours, g.player.pos, 0, true);
      const h = Math.round(hours);
      g.ui.message(passOut ? 'You passed out and woke up on the ground.' : `You slept ${h} hours. It is ${g.survival.clockText()}.`, 4);
      if (!passOut) g.saveGame(true);
    }, 1.2);
  }

  // --- coffee
  coffeePack() {
    const cm = this.home.coffeeMaker;
    const p = new THREE.Vector3();
    cm.getWorldPosition(p);
    return this.game.props.list.find((q) => q.type === 'coffee' && !q.carried && q.pos.distanceTo(p) < 3 && (q.data.portions ?? 0) > 0);
  }

  coffeeHint() {
    return this.coffeePack() ? 'Brew and drink coffee' : null;
  }

  makeCoffee() {
    const g = this.game;
    const pack = this.coffeePack();
    if (!pack) { g.ui.message('No coffee. Put a pack of coffee next to the machine.'); return; }
    pack.data.portions--;
    g.audio.loop('tap', 0.2);
    setTimeout(() => g.audio.loop('tap', 0), 1200);
    g.fade(0.8, () => {
      this.S.apply({ fatigue: -26, stress: -4, thirst: -6, urine: 6 });
      g.survival.advance(10 / 60);
      g.audio.play('drink');
      g.ui.message(`Strong, black, Finnish. ${pack.data.portions} cups left in the pack.`);
    });
  }

  // --- lights, radio
  toggleHouseLights() {
    const h = this.home;
    h.lightsOn = !h.lightsOn;
    this.game.audio.play('switch');
    this.applyHouseLights();
  }

  applyHouseLights() {
    const h = this.home;
    for (const l of h.lights) {
      if (l.isLight) l.intensity = h.lightsOn ? 5 : 0;
      else if (l.bulb) l.bulb.material.emissiveIntensity = h.lightsOn ? 2 : 0;
    }
    h.windowMat.emissiveIntensity = h.lightsOn ? 0.9 : 0;
  }

  toggleGarageLight() {
    const gl = this.home.garageLight;
    gl.on = !gl.on;
    gl.light.intensity = gl.on ? 14 : 0;
    gl.glow.emissiveIntensity = gl.on ? 2.5 : 0;
    this.game.audio.play('switch');
  }

  toggleRadio(radio) {
    const g = this.game;
    radio.on = !radio.on;
    g.audio.play('switch');
    if (radio.on) {
      radio.player = g.audio.startRadio(radio.pos);
      g.ui.message('Yleisradio plays humppa. Of course it does.', 3);
    } else if (radio.player) { radio.player.stop(); radio.player = null; }
  }

  // --- phone
  openPhone() {
    const g = this.game;
    const wood = this.home.woodStack.count;
    g.audio.play('dial');
    g.ui.choice('Telephone', 'Who do you call?', [
      { label: `Sell firewood to Heikki (${wood} logs, ${fmtMoney(wood * WOOD_PRICE)})`, disabled: wood < 10, action: () => this.sellWood() },
      { label: 'Call Uncle Pentti about the Ruska', action: () => this.uncleTips() },
      { label: 'Hang up', action: () => {} },
    ]);
  }

  sellWood() {
    const g = this.game;
    const h = this.home;
    const n = h.woodStack.count;
    if (n < 10) return;
    const pay = n * WOOD_PRICE;
    this.S.money += pay;
    h.woodStack.count = 0;
    h.woodStack.mesh.count = 0;
    g.audio.play('cash');
    g.ui.message(`Heikki will fetch the wood with his tractor. ${fmtMoney(pay)} will be in your wallet.`, 5);
  }

  uncleTips() {
    const pc = this.game.project;
    const tips = [];
    const missing = pc ? Object.values(pc.parts).filter((P) => !P.attached).map((P) => P.def) : [];
    if (pc.onStands && !pc.canLower()) tips.push('"Start from the bottom, kid. Engine block first, then everything that bolts to it."');
    if (missing.some((d) => d.shop)) tips.push('"You need spark plugs. Teppo sells them at the shop in Kylänmäki."');
    if (pc.has('head') && pc.v.engine.oil < 2.5) tips.push('"Don\'t you dare start it without oil. Four litres, into the rocker cover."');
    if (pc.has('radiator') && (pc.v.engine.coolant || 0) < 3) tips.push('"The radiator is dry. Coolant from the shop."');
    if (pc.has('carb')) tips.push(`"Mixture should be about 14,7 to one. Turn the screw on the carburettor."`);
    if (pc.has('distributor')) tips.push('"Timing, eight degrees. Loosen the distributor clamp, turn it, tighten it again."');
    tips.push('"The inspection is 120 marks. They check the lights, the exhaust, every bolt."');
    tips.push('"If the battery is flat, the charger is on the workbench."');
    const t = tips[Math.floor(Math.random() * Math.min(3, tips.length))];
    this.game.ui.choice('Uncle Pentti', t, [{ label: 'Thanks. Bye.', action: () => {} }]);
  }

  // --- mail
  readMail() {
    this.game.ui.letter();
  }

  // --- charger
  chargerBattery() {
    const g = this.game;
    const cp = this.home.charger.pos;
    const prop = g.props.list.find((p) => p.type === 'part:battery' && p.pos.distanceTo(cp) < 1.6);
    if (prop) return { kind: 'prop', prop };
    const pc = g.project;
    if (pc && pc.has('battery') && pc.mountWorld('battery').distanceTo(cp) < 3.6) return { kind: 'car' };
    return null;
  }

  chargerHint() {
    if (this.charging) return 'Stop charging';
    return this.chargerBattery() ? 'Charge the battery' : null;
  }

  useCharger() {
    const g = this.game;
    if (this.charging) { this.charging = false; g.audio.play('switch'); this.home.charger.led.material.emissiveIntensity = 0; return; }
    if (!this.chargerBattery()) { g.ui.message('Put the battery next to the charger (or park the car beside the bench).'); return; }
    this.charging = true;
    g.audio.play('switch');
    this.home.charger.led.material.emissiveIntensity = 2;
    g.ui.message('Charging. It takes about an hour to fill.', 3);
  }

  // --- woodshed
  chopHint() { return this.S.fatigue > 94 ? null : 'Split a log'; }

  chopWood() {
    const g = this.game;
    if (this.S.fatigue > 94) { g.ui.message('You are too tired to swing an axe.'); return; }
    const h = this.home;
    if (h.woodStack.count >= 120) { g.ui.message('The woodshed is full. Sell some wood by phone.'); return; }
    g.audio.play('chop', { pos: h.chopPos });
    g.player.shake = 0.35;
    h.axe.rotation.z = 0.5 + (this.chopSwings % 2 ? -0.3 : 0.3);
    this.chopSwings++;
    this.S.apply({ fatigue: 0.35, dirt: 0.15 });
    g.survival.advance(1 / 60, { working: 1 });
    if (this.chopSwings % 3 === 0) {
      h.woodStack.count++;
      this.updateWoodStack();
      if (h.woodStack.count % 10 === 0) g.ui.message(`${h.woodStack.count} logs split. Heikki buys firewood by phone.`, 2.5);
    }
  }

  updateWoodStack() {
    const h = this.home;
    const st = h.woodStack;
    const d = new THREE.Object3D();
    const n = Math.min(120, st.count);
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / 20), col = i % 20;
      d.position.set(-1.75 + col * 0.18, 0.18 + row * 0.15, -0.6 + (row % 2) * 0.05);
      d.rotation.set(0, (i * 0.37) % 0.2, 0);
      d.updateMatrix();
      st.mesh.setMatrixAt(i, d.matrix);
    }
    st.mesh.count = n;
    st.mesh.instanceMatrix.needsUpdate = true;
  }

  // --- sauna
  stoveHint() {
    const s = this.home.sauna;
    return s.lit ? null : 'Light the stove';
  }

  lightStove() {
    const g = this.game;
    const s = this.home.sauna;
    if (s.lit) return;
    s.lit = true;
    s.fire = 3.5; // game hours of burning
    g.audio.play('chop', { pos: s.stonesPos, vol: 0.4 });
    g.ui.message('The birch logs catch. The sauna will be hot in about half an hour.', 3.5);
  }

  saunaSitHint() {
    return this.game.player.mode === 'sit' ? null : 'Sit on the bench';
  }

  saunaSit() {
    const g = this.game;
    const p = g.player;
    if (g.hands.carried) g.hands.drop();
    p.mode = 'sit';
    p.sitPos = this.home.saunaSeat.clone().add(new THREE.Vector3(0, 0.62, 0));
    p.sitReturn = p.pos.clone();
    p.pitch = -0.1;
    g.input.pressed.delete('KeyE');
    g.ui.message(`${Math.round(this.home.sauna.temp)} °C. Look at the bucket and press E for löyly. E again to stand up.`, 4);
  }

  loylyHint() { return this.home.sauna.temp > 40 ? 'Throw löyly' : 'Throw water (the stove is cold)'; }

  throwLoyly() {
    const g = this.game;
    const s = this.home.sauna;
    if (s.temp < 40) { g.ui.message('The stones are cold. Light the stove first.'); g.audio.play('splash', { vol: 0.3 }); return; }
    g.audio.play('hiss', { pos: s.stonesPos });
    s.steam = 1;
    s.temp = Math.min(110, s.temp + 6);
    const inSauna = g.player.mode === 'sit';
    this.S.apply({ stress: inSauna ? -9 : -3, dirt: inSauna ? -12 : -3, thirst: 3 });
    for (const p of this.steam) { p.t = Math.random() * 0.3; p.alive = true; }
  }

  buildSteam() {
    const mat = new THREE.SpriteMaterial({ map: smokeTexture(), color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(mat.clone());
      s.visible = false;
      this.game.scene.add(s);
      this.steam.push({ s, t: 0, alive: false, ox: (Math.random() - 0.5) * 0.5, oz: (Math.random() - 0.5) * 0.5 });
    }
  }

  // Sauna heat, charger, steam; called every frame with game-hours elapsed.
  update(dt, gh) {
    const g = this.game;
    const h = this.home;
    const s = h.sauna;
    if (s.lit) {
      s.fire -= gh;
      s.temp = Math.min(95, s.temp + gh * 130 * (1 - s.temp / 100));
      if (s.fire <= 0) { s.lit = false; }
    } else s.temp = Math.max(18, s.temp - gh * 25);
    s.glow.emissiveIntensity = s.lit ? 1.5 + Math.random() * 0.8 : 0;
    s.light.intensity = s.lit ? 2 + Math.random() * 0.6 : 0;
    const dist = g.player.pos.distanceTo(s.stonesPos);
    g.audio.loop('fire', s.lit && dist < 12 ? 0.25 : 0, { pos: s.stonesPos });
    // sitting in the heat
    if (g.player.mode === 'sit') {
      const heat = clamp((s.temp - 45) / 40, 0, 1.3);
      this.S.stress = Math.max(0, this.S.stress - gh * 35 * heat);
      this.S.dirt = Math.max(0, this.S.dirt - gh * 70 * heat);
      this.S.thirst = Math.min(100, this.S.thirst + gh * 25 * heat);
      if (s.temp > 100 && Math.random() < dt * 0.1) g.ui.message('It is very hot. Maybe cool off in the lake.', 3);
    }
    for (const p of this.steam) {
      if (!p.alive) { p.s.visible = false; continue; }
      p.t += dt;
      if (p.t > 2.2) { p.alive = false; p.s.visible = false; continue; }
      const k = p.t / 2.2;
      p.s.visible = true;
      p.s.position.set(s.stonesPos.x + p.ox * (1 + k * 2), s.stonesPos.y + k * 1.4, s.stonesPos.z + p.oz * (1 + k * 2));
      p.s.scale.setScalar(0.3 + k * 1.4);
      p.s.material.opacity = 0.55 * (1 - k);
    }
    // charger
    if (this.charging) {
      const b = this.chargerBattery();
      if (!b) { this.charging = false; h.charger.led.material.emissiveIntensity = 0; }
      else {
        const pc = g.project;
        pc.v.engine.battery = Math.min(1, pc.v.engine.battery + gh * 0.9);
        if (pc.v.engine.battery >= 1) { this.charging = false; h.charger.led.material.emissiveIntensity = 0; g.ui.message('The battery charger clicks off. Full.'); }
      }
      g.audio.loop('charger', this.charging && g.player.pos.distanceTo(h.charger.pos) < 8 ? 0.04 : 0, { pos: h.charger.pos });
    } else g.audio.loop('charger', 0);
  }

  // --- fuel pumps
  pumpVehicle(pump) {
    let best = null, bd = 6;
    for (const v of this.game.vehicles) {
      const d = v.body.position.distanceTo(pump.pos);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  pumpHint(pump) {
    const carried = this.game.hands.carried;
    if (carried && carried.type === 'jerrycan') return 'Fill the jerry can';
    const v = this.pumpVehicle(pump);
    if (!v) return 'Park next to the pump';
    const need = v.engine.fuelCap - v.engine.fuel;
    if (need < 0.5) return null;
    return `Fill up the ${v.id === 'van' ? 'van' : 'Ruska'} (${need.toFixed(0)} L, ${fmtMoney(need * FUEL_PRICE)})`;
  }

  pumpUse(pump) {
    const g = this.game;
    const carried = g.hands.carried;
    let tank, cap, label;
    if (carried && carried.type === 'jerrycan') {
      tank = { get: () => carried.data.amount || 0, set: (x) => { carried.data.amount = x; } };
      cap = 20; label = 'jerry can';
    } else {
      const v = this.pumpVehicle(pump);
      if (!v) { g.ui.message('Park the car next to the pump first.'); return; }
      if (v.project && !v.project.has('fueltank')) { g.ui.message('The Ruska has no fuel tank.'); return; }
      tank = { get: () => v.engine.fuel, set: (x) => { v.engine.fuel = x; } };
      cap = v.engine.fuelCap; label = v.id === 'van' ? 'van' : 'Ruska';
    }
    const need = cap - tank.get();
    if (need < 0.2) { g.ui.message('It is already full.'); return; }
    const afford = Math.min(need, this.S.money / FUEL_PRICE);
    if (afford < 0.2) { g.ui.message('You cannot afford any fuel.'); g.audio.play('error'); return; }
    tank.set(tank.get() + afford);
    const cost = afford * FUEL_PRICE;
    this.S.money -= cost;
    g.audio.play('pour');
    g.audio.play('cash');
    g.survival.advance(3 / 60);
    g.ui.message(`Filled the ${label}: ${afford.toFixed(1).replace('.', ',')} L for ${fmtMoney(cost)}.`, 3.5);
  }
}
