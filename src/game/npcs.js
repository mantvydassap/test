import * as THREE from 'three';
import { animatePerson } from '../world/npc.js';
import { fmtMoney } from '../core/math.js';
import { PART_DEFS } from './projectCar.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];

const DRUNK_LINES = [
  'Heh... you again. Buy me a beer, will you?',
  'I had a Ruska once. Drove it into Kotijärvi. The fish liked it.',
  'Don\'t tell my wife I\'m here. Actually, she knows.',
  'The inspector... he checks EVERY bolt. Every single one. Hic.',
  'In \'62 I drove from here to Tampere on one tank. Downhill both ways.',
  'Sauna, beer, sleep. That\'s the whole secret of life.',
  'You smell like petrol. Good. Honest smell.',
  'Mixture! Fourteen point seven. Wrote it on my hand. ...Where\'s my hand?',
];
const DRUNK_THANKS = [
  'Ahh... a friend in need. Here, take this. Found it in the ditch.',
  'You are a good person. Remember: timing is eight degrees. Eight!',
  'Kippis! If the Ruska won\'t start, check the plugs. Always the plugs.',
];
const FISHER_LINES = [
  'Shh. The pike are listening.',
  'Seven kilos last summer. Nobody believes me.',
  'Your uncle Pentti? He owes me a bottle of kossu.',
  'The lake gives, the lake takes. Mostly lures.',
];
const BUS_LINES = [
  'The bus is late. The bus is always late.',
  'Going to the city to see my sister. Twice a year is plenty.',
  'You fixing Pentti\'s old Ruska? Good luck with that.',
];
const FARMER_LINES = [
  'Split some firewood and ring me. I pay four and a half marks a log.',
  'Hay is in. Now it just has to stop raining in August.',
  'That van of Pentti\'s used to haul my potatoes.',
];

// Villagers: the bar, the drunk, the mechanic, grandma's ride to church.
export class Npcs {
  constructor(game, village) {
    this.game = game;
    this.v = village;
    this.byId = Object.fromEntries(village.npcs.map((n) => [n.id, n]));
    this.grandma = { state: 'home', car: null, pay: 100, complain: 0, lastRideDay: 0, timer: 0 };
    this._p = new THREE.Vector3();
  }

  get S() { return this.game.survival; }

  say(who, text) { this.game.ui.say(who, text); }

  // ---------------- bar
  barOpen() { const h = this.S.hours; return h >= 12 || h < 2; }
  barHint() { return this.barOpen() ? 'Buy a beer (4,00 mk)' : null; }

  buyBeer() {
    const g = this.game;
    if (!this.barOpen()) { this.say('Raimo', 'We open at noon.'); return; }
    if (this.S.money < 4) { this.say('Raimo', 'No money, no beer.'); g.audio.play('error'); return; }
    this.S.money -= 4;
    this.S.apply({ thirst: -20, stress: -10, drunk: 0.2, urine: 14 });
    g.audio.play('cash'); setTimeout(() => g.audio.play('drink'), 400);
    this.say('Raimo', pick(['Kippis.', 'There you go.', 'One cold one.', 'Mind the step on your way out.']));
    g.survival.advance(8 / 60);
    this.drunkNote();
  }

  buyShot() {
    const g = this.game;
    if (!this.barOpen()) return;
    if (this.S.money < 3.5) { this.say('Raimo', 'That\'s three fifty.'); g.audio.play('error'); return; }
    this.S.money -= 3.5;
    this.S.apply({ stress: -8, drunk: 0.35, thirst: 3 });
    g.audio.play('cash'); setTimeout(() => g.audio.play('gulp'), 300);
    this.say('Raimo', pick(['Kossu. Straight.', 'Careful with that one.', 'Pohjanmaan malliin.']));
    this.drunkNote();
  }

  drunkNote() {
    const d = this.S.drunk;
    if (d > 2) this.game.ui.message('The floor is moving. Maybe that\'s enough.');
    else if (d > 1) this.game.ui.message('You feel warm and wobbly.');
  }

  jukebox() {
    const g = this.game;
    const j = this.v.jukebox;
    if (j.on) { j.on = false; if (j.player) j.player.stop(); j.player = null; g.audio.play('switch'); return; }
    if (this.S.money < 1) { g.ui.message('The jukebox wants a one-mark coin.'); return; }
    this.S.money -= 1;
    g.audio.play('coin');
    j.on = true;
    j.player = g.audio.startRadio(j.pos);
    if (Math.random() < 0.5) setTimeout(() => this.say('Jaska', 'Ohh, THIS one! Turn it up!'), 1200);
  }

