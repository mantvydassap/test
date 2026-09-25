import { clamp } from '../core/math.js';

export const WEEKDAYS = ['MA', 'TI', 'KE', 'TO', 'PE', 'LA', 'SU'];
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const GAME_HOUR_SECONDS = 80; // one in-game hour lasts 80 real seconds

// Needs rise over time; 100 means trouble. Money is in Finnish marks.
export class Survival {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.hunger = 22; this.thirst = 25; this.fatigue = 12; this.stress = 12; this.urine = 15; this.dirt = 8;
    this.drunk = 0;
    this.money = 850;
    this.day = 1;        // 1 = Monday 2 July 1979
    this.hours = 10.25;
    this.warned = {};
    this.heartT = 0;
  }

  get weekday() { return (this.day - 1) % 7; }

  dateText() {
    const d = new Date(1979, 6, 1 + this.day);
    return `${WEEKDAY_NAMES[this.weekday]} ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  }

  clockText() {
    const h = Math.floor(this.hours), m = Math.floor((this.hours - h) * 60);
    return `${WEEKDAYS[this.weekday]} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Advance time by game hours with rate multipliers (sleep halves most needs).
  advance(gh, { sleeping = false, sprinting = false, sauna = 0, working = 0 } = {}) {
    this.hours += gh;
    while (this.hours >= 24) { this.hours -= 24; this.day++; }
    const k = sleeping ? 0.45 : 1;
    this.hunger += gh * 3.4 * k * (1 + working * 0.5);
    this.thirst += gh * 4.6 * k * (1 + (sprinting ? 1.5 : 0) + sauna * 5 + working * 0.6);
    this.urine += gh * 3.6 * k;
    this.dirt += gh * 1.8 * (sleeping ? 0.3 : 1) * (1 + working * 2);
    if (sleeping) this.fatigue -= gh * 13;
    else this.fatigue += gh * 3.6 * (1 + (sprinting ? 1.2 : 0) + working * 0.8 + this.drunk * 0.6);
    // stress follows discomfort
    let s = -gh * 2.2;
    if (this.hunger > 65) s += gh * 4;
    if (this.thirst > 65) s += gh * 5;
    if (this.fatigue > 80) s += gh * 4;
    if (this.urine > 85) s += gh * 5;
    if (this.dirt > 80) s += gh * 2;
    if (sleeping) s -= gh * 2;
    this.stress += s - sauna * gh * 30;
    this.dirt -= sauna * gh * 60;
    this.drunk = Math.max(0, this.drunk - gh * 0.35);
    this.clamp();
  }

  apply(fx = {}) {
    for (const k of ['hunger', 'thirst', 'fatigue', 'stress', 'urine', 'dirt']) if (fx[k]) this[k] += fx[k];
    if (fx.drunk) this.drunk += fx.drunk;
    this.clamp();
  }

  clamp() {
    for (const k of ['hunger', 'thirst', 'fatigue', 'stress', 'urine', 'dirt']) this[k] = clamp(this[k], 0, 100);
    this.drunk = clamp(this.drunk, 0, 3);
  }

  // Returns a death cause string or null; also triggers warnings and passing out.
  check() {
    const ui = this.game.ui;
    const warn = (key, level, text) => {
      if (this[key] >= level && !this.warned[key + level]) { this.warned[key + level] = true; ui.message(text); }
      if (this[key] < level - 10) this.warned[key + level] = false;
    };
    warn('hunger', 75, 'Your stomach is growling. You need to eat.');
    warn('hunger', 92, 'You feel faint with hunger.');
    warn('thirst', 75, 'Your mouth is dry. Drink something.');
    warn('thirst', 92, 'You are badly dehydrated.');
    warn('fatigue', 85, 'Your eyes keep closing. Go to bed.');
    warn('urine', 85, 'You really need to pee. (Hold P)');
    warn('stress', 80, 'Your chest feels tight. Calm down: sauna, a beer, some sleep.');
    warn('dirt', 85, 'You smell. A shower or the sauna would help.');
    if (this.hunger >= 100) return 'hunger';
    if (this.thirst >= 100) return 'thirst';
    if (this.stress >= 100) return 'stress';
    return null;
  }

  serialize() {
    const o = {};
    for (const k of ['hunger', 'thirst', 'fatigue', 'stress', 'urine', 'dirt', 'drunk', 'money', 'day', 'hours']) o[k] = this[k];
    return o;
  }

  restore(o) { Object.assign(this, o); }
}
