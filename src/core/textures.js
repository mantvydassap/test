import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { makeNoise2D, fbm } from './noise.js';

// All textures are painted at load time on canvases, so the game ships no image files.

let maxAniso = 4;
export function setMaxAnisotropy(v) { maxAniso = v; }

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTexture(canvas, { repeat = true, srgb = true, aniso = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (aniso) t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

function speckle(ctx, w, h, rand, count, colors, sizeMin = 1, sizeMax = 2, alpha = 1) {
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    const s = sizeMin + rand() * (sizeMax - sizeMin);
    ctx.fillRect(rand() * w, rand() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

// Tileable value field using noise sampled on a torus.
function tileNoise(noise, u, v, scale) {
  const a = u * Math.PI * 2, b = v * Math.PI * 2;
  const r = scale / (Math.PI * 2);
  return noise(Math.cos(a) * r + Math.cos(b) * r * 0.37, Math.sin(a) * r + Math.sin(b) * r * 0.37 + Math.cos(b) * r);
}

function noiseFill(ctx, w, h, seed, base, amp, scale = 6) {
  const noise = makeNoise2D(seed);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = tileNoise(noise, x / w, y / h, scale) * 0.6 + tileNoise(noise, x / w, y / h, scale * 4) * 0.4;
      const i = (y * w + x) * 4;
      d[i] = Math.max(0, Math.min(255, base[0] + n * amp));
      d[i + 1] = Math.max(0, Math.min(255, base[1] + n * amp));
      d[i + 2] = Math.max(0, Math.min(255, base[2] + n * amp));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

const cache = new Map();
function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

export function grassTexture() {
  return cached('grass', () => {
    const c = makeCanvas(256, 256); const ctx = c.getContext('2d');
    const rand = mulberry32(11);
    noiseFill(ctx, 256, 256, 3, [196, 200, 190], 40, 5);
    speckle(ctx, 256, 256, rand, 2600, ['#d8dccb', '#a9b39c', '#c4c9a8', '#8f9a84', '#e6e2c6'], 1, 3, 0.55);
    // blades
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 900; i++) {
      const x = rand() * 256, y = rand() * 256;
      ctx.strokeStyle = rand() < 0.5 ? '#eef0dc' : '#7f8c74';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rand() - 0.5) * 3, y - 3 - rand() * 5); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return toTexture(c);
  });
}

export function asphaltTexture() {
  return cached('asphalt', () => {
    const w = 128, h = 512;
    const c = makeCanvas(w, h); const ctx = c.getContext('2d');
    const rand = mulberry32(21);
    noiseFill(ctx, w, h, 7, [74, 74, 72], 16, 8);
    speckle(ctx, w, h, rand, 5000, ['#5a5a58', '#8a8986', '#3c3c3b', '#6e6c68'], 1, 2, 0.8);
    // wear tracks
    ctx.globalAlpha = 0.10; ctx.fillStyle = '#20201f';
    for (const u of [0.2, 0.34, 0.66, 0.8]) ctx.fillRect(u * w - 5, 0, 10, h);
    ctx.globalAlpha = 1;
    // edge lines (white, solid)
    ctx.fillStyle = '#d9d6cc';
    ctx.fillRect(3, 0, 3, h); ctx.fillRect(w - 6, 0, 3, h);
    // centre line: yellow dashes, as on 1970s Finnish main roads
    ctx.fillStyle = '#d6a92c';
    ctx.fillRect(w / 2 - 2, 0, 4, h * 0.3);
    // worn paint
    speckle(ctx, w, h, rand, 700, ['#4a4a48'], 1, 2, 0.9);
    return toTexture(c);
  });
}

export function gravelTexture() {
  return cached('gravel', () => {
    const w = 128, h = 256;
    const c = makeCanvas(w, h); const ctx = c.getContext('2d');
    const rand = mulberry32(31);
    noiseFill(ctx, w, h, 9, [134, 120, 98], 22, 6);
    speckle(ctx, w, h, rand, 4200, ['#a39479', '#6f6250', '#c2b59b', '#5c5244', '#8d8068'], 1, 3, 0.85);
    // ruts
    ctx.globalAlpha = 0.18; ctx.fillStyle = '#4a4034';
    ctx.fillRect(w * 0.26 - 7, 0, 14, h); ctx.fillRect(w * 0.74 - 7, 0, 14, h);
    ctx.globalAlpha = 0.14; ctx.fillStyle = '#6b8a4a';
    ctx.fillRect(w * 0.5 - 6, 0, 12, h); // grass strip in the middle
    ctx.fillRect(0, 0, 6, h); ctx.fillRect(w - 6, 0, 6, h);
    ctx.globalAlpha = 1;
    return toTexture(c);
  });
}

export function woodBoardTexture(color = '#8e2f22', seed = 41) {
  return cached('boards' + color, () => {
    const w = 256, h = 256;
    const c = makeCanvas(w, h); const ctx = c.getContext('2d');
    const rand = mulberry32(seed);
    ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
    const boards = 8;
    for (let i = 0; i < boards; i++) {
      const x = (i / boards) * w;
      ctx.fillStyle = `rgba(0,0,0,${0.05 + rand() * 0.1})`;
      ctx.fillRect(x, 0, w / boards, h);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x, 0, 2, h);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(x + 2, 0, 2, h);
      // grain
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      for (let g = 0; g < 6; g++) {
        const gx = x + 4 + rand() * (w / boards - 8);
        ctx.beginPath(); ctx.moveTo(gx, 0);
        for (let y = 0; y <= h; y += 16) ctx.lineTo(gx + Math.sin(y * 0.05 + g) * 1.5, y);
        ctx.stroke();
      }
    }
    speckle(ctx, w, h, rand, 900, ['rgba(255,255,255,0.12)', 'rgba(0,0,0,0.15)'], 1, 2);
    return toTexture(c);
  });
}

export function logWallTexture() {
  return cached('logs', () => {
    const w = 256, h = 256;
    const c = makeCanvas(w, h); const ctx = c.getContext('2d');
    const rand = mulberry32(51);
    const logs = 8;
    for (let i = 0; i < logs; i++) {
      const y = (i / logs) * h, lh = h / logs;
      const g = ctx.createLinearGradient(0, y, 0, y + lh);
      g.addColorStop(0, '#3a2a1c'); g.addColorStop(0.2, '#6b5037'); g.addColorStop(0.55, '#7a5c40'); g.addColorStop(1, '#2b1f15');
      ctx.fillStyle = g; ctx.fillRect(0, y, w, lh);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      for (let k = 0; k < 5; k++) {
        const yy = y + 4 + rand() * (lh - 8);
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy + (rand() - 0.5) * 3); ctx.stroke();
      }
    }
    speckle(ctx, w, h, rand, 600, ['rgba(0,0,0,0.25)', 'rgba(255,230,200,0.08)'], 1, 3);
    return toTexture(c);
  });
}

export function tinRoofTexture(color = '#2f3432') {
  return cached('roof' + color, () => {
    const w = 128, h = 128;
    const c = makeCanvas(w, h); const ctx = c.getContext('2d');
    ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      const g = ctx.createLinearGradient(x, 0, x + 16, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(0.5, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = g; ctx.fillRect(x, 0, 16, h);
    }
    const rand = mulberry32(61);
    speckle(ctx, w, h, rand, 300, ['rgba(120,70,40,0.25)', 'rgba(0,0,0,0.2)'], 1, 3);
    return toTexture(c);
  });
}

export function concreteTexture() {
  return cached('concrete', () => {
    const w = 256, h = 256;
    const c = makeCanvas(w, h); const ctx = c.getContext('2d');
    const rand = mulberry32(71);
    noiseFill(ctx, w, h, 13, [150, 148, 142], 18, 4);
    speckle(ctx, w, h, rand, 2000, ['#8c8a84', '#b3b0a8', '#6f6d68'], 1, 2, 0.6);
    // oil stains
    for (let i = 0; i < 5; i++) {
      const x = rand() * w, y = rand() * h, r = 10 + rand() * 30;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(30,26,20,0.35)'); g.addColorStop(1, 'rgba(30,26,20,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return toTexture(c);
  });
}

export function floorBoardTexture() {
  return cached('floorboards', () => {
    const w = 256, h = 256;
    const c = makeCanvas(w, h); const ctx = c.getContext('2d');
    const rand = mulberry32(81);
    for (let i = 0; i < 6; i++) {
      const y = (i / 6) * h;
      const t = 0.85 + rand() * 0.2;
      ctx.fillStyle = `rgb(${Math.floor(168 * t)},${Math.floor(128 * t)},${Math.floor(84 * t)})`;
      ctx.fillRect(0, y, w, h / 6);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, y, w, 1.5);
      const cut = rand() * w;
      ctx.fillRect(cut, y, 1.5, h / 6);
      ctx.strokeStyle = 'rgba(60,30,10,0.15)';
      for (let g = 0; g < 5; g++) {
        const gy = y + 3 + rand() * (h / 6 - 6);
        ctx.beginPath(); ctx.moveTo(0, gy);
        for (let x = 0; x <= w; x += 16) ctx.lineTo(x, gy + Math.sin(x * 0.04 + g * 2) * 1.2);
        ctx.stroke();
      }
    }
    return toTexture(c);
  });
}

export function tileTexture(color = '#e8e6df', grout = '#9a978f') {
  return cached('tiles' + color, () => {
    const w = 128, h = 128;
    const c = makeCanvas(w, h); const ctx = c.getContext('2d');
    ctx.fillStyle = grout; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) ctx.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
    return toTexture(c);
  });
}

export function wallpaperTexture() {
  return cached('wallpaper', () => {
    const w = 128, h = 128;
    const c = makeCanvas(w, h); const ctx = c.getContext('2d');
    ctx.fillStyle = '#c9b98a'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#a8904f'; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      for (let y = 0; y <= h; y += 4) ctx.lineTo(i * 32 + 16 + Math.sin(y / h * Math.PI * 4) * 8, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#8a6b3a';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      ctx.beginPath(); ctx.arc(x * 32 + ((y % 2) ? 0 : 16), y * 32 + 16, 3, 0, Math.PI * 2); ctx.fill();
    }
    return toTexture(c);
  });
}

export function barkTexture() {
  return cached('bark', () => {
    const w = 64, h = 128;
    const c = makeCanvas(w, h); const ctx = c.getContext('2d');
    const rand = mulberry32(91);
    noiseFill(ctx, w, h, 17, [210, 210, 210], 30, 4);
    speckle(ctx, w, h, rand, 120, ['#222'], 2, 8, 0.7);
    return toTexture(c);
  });
}

// Normal map for water ripples.
export function waterNormalTexture() {
  return cached('waternormal', () => {
    const w = 256, h = 256;
    const noise = makeNoise2D(101);
    const heights = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      heights[y * w + x] = tileNoise(noise, x / w, y / h, 10) * 0.6 + tileNoise(noise, x / w, y / h, 24) * 0.4;
    }
    const c = makeCanvas(w, h); const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const hl = heights[y * w + ((x - 1 + w) % w)], hr = heights[y * w + ((x + 1) % w)];
      const hd = heights[((y - 1 + h) % h) * w + x], hu = heights[((y + 1) % h) * w + x];
      let nx = (hl - hr) * 2.5, ny = (hd - hu) * 2.5, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(c, { srgb: false });
  });
}