  talkDrunk() {
    const g = this.game;
    if (!this.barOpen() && (this.S.hours > 4 && this.S.hours < 12)) { this.say('Jaska', 'Zzz... (he is asleep on the table)'); return; }
    this.say('Jaska', pick(DRUNK_LINES));
    g.audio.play('belch');
  }

  giveDrunkBeer(item) {
    const g = this.game;
    if (g.hands.carried === item) { g.hands.carried = null; item.carried = false; }
    g.props.remove(item);
    g.audio.play('drink');
    this.say('Jaska', pick(DRUNK_THANKS));
    if (Math.random() < 0.6) { const m = 5 + Math.floor(Math.random() * 20); this.S.money += m; g.ui.message(`Jaska presses ${fmtMoney(m)} into your hand.`); }
    this.S.apply({ stress: -4 });
  }

  // ---------------- mechanic
  shopOpen() { const h = this.S.hours; return h >= 8 && h < 17 && this.S.weekday < 5; }

  talkMechanic() {
    const g = this.game;
    if (!this.shopOpen()) { this.say('Veikko', 'Closed. Weekdays eight to five.'); return; }
    const pc = g.project;
    const near = pc.v.x.distanceTo(this.v.repairShop.toWorld(0, 0, 0)) < 22 && !pc.onStands;
    if (!near) {
      this.say('Veikko', pick(['Bring the car here and I\'ll have a look.', 'Pentti\'s Ruska? Tow it in, I\'ll see what I can do.', 'I fix anything with wheels. Tractors too.']));
      return;
    }
    const e = pc.v.engine;
    const money = this.S.money;
    const svc = (label, price, ok, fn) => ({ label: `${label} — ${fmtMoney(price)}`, disabled: !ok || money < price, action: () => {
      this.S.money -= price; fn(); g.audio.play('ratchet'); g.audio.play('cash');
      g.survival.advance(1); g.ui.message('Veikko wipes his hands. "Done."', 3);
    } });
    const looseParts = PART_DEFS.filter((d) => pc.has(d.id) && pc.tightness(pc.parts[d.id]) < 1);
    g.ui.choice('Veikko, mechanic', 'Let\'s see what she needs.', [
      svc('Tune mixture and ignition timing', 90, pc.has('carb') && pc.has('distributor'), () => { e.mixture = 14.7; e.timing = 8; }),
      svc(`Tighten every bolt (${looseParts.length} loose parts)`, 150, looseParts.length > 0, () => {
        for (const d of looseParts) { const P = pc.parts[d.id]; P.bolts = P.bolts.map(() => 4); pc.updateBoltVisuals(P); }
      }),
      svc('Charge the battery', 25, pc.has('battery') && e.battery < 0.95, () => { e.battery = 1; }),
      svc('Top up oil and coolant', 55, pc.has('oilpan') && pc.has('hoses'), () => { e.oil = 3.5; e.coolant = 4.5; }),
      svc('Overhaul the engine', 260, pc.has('block') && e.wear > 5, () => { e.wear = 0; }),
      { label: 'Nothing today', action: () => {} },
    ]);
  }

  // ---------------- grandma
  grandmaHint() {
    const G = this.grandma;
    if (G.state === 'riding') return null;
    return 'Talk';
  }

  playerVehicleNear(pos, r) {
    const g = this.game;
    return g.vehicles.find((v) => v.x.distanceTo(pos) < r && !v.fixed && (!v.project || (v.project.has('seat') && v.project.has('steering'))));
  }

  talkGrandma() {
    const g = this.game;
    const G = this.grandma;
    const n = this.byId.grandma;
    if (G.state === 'church') { this.say('Mummo', 'Shh, the service is on. Come back later, dear.'); return; }
    const h = this.S.hours;
    if (G.lastRideDay === this.S.day || h < 8 || h > 18) {
      this.say('Mummo', pick(['Have you eaten, dear? You look thin.', 'Pentti never visits. At least you do.', 'Drive carefully. Your grandfather never did.', 'Don\'t drink with Jaska at the bar. That man is a bad influence.']));
      return;
    }
    n.person.getWorldPosition(this._p);
    const car = this.playerVehicleNear(this._p, 30);
    if (!car) { this.say('Mummo', 'Would you take me to church in the village sometime? Come with a car, dear.'); return; }
    g.ui.choice('Mummo', '"Would you drive me to the church in Kylänmäki? I\'ll give you a hundred marks for petrol. And drive slowly!"', [
      { label: 'Of course, get in', action: () => this.boardGrandma(car) },
      { label: 'Not today, sorry', action: () => this.say('Mummo', 'Oh well. Another day then.') },
    ]);
  }

