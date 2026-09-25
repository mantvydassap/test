// Every sound in the game is synthesised with WebAudio: engines, tools, birds, a humppa radio.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.volume = 0.8;
    this.loops = new Map();
    this.engines = [];
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.gain.value = 0.55; this.amb.connect(this.master);
    // noise buffers
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    this.enabled = true;
    this.startAmbience();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  noiseSrc(brown = false, loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = brown ? this.brown : this.noise;
    s.loop = loop;
    s.loopStart = Math.random();
    return s;
  }

  panner(pos) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 2.5; p.maxDistance = 400; p.rolloffFactor = 1.1;
    if (pos) this.setPos(p, pos);
    return p;
  }

  setPos(p, pos) {
    const t = this.ctx.currentTime;
    if (p.positionX) { p.positionX.setTargetAtTime(pos.x, t, 0.02); p.positionY.setTargetAtTime(pos.y, t, 0.02); p.positionZ.setTargetAtTime(pos.z, t, 0.02); }
    else p.setPosition(pos.x, pos.y, pos.z);
  }

  updateListener(cam) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const e = cam.matrixWorld.elements;
    const fx = -e[8], fy = -e[9], fz = -e[10];
    const ux = e[4], uy = e[5], uz = e[6];
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(cam.position.x, t, 0.02); L.positionY.setTargetAtTime(cam.position.y, t, 0.02); L.positionZ.setTargetAtTime(cam.position.z, t, 0.02);
      L.forwardX.setTargetAtTime(fx, t, 0.02); L.forwardY.setTargetAtTime(fy, t, 0.02); L.forwardZ.setTargetAtTime(fz, t, 0.02);
      L.upX.setTargetAtTime(ux, t, 0.02); L.upY.setTargetAtTime(uy, t, 0.02); L.upZ.setTargetAtTime(uz, t, 0.02);
    } else {
      L.setPosition(cam.position.x, cam.position.y, cam.position.z);
      L.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  // Short envelope helper.
  env(gainNode, t, a, peak, dec, sustain = 0) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(peak, t + a);
    g.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + dec);
  }

  // One-shot sound effects.
  play(name, opts = {}) {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = opts.vol ?? 1;
    if (opts.pos) { const p = this.panner(opts.pos); out.connect(p); p.connect(this.sfx); }
    else out.connect(this.sfx);
    const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
    const bp = (f, q) => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; return b; };
    const lp = (f) => { const b = ctx.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f; return b; };
    const hp = (f) => { const b = ctx.createBiquadFilter(); b.type = 'highpass'; b.frequency.value = f; return b; };
    const burst = (filter, dur, peak, delay = 0) => {
      const n = this.noiseSrc(false, false); const g = ctx.createGain();
      n.connect(filter); filter.connect(g); g.connect(out);
      this.env(g, t + delay, 0.003, peak, dur);
      n.start(t + delay); n.stop(t + delay + dur + 0.05);
    };
    const tone = (type, f0, f1, dur, peak, delay = 0) => {
      const o = osc(type, f0); const g = ctx.createGain();
      o.frequency.setValueAtTime(f0, t + delay);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + delay + dur);
      o.connect(g); g.connect(out);
      this.env(g, t + delay, 0.004, peak, dur);
      o.start(t + delay); o.stop(t + delay + dur + 0.05);
    };
    switch (name) {
      case 'ratchet':
        for (let i = 0; i < 3; i++) burst(bp(3200 + i * 300, 8), 0.025, 0.5, i * 0.045);
        tone('square', 1900, 1500, 0.02, 0.05);
        break;
      case 'tight':
        burst(bp(900, 4), 0.08, 0.6); tone('triangle', 420, 380, 0.12, 0.2);
        break;
      case 'clunk':
        burst(lp(700), 0.18, 0.9); tone('sine', 110, 60, 0.2, 0.6);
        break;
      case 'metal':
        tone('triangle', 820, 790, 0.35, 0.18); tone('sine', 1310, 1290, 0.3, 0.1); burst(bp(2500, 3), 0.05, 0.3);
        break;
      case 'pickup': burst(bp(1400, 1.2), 0.06, 0.25); break;
      case 'drop': burst(lp(900), 0.12, 0.6); tone('sine', 150, 70, 0.12, 0.3); break;
      case 'bottle': tone('sine', 1650, 1600, 0.25, 0.15); tone('sine', 2480, 2450, 0.2, 0.08); burst(bp(4000, 5), 0.03, 0.2); break;
      case 'eat':
        for (let i = 0; i < 5; i++) burst(bp(1800 + Math.random() * 1500, 2), 0.05, 0.4, i * 0.16 + Math.random() * 0.04);
        break;
      case 'drink':
        for (let i = 0; i < 4; i++) { tone('sine', 300 + Math.random() * 60, 700, 0.09, 0.25, i * 0.28); burst(lp(500), 0.1, 0.25, i * 0.28); }
        break;
      case 'cash':
        tone('square', 2400, 2400, 0.08, 0.08); tone('sine', 3200, 3150, 0.5, 0.15, 0.06); burst(bp(5000, 2), 0.2, 0.2, 0.04);
        break;
      case 'coin': tone('sine', 2600, 2500, 0.2, 0.12); tone('sine', 3900, 3800, 0.18, 0.06, 0.03); break;
      case 'door': tone('sawtooth', 180, 120, 0.5, 0.05); burst(lp(400), 0.15, 0.5, 0.35); break;
      case 'switch': burst(bp(3000, 3), 0.02, 0.5); tone('square', 900, 800, 0.015, 0.08); break;
      case 'step': {
        const s = opts.surface || 'grass';
        const f = s === 'wood' ? 380 : s === 'gravel' ? 2100 : s === 'asphalt' || s === 'concrete' || s === 'tile' || s === 'stone' ? 1200 : 900;
        const q = s === 'gravel' ? 0.6 : 1.2;
        burst(s === 'wood' ? lp(600) : bp(f, q), s === 'gravel' ? 0.09 : 0.06, s === 'grass' || s === 'field' ? 0.18 : 0.26);
        if (s === 'wood') tone('sine', 120, 80, 0.06, 0.2);
        break;
      }
      case 'splash': burst(bp(1200, 0.5), 0.5, 0.8); burst(hp(3000), 0.3, 0.3, 0.05); break;
      case 'hiss': { // löyly
        const n = this.noiseSrc(false, false); const f = hp(2500); const g = ctx.createGain();
        n.connect(f); f.connect(g); g.connect(out);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.7, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
        n.start(t); n.stop(t + 2.5);
        burst(lp(300), 0.3, 0.3);
        break;
      }
      case 'chop': burst(bp(700, 1.5), 0.12, 1.0); tone('sine', 180, 90, 0.15, 0.6); burst(bp(2500, 2), 0.06, 0.4, 0.01); break;
      case 'crash':
        burst(lp(500), 0.8, 1.2); burst(bp(2500, 1), 0.6, 0.8, 0.02); tone('sawtooth', 90, 40, 0.5, 0.4);
        for (let i = 0; i < 6; i++) burst(bp(3000 + Math.random() * 3000, 6), 0.05, 0.4, 0.1 + Math.random() * 0.4);
        break;
      case 'thud': burst(lp(300), 0.25, 1.0); tone('sine', 80, 45, 0.3, 0.8); break;
      case 'phone':
        for (let r = 0; r < 2; r++) for (let i = 0; i < 12; i++) tone('square', 1100 + (i % 2) * 200, 1100 + (i % 2) * 200, 0.035, 0.08, r * 0.8 + i * 0.04);
        break;
      case 'dial': for (let i = 0; i < 7; i++) burst(bp(1200, 6), 0.02, 0.3, i * 0.09); break;
      case 'ui': tone('triangle', 660, 640, 0.05, 0.12); break;
      case 'error': tone('square', 220, 200, 0.12, 0.08); tone('square', 180, 170, 0.14, 0.08, 0.13); break;
      case 'gulp': tone('sine', 250, 600, 0.12, 0.3); break;
      case 'belch': tone('sawtooth', 110, 70, 0.6, 0.25); burst(lp(400), 0.5, 0.2); break;
      case 'pour': burst(bp(1500, 1), 0.4, 0.3); break;
      case 'win': [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.5, 0.25, i * 0.14)); break;
      case 'fail': [392, 330, 262].forEach((f, i) => tone('triangle', f, f * 0.98, 0.45, 0.25, i * 0.2)); break;
      case 'heartbeat': tone('sine', 60, 40, 0.12, 0.8); tone('sine', 55, 38, 0.12, 0.6, 0.22); break;
      case 'snore': { const n = this.noiseSrc(true, false); const f = lp(300); const g = ctx.createGain(); n.connect(f); f.connect(g); g.connect(out); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.6, t + 0.8); g.gain.linearRampToValueAtTime(0.0001, t + 1.8); n.start(t); n.stop(t + 2); break; }
      case 'backfire': burst(lp(900), 0.18, 1.3); tone('sine', 70, 40, 0.15, 0.9); break;
      default: break;
    }
  }

  // Continuous loops keyed by name; call loop(name, gain) every frame, gain 0 stops.
  loop(name, gain, opts = {}) {
    if (!this.enabled) return;
    let L = this.loops.get(name);
    if (!L) {
      if (gain <= 0.001) return;
      L = this.makeLoop(name, opts);
      if (!L) return;
      this.loops.set(name, L);
    }
    const t = this.ctx.currentTime;
    L.gain.gain.setTargetAtTime(gain, t, 0.05);
    if (opts.pos && L.panner) this.setPos(L.panner, opts.pos);
    if (L.update) L.update(opts);
  }

  makeLoop(name) {
    const ctx = this.ctx;
    const gain = ctx.createGain(); gain.gain.value = 0;
    let panner = null;
    gain.connect(this.sfx);
    const L = { gain, panner };
    const f = ctx.createBiquadFilter();
    switch (name) {
      case 'shower': case 'tap': { const n = this.noiseSrc(); f.type = 'bandpass'; f.frequency.value = name === 'tap' ? 2500 : 4000; f.Q.value = 0.4; n.connect(f); f.connect(gain); n.start(); break; }
      case 'pee': { const n = this.noiseSrc(); f.type = 'bandpass'; f.frequency.value = 3000; f.Q.value = 1.5; n.connect(f); f.connect(gain); n.start(); break; }
      case 'pouring': { const n = this.noiseSrc(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2; const lfo = ctx.createOscillator(); lfo.frequency.value = 9; const lg = ctx.createGain(); lg.gain.value = 300; lfo.connect(lg); lg.connect(f.frequency); lfo.start(); n.connect(f); f.connect(gain); n.start(); break; }
      case 'wind': { const n = this.noiseSrc(true); f.type = 'lowpass'; f.frequency.value = 500; n.connect(f); f.connect(gain); n.start(); L.update = (o) => { f.frequency.setTargetAtTime(300 + (o.speed || 0) * 40, ctx.currentTime, 0.2); }; break; }
      case 'skid': { const n = this.noiseSrc(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 3; n.connect(f); f.connect(gain); n.start(); break; }
      case 'gravel': { const n = this.noiseSrc(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.6; const am = ctx.createGain(); const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 23; const lg = ctx.createGain(); lg.gain.value = 0.4; lfo.connect(lg); lg.connect(am.gain); am.gain.value = 0.6; lfo.start(); n.connect(f); f.connect(am); am.connect(gain); n.start(); break; }
      case 'fire': { const n = this.noiseSrc(true); f.type = 'lowpass'; f.frequency.value = 800; n.connect(f); f.connect(gain); n.start(); const c = this.noiseSrc(); const cf = ctx.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = 5000; const cg = ctx.createGain(); cg.gain.value = 0.15; c.connect(cf); cf.connect(cg); cg.connect(gain); c.start(); break; }
      case 'horn': { const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 415; const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 523; f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 1.2; o1.connect(f); o2.connect(f); f.connect(gain); o1.start(); o2.start(); break; }
      case 'charger': { const o = ctx.createOscillator(); o.frequency.value = 100; o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 400; o.connect(f); f.connect(gain); o.start(); break; }
      default: return null;
    }
    return L;
  }

  stopAllLoops() {
    for (const L of this.loops.values()) L.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  // Engine voice: firing-frequency oscillators, exhaust noise and a rough idle.
  createEngine({ cylinders = 4, character = 1 } = {}) {
    const E = { rpm: 0, alive: false, update: () => {}, starter: () => {}, dispose: () => {} };
    if (!this.enabled) return E;
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0;
    const panner = this.panner();
    panner.refDistance = 4;
    out.connect(panner); panner.connect(this.sfx);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.6); }
    shaper.curve = curve;
    const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 800; lpf.Q.value = 2;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const o3 = ctx.createOscillator(); o3.type = 'sawtooth';
    const g1 = ctx.createGain(); g1.gain.value = 0.5;
    const g2 = ctx.createGain(); g2.gain.value = 0.28;
    const g3 = ctx.createGain(); g3.gain.value = 0.2;
    o1.connect(g1); o2.connect(g2); o3.connect(g3);
    const mix = ctx.createGain();
    g1.connect(mix); g2.connect(mix); g3.connect(mix);
    // putt modulation
    const am = ctx.createGain(); am.gain.value = 0.7;
    const lfo = ctx.createOscillator(); lfo.type = 'sine';
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.3;
    lfo.connect(lfoG); lfoG.connect(am.gain);
    mix.connect(am); am.connect(shaper); shaper.connect(lpf); lpf.connect(out);
    // exhaust noise
    const n = this.noiseSrc(true);
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 300; nf.Q.value = 0.9;
    const ng = ctx.createGain(); ng.gain.value = 0.3;
    n.connect(nf); nf.connect(ng); ng.connect(out);
    // intake whine
    const hiss = this.noiseSrc();
    const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 2400; hf.Q.value = 1.5;
    const hg = ctx.createGain(); hg.gain.value = 0;
    hiss.connect(hf); hf.connect(hg); hg.connect(out);
    // starter motor
    const st = ctx.createOscillator(); st.type = 'sawtooth'; st.frequency.value = 55;
    const stAm = ctx.createGain(); stAm.gain.value = 0;
    const stL = ctx.createOscillator(); stL.frequency.value = 9; const stLg = ctx.createGain(); stLg.gain.value = 0.5;
    stL.connect(stLg); stLg.connect(stAm.gain);
    const stF = ctx.createBiquadFilter(); stF.type = 'bandpass'; stF.frequency.value = 500; stF.Q.value = 1;
    const stOut = ctx.createGain(); stOut.gain.value = 0;
    st.connect(stF); stF.connect(stAm); stAm.connect(stOut); stOut.connect(panner);
    [o1, o2, o3, lfo, n, hiss, st, stL].forEach((o) => o.start());

    E.alive = true;
    E.update = ({ rpm, throttle, running, loud = 0, rough = 0, pos, inside = false, cranking = false, crankRate = 1 }) => {
      const t = ctx.currentTime;
      const fire = Math.max(8, (rpm / 60) * (cylinders / 2)) * character;
      o1.frequency.setTargetAtTime(fire, t, 0.03);
      o2.frequency.setTargetAtTime(fire * 0.5, t, 0.03);
      o3.frequency.setTargetAtTime(fire * 1.01 + 1.5, t, 0.03);
      lfo.frequency.setTargetAtTime(fire * (0.5 + rough * 0.12), t, 0.03);
      lfoG.gain.setTargetAtTime(0.25 + rough * 0.5, t, 0.1);
      lpf.frequency.setTargetAtTime(350 + throttle * 1400 + rpm * 0.12 + loud * 1500, t, 0.05);
      nf.frequency.setTargetAtTime(160 + rpm * 0.05, t, 0.05);
      ng.gain.setTargetAtTime(0.2 + throttle * 0.3 + loud * 0.6, t, 0.05);
      hg.gain.setTargetAtTime(throttle * 0.05 * (rpm / 5000), t, 0.05);
      const base = running ? (0.18 + throttle * 0.22 + rpm / 22000) * (1 + loud * 1.3) : 0;
      out.gain.setTargetAtTime(base * (inside ? 0.7 : 1), t, running ? 0.05 : 0.25);
      stOut.gain.setTargetAtTime(cranking ? 0.35 : 0, t, 0.03);
      stL.frequency.setTargetAtTime(7 * crankRate, t, 0.1);
      if (pos) this.setPos(panner, pos);
    };
    E.dispose = () => { try { [o1, o2, o3, lfo, n, hiss, st, stL].forEach((o) => o.stop()); out.disconnect(); stOut.disconnect(); } catch (e) { /* ignore */ } E.alive = false; };
    this.engines.push(E);
    return E;
  }

  // ---------- Ambience ----------
  startAmbience() {
    const ctx = this.ctx;
    // soft wind in the trees
    const n = this.noiseSrc(true);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.12;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 0.06;
    lfo.connect(lg); lg.connect(this.windGain.gain);
    n.connect(f); f.connect(this.windGain); this.windGain.connect(this.amb);
    n.start(); lfo.start();
    // lake lapping
    const w = this.noiseSrc(true);
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 350; wf.Q.value = 0.7;
    this.lakeGain = ctx.createGain(); this.lakeGain.gain.value = 0;
    const wl = ctx.createOscillator(); wl.frequency.value = 0.45; const wlg = ctx.createGain(); wlg.gain.value = 0.5;
    const wam = ctx.createGain(); wam.gain.value = 0.6;
    wl.connect(wlg); wlg.connect(wam.gain);
    w.connect(wf); wf.connect(wam); wam.connect(this.lakeGain); this.lakeGain.connect(this.amb);
    w.start(); wl.start();
    this.birdTimer = 1;
    this.crakeTimer = 5;
  }

  updateAmbience(dt, { daylight, nearWater, indoors, hour }) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(indoors ? 0.04 : 0.12, t, 0.5);
    this.lakeGain.gain.setTargetAtTime(indoors ? 0 : Math.max(0, 1 - nearWater / 40) * 0.5, t, 0.5);
    this.birdTimer -= dt;
    const dawnChorus = hour > 3 && hour < 9 ? 1.8 : 1;
    if (this.birdTimer <= 0) {
      this.birdTimer = (0.6 + Math.random() * 3) / dawnChorus;
      if (daylight > 0.35 && !indoors) this.bird();
    }
    this.crakeTimer -= dt;
    if (this.crakeTimer <= 0) {
      this.crakeTimer = 4 + Math.random() * 6;
      if ((hour > 22 || hour < 3.5) && !indoors) this.corncrake();
    }
  }

  bird() {
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = 0.05 + Math.random() * 0.06;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = Math.random() * 2 - 1; out.connect(p); p.connect(this.amb); } else out.connect(this.amb);
    const kind = Math.random();
    const notes = kind < 0.4 ? 3 + Math.floor(Math.random() * 5) : kind < 0.75 ? 2 : 6 + Math.floor(Math.random() * 6);
    const base = 2200 + Math.random() * 2600;
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator(); o.type = 'sine';
      const g = ctx.createGain();
      const st = t + i * (kind < 0.75 ? 0.13 : 0.06);
      const f0 = base * (1 + (Math.random() - 0.5) * 0.3);
      o.frequency.setValueAtTime(f0, st);
      o.frequency.exponentialRampToValueAtTime(f0 * (kind < 0.4 ? 1.4 : 0.7), st + 0.07);
      g.gain.setValueAtTime(0.0001, st); g.gain.linearRampToValueAtTime(1, st + 0.01); g.gain.exponentialRampToValueAtTime(0.001, st + 0.09);
      o.connect(g); g.connect(out);
      o.start(st); o.stop(st + 0.12);
    }
  }

  // The corncrake's rasping "crex crex" — the sound of a Finnish summer night.
  corncrake() {
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = 0.06;
    out.connect(this.amb);
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 2; k++) {
        const st = t + r * 0.5 + k * 0.2;
        for (let i = 0; i < 6; i++) {
          const n = this.noiseSrc(false, false);
          const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2800; f.Q.value = 4;
          const g = ctx.createGain();
          const s = st + i * 0.018;
          g.gain.setValueAtTime(0.0001, s); g.gain.linearRampToValueAtTime(1, s + 0.003); g.gain.exponentialRampToValueAtTime(0.001, s + 0.014);
          n.connect(f); f.connect(g); g.connect(out);
          n.start(s); n.stop(s + 0.02);
        }
      }
    }
  }

  // ---------- Humppa radio ----------
  // A tiny sequencer: oompah bass, off-beat chords and an accordion-ish melody.
  startRadio(pos) {
    if (!this.enabled) return null;
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0.22;
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 1400; band.Q.value = 0.5;
    const p = this.panner(pos); p.refDistance = 2;
    out.connect(band); band.connect(p); p.connect(this.sfx);
    const hissN = this.noiseSrc(); const hg = ctx.createGain(); hg.gain.value = 0.015; hissN.connect(hg); hg.connect(band); hissN.start();
    const R = { out, panner: p, next: ctx.currentTime + 0.1, step: 0, stop: null, on: true };
    const bpm = 150; const sixteenth = 60 / bpm / 2;
    const prog = [[0, 4, 7], [0, 4, 7], [7, 11, 14], [7, 11, 14], [5, 9, 12], [5, 9, 12], [7, 11, 14], [0, 4, 7]];
    const root = 196; // G3
    const hz = (semi, oct = 0) => root * Math.pow(2, semi / 12 + oct);
    let melodyNote = 7;
    const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];
    const voice = (type, f, st, dur, vol, det = 0) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, st); g.gain.linearRampToValueAtTime(vol, st + 0.01); g.gain.exponentialRampToValueAtTime(0.001, st + dur);
      o.connect(g); g.connect(out); o.start(st); o.stop(st + dur + 0.02);
    };
    const tick = () => {
      if (!R.on) return;
      const now = ctx.currentTime;
      while (R.next < now + 0.3) {
        const s = R.step;
        const bar = Math.floor(s / 8) % prog.length;
        const chord = prog[bar];
        const beat = s % 8;
        const st = R.next;
        if (beat === 0 || beat === 4) voice('triangle', hz(chord[0] + (beat === 4 ? 7 : 0), -1), st, 0.25, 0.9);
        if (beat === 2 || beat === 6) chord.forEach((c) => voice('square', hz(c), st, 0.12, 0.12));
        if (beat % 2 === 0 || Math.random() < 0.4) {
          if (Math.random() < 0.7) {
            const idx = scale.indexOf(melodyNote);
            let ni = Math.max(0, Math.min(scale.length - 1, (idx < 0 ? 4 : idx) + Math.floor(Math.random() * 5) - 2));
            if (beat === 0) { const tgt = chord[Math.floor(Math.random() * 3)] + 12; ni = scale.indexOf(tgt % 24) >= 0 ? scale.indexOf(tgt % 24) : ni; }
            melodyNote = scale[ni];
            voice('sawtooth', hz(melodyNote, 1), st, sixteenth * 1.8, 0.1, -6);
            voice('sawtooth', hz(melodyNote, 1), st, sixteenth * 1.8, 0.1, 7);
          }
        }
        if (beat === 2 || beat === 6) { const n = this.noiseSrc(false, false); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000; const g = ctx.createGain(); g.gain.setValueAtTime(0.25, st); g.gain.exponentialRampToValueAtTime(0.001, st + 0.05); n.connect(f); f.connect(g); g.connect(out); n.start(st); n.stop(st + 0.06); }
        R.next += sixteenth;
        R.step++;
      }
    };
    const id = setInterval(tick, 100);
    R.stop = () => { R.on = false; clearInterval(id); try { hissN.stop(); } catch (e) { /* ignore */ } out.gain.setTargetAtTime(0, ctx.currentTime, 0.05); setTimeout(() => { try { out.disconnect(); } catch (e) { /* ignore */ } }, 500); };
    R.setPos = (v) => this.setPos(p, v);
    return R;
  }
}