// Text on a panel: signs, labels, number plates.
export function textTexture(lines, opts = {}) {
  const {
    width = 256, height = 128, bg = '#f2efe6', fg = '#1b1a17', font = 'bold 48px "Barlow Condensed", Arial Narrow, sans-serif',
    border = null, borderWidth = 6, sub = null, subFont = '22px "Barlow Condensed", Arial Narrow, sans-serif', align = 'center', stripes = null,
  } = opts;
  const key = 'txt:' + JSON.stringify([lines, width, height, bg, fg, font, border, sub, stripes]);
  return cached(key, () => {
    const c = makeCanvas(width, height); const ctx = c.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
    if (stripes) {
      ctx.fillStyle = stripes;
      ctx.fillRect(0, height * 0.78, width, height * 0.08);
    }
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = borderWidth; ctx.strokeRect(borderWidth / 2 + 2, borderWidth / 2 + 2, width - borderWidth - 4, height - borderWidth - 4); }
    ctx.fillStyle = fg; ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'middle';
    const arr = Array.isArray(lines) ? lines : [lines];
    const lh = height / (arr.length + (sub ? 0.6 : 0));
    arr.forEach((ln, i) => ctx.fillText(ln, align === 'center' ? width / 2 : 12, lh * (i + 0.5)));
    if (sub) { ctx.font = subFont; ctx.fillText(sub, width / 2, height - lh * 0.35); }
    return toTexture(c, { repeat: false });
  });
}

