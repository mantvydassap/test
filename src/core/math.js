export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

// Distance from point to segment in XZ, returns {d, t}
export function distToSegment2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t, cz = az + dz * t;
  const ex = px - cx, ez = pz - cz;
  return { d: Math.sqrt(ex * ex + ez * ez), t };
}

// Finnish-style number formatting: 1 234,50
export function fmtMoney(v) {
  const neg = v < 0;
  const total = Math.round(Math.abs(v) * 100);
  const whole = Math.floor(total / 100);
  const cents = total % 100;
  const w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (neg ? '-' : '') + w + ',' + String(cents).padStart(2, '0') + ' mk';
}
