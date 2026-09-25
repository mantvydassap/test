import * as THREE from 'three';
import { Input } from './core/input.js';
import { AudioSys } from './core/audio.js';
import { setMaxAnisotropy } from './core/textures.js';
import { Terrain } from './world/terrain.js';
import { buildRoadMeshes } from './world/roads.js';
import { Sky } from './world/sky.js';
import { Colliders } from './world/colliders.js';
import { Vegetation } from './world/vegetation.js';
import { buildHome, updateHome } from './world/home.js';
import { buildTown, buildCountryside } from './world/town.js';
import { buildWater } from './world/water.js';
import { LightPool } from './world/lights.js';
import { Grass } from './world/grass.js';
import { Post } from './world/post.js';
import { buildVillage } from './world/village.js';
import { Npcs } from './game/npcs.js';
import { FIELDS, WATER } from './world/layout.js';
import { Interact } from './game/interact.js';
import { Props } from './game/props.js';
import { Player } from './game/player.js';
import { Hands } from './game/hands.js';
import { Survival, GAME_HOUR_SECONDS } from './game/survival.js';
import { Actions } from './game/actions.js';
import { Shop } from './game/shop.js';
import { Inspection } from './game/inspection.js';
import { createVan } from './game/vehicleModels.js';
import { ProjectCar } from './game/projectCar.js';
import { Traffic } from './game/traffic.js';
import { ITEMS } from './game/items.js';
import { UI } from './ui/ui.js';
import { saveGame, loadGame, saveSummary, applySave } from './game/save.js';
import { deathStory, winStory } from './game/news.js';

const SETTINGS_KEY = 'midsummer-motors:settings';
const BOOT_KEY = 'midsummer-motors:boot';