  boardGrandma(car) {
    const g = this.game;
    const G = this.grandma;
    G.state = 'riding'; G.car = car; G.pay = 100; G.complain = 0; G.lastImpact = 0;
    this.byId.grandma.person.visible = false;
    const sit = this.v.grannySitting;
    sit.visible = true;
    car.body.add(sit);
    if (car.id === 'van') sit.position.set(0.45, 0.96, -1.25);
    else sit.position.set(0.36, 0.42, 0.12);
    sit.rotation.set(0, 0, 0);
    g.audio.play('door', { pos: car.x });
    g.ui.message('Mummo is in the car. Drive her to the church in Kylänmäki.', 4);
  }

  update(dt, gh) {
    const g = this.game;
    const cam = g.camera.position;
    for (const n of this.v.npcs) {
      if (!n.person.visible) continue;
      n.person.getWorldPosition(this._p);
      if (this._p.distanceToSquared(cam) > 60 * 60) continue;
      animatePerson(n.person, dt, false, n.drunk || 0);
    }
    if (this.v.grannySitting.visible) animatePerson(this.v.grannySitting, dt, false, 0);
    const j = this.v.jukebox;
    if (j.on && j.player) j.player.setPos(j.pos);
    this.byId.bartender.person.visible = this.barOpen();
    // grandma's trip
    const G = this.grandma;
    if (G.state === 'riding') {
      const car = G.car;
      const kmh = car.speed * 3.6;
      G.cool = (G.cool || 0) - dt;
      if (kmh > 90 && G.cool <= 0) {
        G.cool = 12; G.complain++; G.pay = Math.max(20, G.pay - 15);
        this.say('Mummo', pick(['Slow down! I want to arrive alive!', 'Oh my! This is not a rally!', 'Your grandfather drove like this. Look where he is now.']));
        this.S.apply({ stress: 4 });
      }
      if (car.lastImpact > 6 && G.cool <= 6) {
        G.pay = Math.max(0, G.pay - 40); G.cool = 12;
        this.say('Mummo', 'OH! My heart! Watch where you are going!');
      }
      car.lastImpact = 0;
      if (car.x.distanceTo(this.v.churchDoor) < 30 && car.speed < 2) this.dropGrandma();
    } else if (G.state === 'church') {
      G.timer -= gh;
      if (G.timer <= 0) this.sendGrandmaHome();
    }
  }

  dropGrandma() {
    const g = this.game;
    const G = this.grandma;
    const sit = this.v.grannySitting;
    sit.parent.remove(sit); sit.visible = false;
    g.scene.add(sit);
    const n = this.byId.grandma;
    const cd = this.v.churchDoor;
    g.scene.attach(n.person);
    n.person.position.set(cd.x, g.terrain.heightAt(cd.x, cd.z), cd.z);
    n.person.visible = true;
    G.state = 'church'; G.timer = 2.5; G.lastRideDay = this.S.day;
    this.S.money += G.pay;
    g.audio.play('coin');
    this.say('Mummo', G.pay >= 100 ? 'Thank you, dear. Here, for the petrol. Buy yourself some real food too.' : 'We made it. Barely. Here, take this... but drive slower next time.');
    g.ui.message(`Mummo paid you ${fmtMoney(G.pay)}.`, 4);
  }

  sendGrandmaHome() {
    const n = this.byId.grandma;
    const h = n.home;
    h.builder.group.add(n.person);
    n.person.position.set(h.x, h.y, h.z);
    n.person.rotation.set(0, h.rot, 0);
    this.grandma.state = 'home';
  }

  // ---------------- small talk
  talkFarmer() {
    const g = this.game;
    const wood = g.home.woodStack.count;
    if (wood >= 10) {
      g.ui.choice('Heikki, farmer', `"You have ${wood} logs split? I'll take them all."`, [
        { label: `Sell the firewood (${fmtMoney(wood * 4.5)})`, action: () => g.actions.sellWood() },
        { label: 'Later', action: () => {} },
      ]);
      return;
    }
    this.say('Heikki', pick(FARMER_LINES));
  }

  talkFisher() { this.say('Old man', pick(FISHER_LINES)); }
  talkBus() { this.say('Passenger', pick(BUS_LINES)); }
}