export function plateTexture(text) {
  // 1970s Finnish plates: black with silver-white characters
  return textTexture(text, { width: 256, height: 64, bg: '#141414', fg: '#e9e7e0', font: 'bold 44px "IBM Plex Mono", monospace', border: '#bdbab1', borderWidth: 4 });
}

// Product label with a coloured band and product name.
export function labelTexture(name, color, sub = '', fg = '#fff') {
  const key = 'label:' + name + color + sub;
  return cached(key, () => {
    const w = 256, h = 256;
    const c = makeCanvas(w, h); const ctx = c.getContext('2d');
    ctx.fillStyle = '#efe9da'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color; ctx.fillRect(0, h * 0.25, w, h * 0.5);
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 54px "Barlow Condensed", Arial Narrow, sans-serif';
    ctx.fillText(name, w / 2, h * 0.47);
    if (sub) { ctx.font = '26px "Barlow Condensed", Arial Narrow, sans-serif'; ctx.fillStyle = '#2a2723'; ctx.fillText(sub, w / 2, h * 0.87); }
    return toTexture(c, { repeat: false });
  });
}

export function smokeTexture() {
  return cached('smoke', () => {
    const c = makeCanvas(64, 64); const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    return toTexture(c, { repeat: false });
  });
}

export function fieldTexture() {
  return cached('field', () => {
    const w = 128, h = 128;
    const c = makeCanvas(w, h); const ctx = c.getContext('2d');
    const rand = mulberry32(111);
    ctx.fillStyle = '#d8d0a0'; ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) {
      ctx.fillStyle = 'rgba(80,70,20,0.18)'; ctx.fillRect(x, 0, 3, h);
    }
    speckle(ctx, w, h, rand, 1500, ['rgba(255,250,210,0.5)', 'rgba(90,80,30,0.3)'], 1, 2);
    return toTexture(c);
  });
}

export { fbm };