function loadSettings() {
  const def = { sensitivity: 1, fov: 75, volume: 0.8, quality: 'medium', invertY: false, autoGear: true };
  try { return { ...def, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch (e) { return def; }
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

class Game {
  constructor() {
    this.settings = loadSettings();
    this.state = 'loading';
    this.itemDefs = ITEMS;
    this.fields = FIELDS;
    this.vehicles = [];
    this.dirty = false;
    this.fadeBusy = false;
    this.checklistOn = false;
    this.mapOn = false;
    this.clock = new THREE.Clock();
    this.menuT = 0;
    this.time = 0;
  }

  async boot() {
    const canvas = document.getElementById('game');
    const q = this.settings.quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'low' ? 1 : 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    setMaxAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    this.scene = new THREE.Scene();
    this.scene.environmentIntensity = 0.55;
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.05, 2600);
    this.scene.add(this.camera);
    this.post = new Post(this.renderer);
    this.lights = new LightPool(this.scene, q === 'low' ? 2 : 3, 2);
    window.addEventListener('resize', () => this.resize());

    this.input = new Input(canvas);
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    canvas.addEventListener('click', () => { if (this.state === 'playing' && !this.input.locked) this.input.requestLock(); });
    this.audio = new AudioSys();
    this.audio.setVolume(this.settings.volume);
    this.ui = new UI(this);
    const step = async (frac, what) => { this.ui.loading(frac, what); await nextFrame(); };

    await step(0.02, 'Shaping the land');
    this.terrain = new Terrain();
    await this.terrain.bake((f) => this.ui.loading(f * 0.6, 'Shaping the land'));
    await step(0.62, 'Laying the roads');
    this.terrain.buildMeshes(this.scene, q);
    for (const r of this.terrain.roads) this.scene.add(buildRoadMeshes(r, this.terrain));
    this.water = buildWater(this.scene, this.terrain);
    this.colliders = new Colliders(this.terrain);
    this.sky = new Sky(this.scene, this.renderer, q);
    this.interact = new Interact(this);
    await step(0.7, 'Building the homestead');
    this.home = buildHome(this);
    this.town = buildTown(this);
    this.country = buildCountryside(this);
    this.village = buildVillage(this);
    for (const b of this.builders) b.finalize();
    await step(0.78, 'Planting the forest');
    this.vegetation = new Vegetation(this.scene, this.terrain, this.colliders, q);
    this.vegetation.build([...this.home.exclusions, ...this.town.exclusions, ...this.country.exclusions]);
    this.grass = new Grass(this.scene, this.terrain, this.colliders, q);
    await step(0.9, 'Finding the car keys');
    this.survival = new Survival(this);
    this.props = new Props(this);
    this.player = new Player(this);
    this.hands = new Hands(this);
    this.actions = new Actions(this);
    this.npcs = new Npcs(this, this.village);
    this.shop = new Shop(this);
    this.inspection = new Inspection(this);
    this.van = createVan(this);
    this.vehicles.push(this.van);
    this.project = new ProjectCar(this, this.home.garage, this.home.carSpot);
    this.vehicles.push(this.project.v);
    const pcImpact = this.project.v.impactCallback;
    this.project.v.impactCallback = (imp) => { pcImpact(imp); this.onImpact(this.project.v, imp); };
    this.van.impactCallback = (imp) => this.onImpact(this.van, imp);
    this.traffic = new Traffic(this, this.terrain.roads.find((r) => r.id === 'highway'), q === 'low' ? 3 : 5);
    this.placeStart();
    this.clockText = () => this.survival.clockText();
    this.sky.update(this.survival.hours, this.player.pos, 0, true);
    await step(1, 'Ready');

    // warm up shaders
    this.menuCamera(0);
    this.renderer.compile(this.scene, this.camera);
    this.ui.hideLoading();
    this.ui.setHudVisible(false);

    let boot = null;
    try { boot = sessionStorage.getItem(BOOT_KEY); sessionStorage.removeItem(BOOT_KEY); } catch (e) { /* no session storage */ }
    this.state = 'menu';
    if (boot === 'new' || boot === 'continue') this.showClickToStart(boot);
    else this.ui.showMenu({ hasSave: saveSummary() });
    this.clock.start();
    this.loop();
    window.__game = this;
  }

  placeStart() {
    const H = this.terrain.pads.find((p) => p.name === 'home').h;
    this.player.teleport(-236, H, 196.5, -Math.PI / 2);
    this.van.place(-221.5, H + 0.05, 206, Math.PI);
    this.van.engine.ignition = false;
  }

  renderFrame() {
    this.post.render(this.scene, this.camera, this.time, this.survival ? this.survival.drunk : 0);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.post) this.post.resize();
  }

  applySettings() {
    const s = this.settings;
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.audio.setVolume(s.volume);
    const q = s.quality;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'low' ? 1 : 1.5));
    this.resize();
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ }
  }

  // ---------------------------------------------------------------- flow
  showClickToStart(kind) {
    this.ui.modal(`<div class="card"><h2>${kind === 'new' ? 'New game' : 'Continue'}</h2><p>Click to begin. The mouse will be captured; press Esc to pause.</p><div class="actions"><button class="pill primary">Start</button></div></div>`, (m) => {
      m.querySelector('button').onclick = () => { this.ui.closeModal(); this.audio.init(); kind === 'new' ? this.newGame() : this.continueGame(); };
    });
  }

  reloadInto(kind) {
    try { sessionStorage.setItem(BOOT_KEY, kind); } catch (e) { /* ignore */ }
    location.reload();
  }

  newGame() {
    if (this.dirty) { this.reloadInto('new'); return; }
    this.dirty = true;
    this.survival.reset();
    this.project.spawnLooseParts();
    this.spawnStarterItems();
    this.placeStart();
    this.startPlaying();
    setTimeout(() => this.ui.letter(), 600);
  }

  continueGame() {
    if (this.dirty) { this.reloadInto('continue'); return; }
    const data = loadGame();
    if (!data) { this.newGame(); return; }
    this.dirty = true;
    try {
      applySave(this, data);
    } catch (e) {
      console.error(e);
      this.ui.message('The save could not be read. Starting fresh.');
      this.project.spawnLooseParts();
      this.spawnStarterItems();
    }
    this.startPlaying();
    this.ui.message(`Welcome back. ${this.survival.clockText()}.`);
  }

  spawnStarterItems() {
    const hb = this.home.house;
    const FY = 0.65;
    const at = (x, y, z) => hb.toWorld(x, y, z);
    this.props.spawn('coffee', at(1.75, FY + 1.05, -3.5));
    this.props.spawn('sausage', at(3.0, FY + 0.82, 0.7), { yaw: 0.3 });
    this.props.spawn('bread', at(3.4, FY + 0.84, 0.95));
    this.props.spawn('milk', at(3.5, FY + 0.9, 0.6));
    this.props.spawn('beer', at(2.8, FY + 0.9, 1.0));
    this.props.spawn('beer', at(2.7, FY + 0.9, 0.95));
    const gb = this.home.garage;
    this.props.spawn('jerrycan', gb.toWorld(2.9, 0.4, 3.9), { amount: 6 });
    this.props.spawn('oil', gb.toWorld(-3.15, 0.4, -2.2), { amount: 1.5 });
  }

  startPlaying() {
    this.state = 'playing';
    this.ui.hideMenu();
    this.ui.setHudVisible(true);
    this.audio.init();
    this.input.enabled = true;
    this.requestLock();
    this.sky.update(this.survival.hours, this.player.pos, 0, true);
    this.actions.applyHouseLights();
  }

  requestLock() {
    this.input.requestLock();
    clearTimeout(this._lockCheck);
    this._lockCheck = setTimeout(() => {
      if (!this.input.locked && this.state === 'playing') {
        this.input.free = true;
        this.ui.message('Mouse capture is unavailable here: move the mouse to look, Esc for the menu.', 6);
      }
    }, 700);
  }

  onLockChange(locked) {
    if (locked) { this.input.free = false; return; }
    if (this.state === 'playing' && !this.input.free) this.pause();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.free = false;
    this.audio.stopAllLoops();
    if (this.audio.ctx) this.audio.ctx.suspend();
    this.ui.showChecklist(false); this.ui.showMap(false);
    this.checklistOn = false; this.mapOn = false;
    this.ui.showMenu({ hasSave: saveSummary(), paused: true });
  }

  resume() {
    this.ui.hideMenu();
    this.audio.init();
    this.state = 'playing';
    this.requestLock();
  }

  openModal() {
    if (this.state === 'playing') this.state = 'modal';
    this.input.enabled = false;
    this.input.free = false;
    this.input.exitLock();
  }

  closeModal() {
    this.input.enabled = true;
    if (this.state === 'modal') { this.state = 'playing'; this.requestLock(); }
  }

  quitToMenu() {
    this.reloadInto('menu');
  }

  saveGame(silent = false) {
    const ok = saveGame(this);
    if (!silent) this.ui.message(ok ? 'Game saved.' : 'Saving failed: browser storage is unavailable.');
    return ok;
  }

  fade(dur, mid, hold = 0.3) {
    const f = this.ui.el.fade;
    this.fadeBusy = true;
    f.style.transition = `opacity ${dur / 2}s`;
    f.style.opacity = '1';
    setTimeout(() => {
      try { mid && mid(); } catch (e) { console.error(e); }
      setTimeout(() => { f.style.opacity = '0'; this.fadeBusy = false; }, hold * 1000);
    }, dur * 500);
  }

  // ---------------------------------------------------------------- vehicles
  enterVehicle(v) {
    const p = this.player;
    if (this.hands.carried) this.hands.drop();
    this.hands.toolMode = false;
    p.mode = 'drive';
    p.vehicle = v;
    p.lookYaw = 0; p.lookPitch = -0.08;
    v.driver = p;
    v.handbrake = false;
    v.wake();
    this.ui.showCluster(true);
    this.audio.play('door', { pos: v.x });
    if (v.project && v.project.onStands) this.ui.message('The car is on jack stands. You can start the engine, but it won\'t go anywhere.', 4);
    else if (v.project && !v.project.has('steering')) this.ui.message('There is no steering wheel.', 3);
  }

  exitVehicle() {
    const p = this.player;
    const v = p.vehicle;
    if (!v) return;
    if (v.vel.length() > 5) { this.ui.message('You are going too fast to jump out.'); return; }
    const C = this.colliders;
    const tries = [v.exitSide.clone(), v.exitSide.clone().setX(-v.exitSide.x), new THREE.Vector3(0, v.dims.y1 + 0.2, v.dims.hz + 1.2)];
    let placed = null;
    for (const t of tries) {
      const w = t.clone().applyMatrix4(v.body.matrixWorld);
      const test = w.clone();
      const moved = C.pushCircle(test, 0.3, w.y + 0.4, w.y + 1.7);
      if (!moved || test.distanceTo(w) < 0.3) { placed = test; break; }
    }
    if (!placed) placed = v.x.clone().add(new THREE.Vector3(0, 2, 0));
    const gh = C.surfaceHeight(placed.x, placed.z, placed.y + 1.5);
    p.teleport(placed.x, Math.max(gh, this.terrain.heightAt(placed.x, placed.z)), placed.z, v.yaw + p.lookYaw);
    p.pitch = 0;
    p.mode = 'walk';
    p.vehicle = null;
    v.driver = null;
    v.throttleIn = 0; v.brakeIn = 0; v.steer = 0;
    v.handbrake = true;
    v.engine.cranking = false;
    this.audio.loop('horn:' + v.id, 0);
    this.ui.showCluster(false);
    this.audio.play('door', { pos: v.x });
    this.input.pressed.delete('KeyE');
  }

  toggleCarRadio(v) {
    if (v.radio) { v.radio.stop(); v.radio = null; this.audio.play('switch'); return; }
    if (v.id !== 'van') { this.ui.message('The Ruska has no radio.'); return; }
    if (!v.engine.ignition) { this.ui.message('Turn the key first (tap I).'); return; }
    v.radio = this.audio.startRadio(v.x);
    this.audio.play('switch');
  }

  onImpact(v, imp) {
    if (this.player.vehicle !== v || this.state !== 'playing') {
      if (imp > 6) this.audio.play('crash', { pos: v.x, vol: 0.6 });
      return;
    }
    if (imp > 17) { this.audio.play('crash'); this.die('crash'); return; }
    if (imp > 8) {
      this.audio.play('crash', { vol: Math.min(1, imp / 14) });
      this.player.shake = Math.min(1.5, imp / 8);
      this.survival.apply({ stress: imp * 1.4 });
      if (imp > 12) this.ui.message('That hurt. Your head hits the steering wheel.');
    } else if (imp > 5) {
      this.audio.play('thud', { vol: 0.6 });
      this.player.shake = 0.3;
    }
  }

  // ---------------------------------------------------------------- death & win
  snapshot() {
    try {
      this.renderFrame();
      return this.renderer.domElement.toDataURL('image/jpeg', 0.72);
    } catch (e) { return null; }
  }

  die(cause) {
    if (this.state === 'dead') return;
    const photo = this.snapshot();
    this.state = 'dead';
    this.input.exitLock();
    this.input.free = false;
    this.audio.stopAllLoops();
    this.audio.play('heartbeat');
    setTimeout(() => { if (this.state === 'dead' && this.audio.ctx) this.audio.ctx.suspend(); }, 1500);
    if (this.player.vehicle) { this.player.vehicle.throttleIn = 0; this.player.vehicle.engine.running = false; }
    this.ui.setHudVisible(false);
    const story = deathStory(this, cause);
    const has = !!saveSummary();
    const buttons = [];
    if (has) buttons.push({ label: 'Load the last save', action: () => this.reloadInto('continue') });
    buttons.push({ label: 'Start a new game', action: () => this.reloadInto('new') });
    this.ui.newspaper({ ...story, photo, buttons });
  }

  win() {
    const photo = this.snapshot();
    const prev = this.state;
    this.state = 'win';
    this.input.exitLock();
    const story = winStory(this);
    this.ui.newspaper({
      ...story, photo,
      buttons: [
        { label: 'Keep driving', action: () => { this.state = prev === 'modal' ? 'playing' : 'playing'; this.input.enabled = true; this.ui.setHudVisible(true); this.requestLock(); } },
        { label: 'Main menu', action: () => this.quitToMenu() },
      ],
    });
  }

  // ---------------------------------------------------------------- loop
  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    const t0 = performance.now();
    try {
      this.update(this.fixedDt || dt);
    } catch (e) {
      console.error(e);
    }
    const t1 = performance.now();
    if (!this.skipRender) this.renderFrame();
    else this.scene.updateMatrixWorld();
    this.perf = { update: t1 - t0, render: performance.now() - t1 };
    this.input.endFrame();
  }

  // the vehicle whose headlights get the two real spotlights
  headlightCar() {
    const lit = (v) => v.lights && v.engine.battery > 0.02 && (!v.project || v.project.beamsOn);
    const pv = this.player.vehicle;
    if (pv && lit(pv)) return pv;
    let best = null, bd = 150 * 150;
    for (const v of this.vehicles) {
      if (!lit(v)) continue;
      const d = v.x.distanceToSquared(this.camera.position);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  menuCamera(dt) {
    this.menuT += dt;
    const H = this.terrain.pads.find((p) => p.name === 'home').h;
    const a = this.menuT * 0.03 + 0.6;
    const cx = -222, cz = 196;
    this.camera.position.set(cx + Math.cos(a) * 26, H + 5.5 + Math.sin(this.menuT * 0.1) * 0.6, cz + Math.sin(a) * 26);
    this.camera.lookAt(cx - 4, H + 1.6, cz - 2);
  }

  update(dt) {
    const input = this.input;
    const S = this.survival;
    this.ui.update(dt);
    if (this.state === 'menu' || this.state === 'loading') {
      this.menuCamera(dt);
      this.sky.update(21.6, this.camera.position, dt);
      this.sky.follow(this.camera.position);
      this.vegetation.update(this.camera.position, true);
      this.grass.update(dt, this.camera.position);
      this.water.update(dt);
      updateHome(this.home, this, dt, this.time);
      this.traffic.update(dt, [], this.sky.daylight);
      return;
    }
    if (this.state !== 'playing') {
      this.sky.follow(this.camera.position);
      return;
    }
    if (!input.locked && input.free && input.wasPressed('Escape')) { this.pause(); return; }

    // overlays
    const tabDown = input.isDown('Tab');
    if (tabDown !== this.checklistOn) { this.checklistOn = tabDown; this.ui.showChecklist(tabDown); }
    else if (tabDown && (this._clT = (this._clT || 0) - dt) < 0) { this._clT = 0.5; this.ui.showChecklist(true); }
    if (input.wasPressed('KeyM')) { this.mapOn = !this.mapOn; this.ui.showMap(this.mapOn); }
    if (this.mapOn) this.ui.showMap(true);

    const p = this.player;
    // time and needs
    const gh = dt / GAME_HOUR_SECONDS;
    const working = this.hands.toolMode ? 0.3 : 0;
    S.advance(gh, { sprinting: p.sprinting && p.mode === 'walk', working, sauna: 0 });
    const cause = S.check();
    if (cause) { this.die(cause); return; }
    if (S.fatigue >= 100 && p.mode !== 'sleep' && !this.fadeBusy) {
      if (p.vehicle) { this.die('asleep'); return; }
      this.ui.message('You can\'t keep your eyes open...');
      this.actions.sleep(true);
    }
    if (S.stress > 90 && (this._hb = (this._hb || 0) - dt) < 0) { this._hb = 1.1; this.audio.play('heartbeat', { vol: 0.5 }); }

    // modes
    if (p.mode === 'drive') {
      const v = p.vehicle;
      if (v.project && !v.project.has('steering')) { input.down.delete('KeyA'); input.down.delete('KeyD'); }
      v.drive(input, dt, this.settings);
      if (input.wasPressed('KeyE')) this.exitVehicle();
      if (input.wasPressed('KeyC')) p.camMode = p.camMode === 'fp' ? 'chase' : 'fp';
      if (input.wasPressed('KeyN')) this.toggleCarRadio(v);
      if (S.drunk > 0.3 && v.speed > 3) v.steer += Math.sin(this.time * 1.3) * S.drunk * 0.004;
      p.look(input, this.settings, dt);
      p.pos.copy(v.x); p.pos.y -= 0.5;
      this.ui.prompt('', []);
    } else {
      p.update(dt, input, this.settings);
    }
    const hit = this.hands.update(dt, input);
    if (p.mode === 'sit' && input.wasPressed('KeyE')) {
      const usingTarget = hit && hit.kind === 'target' && hit.target.name === 'Water bucket';
      if (!usingTarget) { p.mode = 'walk'; if (p.sitReturn) p.pos.copy(p.sitReturn); p.sitPos = null; }
    }
    this.ui.tool(this.hands.toolMode && p.mode === 'walk');

    // physics
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    for (const v of this.vehicles) v.update(dt, sub);
    this.project.update(dt);
    this.props.update(dt);
    const obstacles = [p.mode === 'drive' ? p.vehicle.x : p.pos];
    for (const v of this.vehicles) if (v !== p.vehicle) obstacles.push(v.x);
    this.traffic.update(dt, obstacles, this.sky.daylight);

    // world
    this.actions.update(dt, gh);
    this.shop.update(dt);
    this.npcs.update(dt, gh);
    updateHome(this.home, this, dt, this.time);
    p.updateCamera(this.camera, dt);
    this.sky.update(S.hours, p.mode === 'drive' ? p.vehicle.x : p.pos, dt);
    this.sky.follow(this.camera.position);
    this.vegetation.update(this.camera.position, true);
    this.grass.update(dt, this.camera.position);
    this.water.update(dt);
    const night = 1 - this.sky.daylight;
    for (const w of this.town.windows) w.emissiveIntensity = night > 0.35 ? 0.8 : 0;
    for (const w of this.country.windows) w.emissiveIntensity = night > 0.35 ? 0.8 : 0;
    for (const w of this.village.windows) w.emissiveIntensity = night > 0.35 || this.npcs.barOpen() ? 0.8 : 0;
    this.town.lampHeadMat.emissiveIntensity = night > 0.4 ? 3 : 0;
    this.lights.update(this.camera.position, this.headlightCar());

    // audio
    this.audio.updateListener(this.camera);
    for (const v of this.vehicles) {
      v.updateSound(this.camera, p.vehicle === v && p.camMode === 'fp');
      if (v.radio) { if (!v.engine.ignition || v.engine.battery < 0.03) { v.radio.stop(); v.radio = null; } else v.radio.setPos(v.x); }
    }
    const nearWater = Math.min(...this.terrain.lakes.map((l) => Math.max(0, this.terrain.lakeSigned(l, p.pos.x, p.pos.z))));
    const indoors = this.colliders.ceilingHeight(p.pos.x, p.pos.z, p.pos.y + 1.0) < p.pos.y + 4;
    this.audio.updateAmbience(dt, { daylight: this.sky.daylight, nearWater, indoors, hour: S.hours });
    if (this.home.radio.on && this.home.radio.player) this.home.radio.player.setPos(this.home.radio.pos);
    this.audio.loop('wind', p.mode === 'drive' ? Math.min(0.25, p.vehicle.speed / 110) : 0, { speed: p.mode === 'drive' ? p.vehicle.speed : 0 });

    // HUD
    for (const v of this.vehicles) {
      if (!v.dash) continue;
      const close = v === p.vehicle || v.x.distanceToSquared(this.camera.position) < 36;
      v.dash.t -= dt;
      if (close && v.dash.t <= 0) { v.dash.t = v === p.vehicle ? 0.05 : 0.5; this.ui.drawCluster(v, v.dash.canvas); v.dash.tex.needsUpdate = true; }
    }
    const under = this.camera.position.y < WATER - 0.02 && this.terrain.heightAt(this.camera.position.x, this.camera.position.z) < WATER;
    this.ui.el.underwater.hidden = !under;
    if (this.camera.fov !== this.settings.fov + (S.drunk > 0.5 ? Math.sin(this.time * 0.7) * S.drunk * 2 : 0)) {
      this.camera.fov = this.settings.fov + (S.drunk > 0.5 ? Math.sin(this.time * 0.7) * S.drunk * 2 : 0);
      this.camera.updateProjectionMatrix();
    }
  }
}

const game = new Game();
game.boot().catch((e) => {
  console.error(e);
  const el = document.querySelector('#loading .what');
  if (el) el.textContent = 'Something went wrong while loading: ' + e.message;
});
