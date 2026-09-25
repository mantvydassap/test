import { fmtMoney, clamp } from '../core/math.js';
import { GEAR_NAMES } from '../game/vehicle.js';
import { PART_DEFS } from '../game/projectCar.js';
import { WATER, MAP_HALF } from '../world/layout.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const CONTROLS = [
  ['On foot', [
    ['Move', 'W A S D'], ['Sprint', 'Shift'], ['Crouch', 'C'], ['Jump', 'Space'],
    ['Use / interact', 'E'], ['Secondary action', 'X'], ['Pick up / drop', 'Left mouse'], ['Throw', 'Right mouse'],
    ['Turn held item', 'Scroll'], ['Wrench on / off', 'F'], ['Tighten bolt', 'Scroll up or left mouse'], ['Loosen bolt', 'Scroll down or right mouse'],
    ['Pee', 'Hold P'], ['Car checklist', 'Tab'], ['Map', 'M'], ['Pause', 'Esc'],
  ]],
  ['Driving', [
    ['Ignition on / off', 'Tap I'], ['Start the engine', 'Hold I'], ['Throttle / brake', 'W / S'], ['Steer', 'A / D'],
    ['Handbrake', 'Space'], ['Gear up / down', 'R / F'], ['Headlights', 'L'], ['Horn', 'H'], ['Camera', 'C'], ['Get out', 'E'],
  ]],
];

export class UI {
  constructor(game) {
    this.game = game;
    this.msgs = [];
    this.build();
    this.statT = 0;
    this.lastPrompt = '';
  }

  build() {
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.innerHTML = `
      <div id="crosshair"></div>
      <div id="prompt"></div>
      <div id="messages"></div>
      <div id="say" hidden></div>
      <div id="stats">
        ${['Hunger', 'Thirst', 'Fatigue', 'Stress', 'Urine', 'Dirt'].map((n) => `<div class="row"><label>${n}</label><div class="bar"><i data-k="${n.toLowerCase()}"></i></div></div>`).join('')}
        <div class="foot"><span class="money" id="money"></span><span id="clock"></span></div>
      </div>
      <div id="tool" hidden>Wrench</div>
      <div id="basket" hidden></div>
      <div id="cluster" hidden><canvas width="860" height="300"></canvas></div>
      <div id="drivehelp" hidden></div>
      <div id="checklist" hidden></div>
    `;
    document.body.appendChild(hud);
    const extra = document.createElement('div');
    extra.innerHTML = `
      <div id="vignette"></div>
      <div id="underwater" hidden></div>
      <div id="fade"></div>
      <div id="mapview" hidden><canvas width="1000" height="1000"></canvas></div>
      <div id="loading" class="screen"><div class="logo" style="font-size:54px">Midsummer<em>Motors</em></div><div class="bar"><i></i></div><div class="what">Loading</div></div>
      <div id="menu" class="screen" hidden></div>
      <div id="modal" class="screen" hidden></div>
    `;
    while (extra.firstChild) document.body.appendChild(extra.firstChild);
    this.el = {
      prompt: $('#prompt'), cross: $('#crosshair'), messages: $('#messages'), say: $('#say'), stats: $('#stats'),
      money: $('#money'), clock: $('#clock'), tool: $('#tool'), basket: $('#basket'), cluster: $('#cluster'),
      clusterCanvas: $('#cluster canvas'), drivehelp: $('#drivehelp'), checklist: $('#checklist'), fade: $('#fade'),
      loading: $('#loading'), menu: $('#menu'), modal: $('#modal'), map: $('#mapview'), mapCanvas: $('#mapview canvas'),
      underwater: $('#underwater'), hud,
    };
    this.bars = {};
    hud.querySelectorAll('.bar i').forEach((i) => { this.bars[i.dataset.k] = i; });
  }

  // ---------------------------------------------------------------- HUD
  setHudVisible(v) { this.el.hud.style.display = v ? '' : 'none'; }

