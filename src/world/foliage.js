import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

// Painted, alpha-cut foliage textures. Each tree atlas keeps foliage in u 0..0.86
// and a solid bark strip in u 0.88..1, so one material covers trunk and crown.
export const FOL_U = 0.86;
const BARK_U0 = 0.885, BARK_U1 = 0.995;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

function barkStrip(ctx, S, base, dark, rand, birch = false) {
  const x0 = Math.floor(S * 0.875);
  ctx.fillStyle = base; ctx.fillRect(x0, 0, S - x0, S);
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = dark;
    const w = birch ? 3 + rand() * 12 : 1 + rand() * 3;
    const h = birch ? 1 + rand() * 3 : 6 + rand() * 20;
    ctx.globalAlpha = birch ? 0.9 : 0.5;
    ctx.fillRect(x0 + rand() * (S - x0), rand() * S, w, h);
  }
  ctx.globalAlpha = 1;
}

// One drooping spruce sprig with needles.
function sprig(ctx, x, y, len, ang, rand, cols) {
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
  ctx.strokeStyle = cols[0]; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
  const n = Math.floor(len / 2.2);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const px = x + (ex - x) * t, py = y + (ey - y) * t;
    const nl = (1 - t * 0.5) * (4 + rand() * 3);
    ctx.strokeStyle = cols[1 + Math.floor(rand() * (cols.length - 1))];
    ctx.lineWidth = 1.1;
    for (const side of [-1, 1]) {
      const a = ang + side * (0.9 + rand() * 0.4) + 0.35;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * nl, py + Math.sin(a) * nl); ctx.stroke();
    }
  }
}

export function spruceAtlas() {
  const S = 256, W = Math.floor(S * FOL_U);
  const c = canvas(S, S); const ctx = c.getContext('2d');
  const rand = mulberry32(3301);
  // dense dark core with a ragged lower edge
  ctx.fillStyle = '#132016';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0);
  for (let x = W; x >= 0; x -= 6) ctx.lineTo(x, 150 + rand() * 45);
  ctx.closePath(); ctx.fill();
  const cols = ['#2a3322', '#22402a', '#2d4a2c', '#1b3322', '#3a5634', '#2a472b'];
  for (let i = 0; i < 520; i++) {
    const x = rand() * W, y = rand() * 205;
    const len = 18 + rand() * 30;
    const ang = Math.PI * (0.35 + rand() * 0.3) + (rand() < 0.5 ? -0.5 : 0.5) * 0.6;
    sprig(ctx, x, y, len, ang, rand, cols);
    // wrap across the seam
    if (x < 30) sprig(ctx, x + W, y, len, ang, rand, cols);
    if (x > W - 30) sprig(ctx, x - W, y, len, ang, rand, cols);
  }
  // lighter tips catching the sun
  ctx.globalAlpha = 0.45;
  for (let i = 0; i < 260; i++) { ctx.fillStyle = rand() < 0.5 ? '#557a44' : '#6a8a4c'; ctx.fillRect(rand() * W, rand() * 200, 2, 2); }
  ctx.globalAlpha = 1;
  ctx.clearRect(W, 0, S - W, S);
  barkStrip(ctx, S, '#4a3526', '#221810', rand);
  return tex(c);
}

export function pineAtlas() {
  const S = 256, W = Math.floor(S * FOL_U);
  const c = canvas(S, S); const ctx = c.getContext('2d');
  const rand = mulberry32(4411);
  const cols = ['#2f4a26', '#3d5a2c', '#4a6a34', '#26401f', '#5a7a3c'];
  // needle tufts clustered in a cloud
  for (let k = 0; k < 42; k++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 0.36;
    const cx = W / 2 + Math.cos(a) * r * W, cy = S * 0.5 + Math.sin(a) * r * S * 0.75;
    const n = 26 + Math.floor(rand() * 18);
    for (let i = 0; i < n; i++) {
      const b = rand() * Math.PI * 2, l = 8 + rand() * 16;
      ctx.strokeStyle = cols[Math.floor(rand() * cols.length)]; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(b) * l, cy + Math.sin(b) * l * 0.8); ctx.stroke();
    }
  }
  ctx.clearRect(W, 0, S - W, S);
  barkStrip(ctx, S, '#9a5a34', '#4a2a18', rand);
  return tex(c);
}

export function birchAtlas() {
  const S = 256, W = Math.floor(S * FOL_U);
  const c = canvas(S, S); const ctx = c.getContext('2d');
  const rand = mulberry32(5521);
  const cols = ['#5f8a35', '#6f9a3c', '#7fa845', '#4f7a2e', '#8db250', '#577f31'];
  for (let i = 0; i < 1500; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 0.47;
    const x = W / 2 + Math.cos(a) * r * W, y = S / 2 + Math.sin(a) * r * S;
    ctx.fillStyle = cols[Math.floor(rand() * cols.length)];
    ctx.beginPath(); ctx.ellipse(x, y, 3 + rand() * 2.5, 2 + rand() * 1.6, rand() * 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.clearRect(W, 0, S - W, S);
  barkStrip(ctx, S, '#e4e0d5', '#2b2a26', rand, true);
  return tex(c);
}

export function grassClumpTexture() {
  const c = canvas(128, 128); const ctx = c.getContext('2d');
  const rand = mulberry32(6631);
  for (let i = 0; i < 70; i++) {
    const x = 10 + rand() * 108, h = 50 + rand() * 76, lean = (rand() - 0.5) * 30;
    const g = ctx.createLinearGradient(0, 128, 0, 128 - h);
    const tone = 0.8 + rand() * 0.4;
    g.addColorStop(0, rgb(60 * tone, 82 * tone, 32 * tone)); g.addColorStop(0.6, rgb(110 * tone, 140 * tone, 58 * tone)); g.addColorStop(1, rgb(170 * tone, 180 * tone, 100 * tone));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x - 2.5, 128); ctx.quadraticCurveTo(x + lean * 0.3, 128 - h * 0.6, x + lean, 128 - h); ctx.quadraticCurveTo(x + lean * 0.3 + 1, 128 - h * 0.6, x + 2.5, 128); ctx.fill();
  }
  // a few meadow flowers
  for (let i = 0; i < 4; i++) { ctx.fillStyle = rand() < 0.5 ? '#f2f0e0' : '#e8c84a'; ctx.beginPath(); ctx.arc(20 + rand() * 88, 30 + rand() * 40, 2.5, 0, Math.PI * 2); ctx.fill(); }
  return tex(c);
}

// ---------------------------------------------------------------- geometry helpers
// Map a geometry's uvs into the foliage or bark region of the atlas.
export function toFoliageUV(g) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * FOL_U);
  return g;
}
export function toBarkUV(g) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, BARK_U0 + uv.getX(i) * (BARK_U1 - BARK_U0));
  return g;
}

// A vertical card whose normals point away from a crown centre (soft, rounded lighting).
export function card(w, h, x, y, z, yaw, tilt, centre) {
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateX(tilt);
  g.rotateY(yaw);
  g.translate(x, y, z);
  toFoliageUV(g);
  const p = g.attributes.position, n = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i) - centre.x, (p.getY(i) - centre.y) * 0.6 + 0.4, p.getZ(i) - centre.z).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

// Light both sides of a foliage card as if it were the front (no black backs).
export function twoSidedLighting(mat, extra) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;'));
    if (extra) extra(shader);
  };
  return mat;
}
