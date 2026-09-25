import { ITEMS } from './items.js';
import { fmtMoney } from '../core/math.js';
import { animatePerson } from '../world/npc.js';

const LINES_HELLO = ['Päivää.', 'Moi. What will it be?', 'Hot today, eh?', 'Tulppia? Plugs are on the back shelf.', 'The inspection man was in yesterday. Strict fellow.'];
const LINES_PAY = ['Kiitos.', 'Kiitos, tervetuloa uudestaan.', 'Here is your bag.', 'Drive carefully. The elk are out.'];

// Kylän Kauppa: take items from the shelves, pay at the till, get a paper bag.
export class Shop {
  constructor(game) {
    this.game = game;
    this.basket = [];
    this.talkT = 0;
  }

  isOpen() {
    const h = this.game.survival.hours;
    return h >= 8 && h < 21;
  }

  total() { return this.basket.reduce((s, t) => s + ITEMS[t].price, 0); }

  take(type) {
    const g = this.game;
    if (!this.isOpen()) { g.ui.message('The shop is closed. Open 8–21.'); return; }
    if (this.basket.length >= 30) { g.ui.message('Your basket is full.'); return; }
    this.basket.push(type);
    g.audio.play('pickup');
    g.ui.basket(this.basket, this.total());
  }

  clearBasket() {
    this.basket = [];
    this.game.ui.basket(this.basket, 0);
    this.game.ui.message('You put everything back on the shelves.');
  }

  registerHint() {
    if (!this.isOpen()) return null;
    const bottles = this.bottlesNear();
    if (!this.basket.length && !bottles.length) return null;
    const parts = [];
    if (this.basket.length) parts.push(`Pay ${fmtMoney(this.total())}`);
    if (bottles.length) parts.push(`return ${bottles.length} bottle${bottles.length > 1 ? 's' : ''}`);
    return parts.join(', ');
  }

  bottlesNear() {
    const rp = this.game.town.registerPos;
    return this.game.props.list.filter((p) => p.type === 'bottle' && p.pos.distanceTo(rp) < 3.2);
  }

  pay() {
    const g = this.game;
    if (!this.isOpen()) return;
    const S = g.survival;
    const bottles = this.bottlesNear();
    if (bottles.length) {
      const refund = bottles.length * ITEMS.bottle.deposit;
      for (const b of bottles) { if (g.hands.carried === b) g.hands.drop(); g.props.remove(b); }
      S.money += refund;
      g.ui.message(`Bottle deposit: ${fmtMoney(refund)}.`);
      g.audio.play('coin');
    }
    if (!this.basket.length) return;
    const total = this.total();
    if (total > S.money + 1e-6) {
      g.ui.say('Teppo', `That's ${fmtMoney(total)}. You only have ${fmtMoney(S.money)}.`);
      g.audio.play('error');
      return;
    }
    S.money -= total;
    const bag = g.props.spawn('bag', g.town.counterTop, { contents: this.basket.slice() });
    bag.vel.set(0, 0, 0);
    this.basket = [];
    g.ui.basket(this.basket, 0);
    g.audio.play('cash');
    g.ui.say('Teppo', LINES_PAY[Math.floor(Math.random() * LINES_PAY.length)]);
    this.talkT = 2;
  }

  talk() {
    const g = this.game;
    if (!this.isOpen()) { g.ui.say('Teppo', 'We are closed. Come back at eight.'); return; }
    g.ui.say('Teppo', LINES_HELLO[Math.floor(Math.random() * LINES_HELLO.length)]);
    this.talkT = 2;
  }

  update(dt) {
    const g = this.game;
    const town = g.town;
    let open = this.isOpen();
    const door = town.shopDoor;
    if (!open && door.open) {
      // never lock the player in: the door stays open until they leave
      const [lx, lz] = town.shopBuilder.toLocal(g.player.pos.x, g.player.pos.z);
      if (Math.abs(lx) < 6.2 && Math.abs(lz) < 4.8) open = true;
    }
    if (door.open !== open) {
      door.open = open;
      door.collider.enabled = !open;
      door.pivot.rotation.y = open ? -1.45 : 0;
      for (const l of town.shopLights) l.intensity = open ? 5 : 0;
    }
    // the shopkeeper only animates when someone is near
    if (g.player.pos.distanceToSquared(town.shopkeeper.getWorldPosition(this._p || (this._p = town.shopkeeper.position.clone()))) < 900) {
      this.talkT = Math.max(0, this.talkT - dt);
      town.shopkeeper.visible = open;
      animatePerson(town.shopkeeper, dt, this.talkT > 0);
      animatePerson(town.inspector, dt, false);
    }
  }
}