  prompt(title, actions = [], sub = '', pips = null) {
    const key = title + '|' + sub + '|' + actions.map((a) => a.key + a.label).join(',') + '|' + (pips ? pips.pips + '/' + pips.tight : '');
    this.el.cross.classList.toggle('active', !!title);
    if (key === this.lastPrompt) return;
    this.lastPrompt = key;
    if (!title) { this.el.prompt.innerHTML = ''; return; }
    let html = `<div class="t">${esc(title)}</div>`;
    if (sub) html += `<div class="s">${esc(sub)}</div>`;
    if (pips) html += `<div class="pips ${pips.tight ? 'tight' : ''}">${Array.from({ length: pips.max }, (_, i) => `<i class="${i < pips.pips ? 'on' : ''}"></i>`).join('')}</div>`;
    if (actions.length) html += `<div class="a">${actions.map((a) => `<span><kbd>${esc(a.key)}</kbd>${esc(a.label)}</span>`).join('')}</div>`;
    this.el.prompt.innerHTML = html;
  }

  message(text, seconds = 4) {
    if (this.msgs.length && this.msgs[this.msgs.length - 1].text === text) { this.msgs[this.msgs.length - 1].t = seconds; return; }
    const d = document.createElement('div');
    d.textContent = text;
    this.el.messages.appendChild(d);
    this.msgs.push({ text, t: seconds, el: d });
    while (this.msgs.length > 5) { const m = this.msgs.shift(); m.el.remove(); }
  }

  say(who, text) {
    this.el.say.innerHTML = `<b>${esc(who)}</b>${esc(text)}`;
    this.el.say.hidden = false;
    this.sayT = 4;
    this.game.audio.play('ui');
  }

  update(dt) {
    for (const m of this.msgs) {
      m.t -= dt;
      m.el.style.opacity = m.t < 0.6 ? Math.max(0, m.t / 0.6) : 1;
    }
    while (this.msgs.length && this.msgs[0].t <= 0) { const m = this.msgs.shift(); m.el.remove(); }
    if (this.sayT > 0) { this.sayT -= dt; if (this.sayT <= 0) this.el.say.hidden = true; }
    this.statT -= dt;
    if (this.statT <= 0) { this.statT = 0.2; this.updateStats(); }
  }

  updateStats() {
    const S = this.game.survival;
    for (const k of Object.keys(this.bars)) {
      const v = S[k];
      const b = this.bars[k];
      b.style.width = v.toFixed(1) + '%';
      b.className = v > 85 ? 'crit' : v > 65 ? 'warn' : '';
    }
    this.el.money.textContent = fmtMoney(S.money);
    this.el.clock.textContent = S.clockText();
  }

  tool(on) { this.el.tool.hidden = !on; }

  basket(list, total) {
    const b = this.el.basket;
    if (!list.length) { b.hidden = true; return; }
    const counts = {};
    for (const t of list) counts[t] = (counts[t] || 0) + 1;
    const items = this.game.itemDefs;
    b.innerHTML = `<h4>Basket</h4>${Object.entries(counts).map(([t, n]) => `<div class="li"><span>${n} × ${esc(items[t].name)}</span><span>${fmtMoney(items[t].price * n)}</span></div>`).join('')}<div class="tot"><span>Total</span><span>${fmtMoney(total)}</span></div>`;
    b.hidden = false;
  }

  // ---------------------------------------------------------------- driving cluster
  showCluster(v) {
    this.el.cluster.hidden = !v;
    this.el.drivehelp.hidden = !v;
    if (v) this.el.drivehelp.innerHTML = `<kbd>I</kbd> ignition · hold to start<br><kbd>R</kbd>/<kbd>F</kbd> gears · <kbd>Space</kbd> handbrake<br><kbd>L</kbd> lights · <kbd>C</kbd> camera · <kbd>E</kbd> get out`;
  }

