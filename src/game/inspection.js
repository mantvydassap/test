import { fmtMoney } from '../core/math.js';

const FEE = 120;

// Katsastus: the vehicle inspection that decides whether the Ruska is road-legal.
export class Inspection {
  constructor(game) {
    this.game = game;
  }

  carInHall() {
    const g = this.game;
    const pc = g.project;
    const z = g.town.inspectionZone;
    const [lx, lz] = z.builder.toLocal(pc.v.x.x, pc.v.x.z);
    return lx > z.x0 && lx < z.x1 && lz > z.z0 && lz < z.z1;
  }

  open() {
    const h = this.game.survival.hours;
    const wd = this.game.survival.weekday;
    return h >= 8 && h < 16 && wd < 5;
  }

  hint() {
    const g = this.game;
    if (g.project.inspected) return 'Say hello';
    if (!this.open()) return null;
    if (!this.carInHall()) return 'Ask about inspection';
    return `Request inspection (${fmtMoney(FEE)})`;
  }

  request() {
    const g = this.game;
    const pc = g.project;
    if (pc.inspected) { g.ui.say('Inspector', 'Your Ruska is road legal. Drive safely.'); return; }
    if (!this.open()) { g.ui.say('Inspector', 'Office hours are 8–16, Monday to Friday.'); return; }
    if (!this.carInHall()) {
      g.ui.say('Inspector', `Drive the car into the hall and I will look at it. The fee is ${fmtMoney(FEE)}.`);
      return;
    }
    if (g.survival.money < FEE) { g.ui.say('Inspector', `The fee is ${fmtMoney(FEE)}, paid in advance.`); g.audio.play('error'); return; }
    g.survival.money -= FEE;
    g.audio.play('cash');
    g.survival.advance(0.5);
    const rep = pc.inspectionReport();
    if (rep.pass) {
      pc.inspected = true;
      pc.setPlates('RUS-179');
      g.audio.play('win');
      g.ui.inspection(rep, true, () => g.win());
    } else {
      g.audio.play('fail');
      g.ui.inspection(rep, false);
    }
    g.saveGame(true);
  }
}