  drawCluster(v) {
    const c = this.el.clusterCanvas;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    const e = v.engine;
    // bezel
    ctx.fillStyle = 'rgba(18,17,13,0.9)';
    roundRect(ctx, 10, 20, W - 20, H - 30, 28); ctx.fill();
    const dial = (cx, cy, r, val, max, ticks, label, red = null, unit = '') => {
      ctx.fillStyle = '#e9e1c8';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2a261c'; ctx.lineWidth = 6; ctx.stroke();
      const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      if (red) {
        ctx.strokeStyle = '#b8322a'; ctx.lineWidth = 10;
        ctx.beginPath(); ctx.arc(cx, cy, r - 14, a0 + (a1 - a0) * red, a1); ctx.stroke();
      }
      ctx.strokeStyle = '#1b1a14'; ctx.fillStyle = '#1b1a14'; ctx.lineWidth = 3;
      ctx.font = 'bold 20px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i <= ticks; i++) {
        const a = a0 + (a1 - a0) * (i / ticks);
        const ca = Math.cos(a), sa = Math.sin(a);
        ctx.beginPath(); ctx.moveTo(cx + ca * (r - 8), cy + sa * (r - 8)); ctx.lineTo(cx + ca * (r - 22), cy + sa * (r - 22)); ctx.stroke();
        ctx.fillText(String(Math.round(max / ticks * i / (unit === 'rpm' ? 1000 : 1))), cx + ca * (r - 40), cy + sa * (r - 40));
      }
      ctx.font = '600 16px "Barlow Condensed", sans-serif';
      ctx.fillText(label, cx, cy + r * 0.45);
      const a = a0 + (a1 - a0) * clamp(val / max, 0, 1.02);
      ctx.strokeStyle = '#c4622d'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * 12, cy - Math.sin(a) * 12); ctx.lineTo(cx + Math.cos(a) * (r - 18), cy + Math.sin(a) * (r - 18)); ctx.stroke();
      ctx.fillStyle = '#2a261c'; ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
    };
    const kmh = v.speed * 3.6;
    dial(150, 160, 118, kmh, 160, 8, 'km/h');
    dial(W - 150, 160, 118, e.rpm, 7000, 7, 'rpm × 1000', (v.engine.redline) / 7000, 'rpm');
    // centre
    const cx = W / 2;
    ctx.fillStyle = '#efe8d6'; ctx.textAlign = 'center';
    ctx.font = '900 84px "Big Shoulders Display", sans-serif';
    ctx.fillText(GEAR_NAMES[v.gear], cx, 118);
    // lamps
    const lamp = (x, y, on, col, txt) => {
      ctx.fillStyle = on ? col : '#2e2b22';
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = on ? '#fff' : '#57523f'; ctx.font = 'bold 11px "IBM Plex Mono", monospace';
      ctx.fillText(txt, x, y + 25);
    };
    const q = v._qual || { oilOK: true, charging: true };
    lamp(cx - 60, 190, e.ignition && (!e.running || !q.charging), '#d2463a', 'BAT');
    lamp(cx - 20, 190, e.ignition && (!e.running || !q.oilOK), '#d2463a', 'OIL');
    lamp(cx + 20, 190, v.handbrake, '#d2463a', 'P');
    lamp(cx + 60, 190, v.lights, '#6fbf4a', 'LIGHT');
    // fuel and temperature bars
    const bar = (y, frac, label, warn) => {
      ctx.fillStyle = '#2e2b22'; ctx.fillRect(cx - 70, y, 140, 9);
      ctx.fillStyle = warn ? '#d2463a' : '#d9a441'; ctx.fillRect(cx - 70, y, 140 * clamp(frac, 0, 1), 9);
      ctx.fillStyle = '#a9a28f'; ctx.font = '600 13px "Barlow Condensed", sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(label, cx - 70, y - 8); ctx.textAlign = 'center';
    };
    bar(240, e.fuel / e.fuelCap, `FUEL ${e.fuel.toFixed(1)} L`, e.fuel < 3);
    bar(272, (e.temp - 20) / 110, `TEMP ${Math.round(e.temp)} °C`, e.temp > 110);
    if (!e.ignition) { ctx.fillStyle = '#7d765f'; ctx.font = '600 14px "Barlow Condensed", sans-serif'; ctx.fillText('KEY OFF', cx, 158); }
    else if (e.cranking) { ctx.fillStyle = '#d9a441'; ctx.font = '600 14px "Barlow Condensed", sans-serif'; ctx.fillText('CRANKING', cx, 158); }
  }

  // ---------------------------------------------------------------- checklist (Tab)
  showChecklist(on) {
    const el = this.el.checklist;
    el.hidden = !on;
    if (!on) return;
    const pc = this.game.project;
    const groups = {};
    for (const d of PART_DEFS) (groups[d.group] = groups[d.group] || []).push(d);
    const e = pc.v.engine;
    let html = `<h3>Ruska 1300</h3><div class="sub">Workshop notes · ${pc.onStands ? 'on jack stands' : 'on its wheels'}${pc.inspected ? ' · <b>road legal</b>' : ''}</div>`;
    for (const [g, list] of Object.entries(groups)) {
      html += `<h5>${esc(g)}</h5>`;
      for (const d of list) {
        const P = pc.parts[d.id];
        const t = pc.tightness(P);
        const cls = !P.attached ? '' : t >= 1 ? 'ok' : 'loose';
        const st = !P.attached ? (d.shop ? 'buy at shop' : 'not fitted') : P.bolts.length ? `${P.bolts.filter((b) => b >= 4).length}/${P.bolts.length} tight` : 'fitted';
        html += `<div class="p"><i class="dot ${cls}"></i><span>${esc(d.name)}</span><span class="st">${st}</span></div>`;
      }
    }
    html += `<h5>Fluids &amp; tune</h5><div class="kv">
      <span>Engine oil</span><span>${e.oil.toFixed(1)} / 3,5 L</span>
      <span>Coolant</span><span>${(e.coolant || 0).toFixed(1)} / 4,5 L</span>
      <span>Fuel</span><span>${e.fuel.toFixed(1)} / ${e.fuelCap} L</span>
      <span>Battery</span><span>${Math.round(e.battery * 100)} %</span>
      <span>Mixture (ideal 14,7)</span><span>${e.mixture.toFixed(1)} : 1</span>
      <span>Ignition timing</span><span>${Math.round(e.timing)}° BTDC</span>
      <span>Engine condition</span><span>${Math.round(100 - e.wear)} %</span></div>`;
    el.innerHTML = html.replace(/(\d)\.(\d)/g, '$1,$2');
  }

  // ---------------------------------------------------------------- map (M)
  buildMap() {
    const g = this.game;
    const T = g.terrain;
    const c = document.createElement('canvas');
    c.width = c.height = 1000;
    const ctx = c.getContext('2d');
    const S = 1000 / (MAP_HALF * 2);
    const px = (x) => (x + MAP_HALF) * S, pz = (z) => (z + MAP_HALF) * S;
    ctx.fillStyle = '#ece3c8'; ctx.fillRect(0, 0, 1000, 1000);
    // forest tint
    for (let z = -MAP_HALF; z < MAP_HALF; z += 16) for (let x = -MAP_HALF; x < MAP_HALF; x += 16) {
      const fd = T.forestDensity(x, z);
      if (fd > 0.3) { ctx.fillStyle = `rgba(92,122,72,${0.12 + fd * 0.28})`; ctx.fillRect(px(x), pz(z), 16 * S + 0.5, 16 * S + 0.5); }
    }
    // contour-ish shading
    for (let z = -MAP_HALF; z < MAP_HALF; z += 8) for (let x = -MAP_HALF; x < MAP_HALF; x += 8) {
      const h = T.heightAt(x, z);
      if (h < WATER) { ctx.fillStyle = '#8fb4c9'; ctx.fillRect(px(x), pz(z), 8 * S + 0.6, 8 * S + 0.6); }
      else if (Math.floor(h / 6) !== Math.floor(T.heightAt(x + 8, z) / 6)) { ctx.fillStyle = 'rgba(140,100,60,0.25)'; ctx.fillRect(px(x), pz(z), 1.2, 1.2); }
    }
    for (const f of g.fields) { ctx.fillStyle = 'rgba(214,180,80,0.55)'; ctx.fillRect(px(f.x0), pz(f.z0), (f.x1 - f.x0) * S, (f.z1 - f.z0) * S); }
    for (const road of T.roads) {
      ctx.beginPath();
      road.samples.forEach((s, i) => (i ? ctx.lineTo(px(s.x), pz(s.z)) : ctx.moveTo(px(s.x), pz(s.z))));
      if (road.closed) ctx.closePath();
      if (road.type === 'asphalt') {
        ctx.strokeStyle = '#3b3a36'; ctx.lineWidth = 7; ctx.setLineDash([]); ctx.stroke();
        ctx.strokeStyle = '#e0b43c'; ctx.lineWidth = 1.5; ctx.stroke();
      } else {
        ctx.strokeStyle = '#8a6a44'; ctx.lineWidth = 3.5; ctx.setLineDash([7, 4]); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    ctx.fillStyle = '#2a261c';
    ctx.font = 'italic 22px "Old Standard TT", Georgia, serif';
    const label = (t, x, z, size = 22, color = '#2a261c') => { ctx.font = `italic ${size}px "Old Standard TT", Georgia, serif`; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(t, px(x), pz(z)); };
    label('Kotijärvi', -430, 230, 22, '#2f5a7a');
    label('Haukilampi', 265, 260, 20, '#2f5a7a');
    label('KYLÄNMÄKI', 510, -410, 26);
    label('Koti', -228, 170, 20);
    label('Mäkelän tila', 95, -80, 18);
    label('Metsätie', -40, 40, 16, '#6b4a2a');
    label('Valtatie 13', 660, 230, 16);
    ctx.font = 'bold 30px "Big Shoulders Display", sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#8a2c20';
    ctx.fillText('KYLÄNMÄEN KUNTA · TIEKARTTA', 26, 46);
    ctx.font = '14px "IBM Plex Mono", monospace'; ctx.fillStyle = '#2a261c';
    ctx.fillText('1 : 16 000 · 1979', 26, 68);
    // north arrow
    ctx.beginPath(); ctx.moveTo(950, 40); ctx.lineTo(962, 76); ctx.lineTo(950, 68); ctx.lineTo(938, 76); ctx.closePath(); ctx.fill();
    ctx.font = 'bold 16px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.fillText('N', 950, 96);
    ctx.strokeStyle = '#2a261c'; ctx.lineWidth = 3; ctx.strokeRect(10, 10, 980, 980);
    this.mapBase = c;
  }

  showMap(on) {
    this.el.map.hidden = !on;
    if (!on) return;
    if (!this.mapBase) this.buildMap();
    const g = this.game;
    const c = this.el.mapCanvas;
    const ctx = c.getContext('2d');
    ctx.drawImage(this.mapBase, 0, 0);
    const S = 1000 / (MAP_HALF * 2);
    const px = (x) => (x + MAP_HALF) * S, pz = (z) => (z + MAP_HALF) * S;
    const marker = (x, z, col, txt) => {
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px(x), pz(z), 6, 0, Math.PI * 2); ctx.fill();
      ctx.font = '600 14px "Barlow Condensed", sans-serif'; ctx.fillStyle = '#1b1a14'; ctx.textAlign = 'left'; ctx.fillText(txt, px(x) + 9, pz(z) + 5);
    };
    for (const v of g.vehicles) marker(v.x.x, v.x.z, v.id === 'van' ? '#d9ccaa' : '#a9542a', v.id === 'van' ? 'Van' : 'Ruska');
    const p = g.player.mode === 'drive' && g.player.vehicle ? g.player.vehicle.x : g.player.pos;
    const yaw = g.player.mode === 'drive' && g.player.vehicle ? g.player.vehicle.yaw : g.player.yaw;
    ctx.save();
    ctx.translate(px(p.x), pz(p.z));
    ctx.rotate(-yaw);
    ctx.fillStyle = '#c4322a';
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(9, 10); ctx.lineTo(0, 5); ctx.lineTo(-9, 10); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- screens
  loading(frac, what) {
    this.el.loading.querySelector('.bar i').style.width = Math.round(frac * 100) + '%';
    if (what) this.el.loading.querySelector('.what').textContent = what;
  }

  hideLoading() { this.el.loading.hidden = true; }

  showMenu({ hasSave, paused = false }) {
    const m = this.el.menu;
    const g = this.game;
    m.hidden = false;
    m.innerHTML = `
      <div class="inner">
        <div>
          <p class="tag">Kylänmäki · Summer 1979</p>
          <h1 class="logo">Midsummer<em>Motors</em></h1>
        </div>
        <p class="lede">Uncle Pentti has gone to Sweden and left you his house, a sauna, a van and a Ruska 1300 in a hundred pieces. Rebuild the car, keep yourself fed and sane, and get it through inspection.</p>
        <div class="btns">
          ${paused ? '<button class="btn" data-a="resume">Resume</button>' : ''}
          ${!paused && hasSave ? `<button class="btn" data-a="continue">Continue<small>${esc(hasSave)}</small></button>` : ''}
          ${paused ? '<button class="btn" data-a="save">Save game</button>' : ''}
          <button class="btn" data-a="new">New game</button>
          <button class="btn" data-a="controls">Controls</button>
          <button class="btn" data-a="settings">Settings</button>
          ${paused ? '<button class="btn" data-a="quit">Main menu</button>' : ''}
        </div>
        <p class="note">Best with a mouse and keyboard. Click in the game to capture the mouse; Esc to pause.</p>
      </div>`;
    m.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
      g.audio.init();
      g.audio.play('ui');
      const a = b.dataset.a;
      if (a === 'resume') g.resume();
      else if (a === 'continue') g.continueGame();
      else if (a === 'new') {
        if (hasSave && !paused || paused) this.confirm('Start a new game?', 'Your current progress in this browser will be replaced when you next save.', () => g.newGame(), () => this.showMenu({ hasSave, paused }));
        else g.newGame();
      }
      else if (a === 'save') { g.saveGame(); this.showMenu({ hasSave, paused }); }
      else if (a === 'controls') this.showControls(() => this.showMenu({ hasSave, paused }));
      else if (a === 'settings') this.showSettings(() => this.showMenu({ hasSave, paused }));
      else if (a === 'quit') g.quitToMenu();
    }));
    const first = m.querySelector('.btn');
    if (first) first.focus({ preventScroll: true });
  }

  hideMenu() { this.el.menu.hidden = true; }

  modal(html, bind) {
    const m = this.el.modal;
    m.hidden = false;
    m.innerHTML = html;
    if (bind) bind(m);
    const f = m.querySelector('button');
    if (f) f.focus({ preventScroll: true });
  }

  closeModal() { this.el.modal.hidden = true; this.el.modal.innerHTML = ''; }

  confirm(title, text, yes, no) {
    this.el.menu.hidden = true;
    this.modal(`<div class="card"><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="actions"><button class="pill primary" data-a="y">Yes</button><button class="pill" data-a="n">Cancel</button></div></div>`, (m) => {
      m.querySelector('[data-a=y]').onclick = () => { this.closeModal(); yes(); };
      m.querySelector('[data-a=n]').onclick = () => { this.closeModal(); no(); };
    });
  }

  showControls(back) {
    this.el.menu.hidden = true;
    const rows = CONTROLS.map(([h, list]) => `<h4>${h}</h4>${list.map(([a, k]) => `<div><span>${esc(a)}</span><kbd>${esc(k)}</kbd></div>`).join('')}`).join('');
    this.modal(`<div class="card" style="max-width:760px"><h2>Controls</h2><div class="keys">${rows}</div><div class="actions"><button class="pill primary" data-a="b">Back</button></div></div>`, (m) => {
      m.querySelector('[data-a=b]').onclick = () => { this.closeModal(); back(); };
    });
  }

  showSettings(back) {
    const g = this.game;
    const s = g.settings;
    this.el.menu.hidden = true;
    this.modal(`<div class="card"><h2>Settings</h2><div class="settings">
      <label>Mouse sensitivity<input type="range" id="set-sens" min="0.2" max="3" step="0.05" value="${s.sensitivity}"><output>${s.sensitivity.toFixed(2)}</output></label>
      <label>Field of view<input type="range" id="set-fov" min="60" max="100" step="1" value="${s.fov}"><output>${s.fov}°</output></label>
      <label>Volume<input type="range" id="set-vol" min="0" max="1" step="0.05" value="${s.volume}"><output>${Math.round(s.volume * 100)}%</output></label>
      <label>Graphics<select id="set-q"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select><output></output></label>
      <label class="check">Invert mouse Y<input type="checkbox" id="set-inv" ${s.invertY ? 'checked' : ''}><span></span></label>
      <label class="check">Automatic gearbox<input type="checkbox" id="set-auto" ${s.autoGear ? 'checked' : ''}><span></span></label>
      <p class="note">Graphics changes to tree density apply the next time the page loads.</p>
    </div><div class="actions"><button class="pill primary" data-a="b">Done</button></div></div>`, (m) => {
      const q = m.querySelector('#set-q'); q.value = s.quality;
      const bindRange = (id, key, fmt) => {
        const el = m.querySelector(id);
        el.oninput = () => { s[key] = parseFloat(el.value); el.nextElementSibling.textContent = fmt(s[key]); g.applySettings(); };
      };
      bindRange('#set-sens', 'sensitivity', (v) => v.toFixed(2));
      bindRange('#set-fov', 'fov', (v) => v + '°');
      bindRange('#set-vol', 'volume', (v) => Math.round(v * 100) + '%');
      q.onchange = () => { s.quality = q.value; g.applySettings(); };
      m.querySelector('#set-inv').onchange = (e) => { s.invertY = e.target.checked; g.applySettings(); };
      m.querySelector('#set-auto').onchange = (e) => { s.autoGear = e.target.checked; g.applySettings(); };
      m.querySelector('[data-a=b]').onclick = () => { this.closeModal(); back(); };
    });
  }

  // In-game dialogs release the mouse and pause input.
  choice(title, text, options) {
    const g = this.game;
    g.openModal();
    this.modal(`<div class="card"><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="choices">${options.map((o, i) => `<button class="pill" data-i="${i}" ${o.disabled ? 'disabled' : ''}>${esc(o.label)}</button>`).join('')}</div></div>`, (m) => {
      m.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => {
        this.closeModal();
        g.closeModal();
        options[+b.dataset.i].action();
      });
    });
  }

  letter(onClose) {
    const g = this.game;
    g.openModal();
    this.modal(`<div class="letter">
      <div class="date">Kylänmäki, 30.6.1979</div>
      <p>Hei!</p>
      <p>By the time you read this I will be on the boat to Sweden. The Volvo factory in Göteborg pays three times what anyone pays here, and your aunt wants a colour television.</p>
      <p>The house is yours for the summer. So is the <b>Ruska</b>. I took her apart last winter and never found the time to put her back together. Every part is in the garage, except the <b>spark plugs</b>: Teppo sells those at the shop in the village. You will need <b>oil</b> and <b>coolant</b> too.</p>
      <p>If you can get her through the <b>inspection</b> in Kylänmäki (the hall by the main road, weekdays 8–16, 120 marks), she is yours to keep.</p>
      <p>The van has some petrol. Heikki buys firewood if you run short of money: split logs at the woodshed and ring him. Eat properly. Heat the sauna on Saturdays. Do not drink and drive.</p>
      <p class="sig">— Uncle Pentti</p>
      <p style="font-size:14px;font-family:var(--ui)">Tip: hold <kbd>Tab</kbd> for the car checklist and press <kbd>M</kbd> for the map.</p>
      <div class="actions"><button class="pill primary">Fold the letter</button></div>
    </div>`, (m) => {
      m.querySelector('button').onclick = () => { this.closeModal(); g.closeModal(); if (onClose) onClose(); };
    });
  }

  inspection(rep, pass, onDone) {
    const g = this.game;
    g.openModal();
    const d = g.survival;
    this.modal(`<div class="report">
      <header><h2>Katsastus</h2><span>${esc(d.dateText())}</span></header>
      <div style="margin-bottom:8px">Vehicle: Ruska 1300 coupé · chassis 1300-71-04417</div>
      ${rep.rows.map((r) => `<div class="r"><span class="${r.ok ? 'ok' : 'no'}">${r.ok ? '✓' : '✗'}</span><span>${esc(r.label)}${r.note ? `<br><span class="n">${esc(r.note)}</span>` : ''}</span><span class="${r.ok ? 'ok' : 'no'}">${r.ok ? 'OK' : 'FAIL'}</span></div>`).join('')}
      <div class="stamp ${pass ? 'ok' : 'no'}">${pass ? 'Hyväksytty · Passed' : 'Hylätty · Failed'}</div>
      <div class="actions" style="margin-top:14px"><button class="pill primary">${pass ? 'Collect the plates' : 'Back to work'}</button></div>
    </div>`, (m) => {
      m.querySelector('button').onclick = () => { this.closeModal(); g.closeModal(); if (onDone) onDone(); };
    });
  }

  newspaper({ headline, photo, caption, body, side, buttons }) {
    const g = this.game;
    const d = g.survival;
    this.el.menu.hidden = true;
    this.modal(`<div class="paper">
      <div class="mast"><h1>Kylänmäen Sanomat</h1></div>
      <div class="meta"><span>${esc(d.dateText())}</span><span>Nro ${120 + d.day}</span><span>Irtonumero 1,20 mk</span></div>
      <h2>${esc(headline)}</h2>
      ${photo ? `<img class="photo" src="${photo}" alt="">` : ''}
      <div class="cap">${esc(caption)}</div>
      <div class="cols">${body.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
      <div class="side">${side.map(([h, t]) => `<div><b>${esc(h)}</b>${esc(t)}</div>`).join('')}</div>
      <div class="actions">${buttons.map((b, i) => `<button class="pill ${i === 0 ? 'primary' : ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>
    </div>`, (m) => {
      m.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => { this.closeModal(); buttons[+b.dataset.i].action(); });
    });
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
