import * as THREE from 'three';
import { clamp, lerp } from '../core/math.js';

// Sun path for about 62°N in early July: the sun dips only a few degrees below
// the horizon at night, so the summer night never gets fully dark.
const LAT = THREE.MathUtils.degToRad(62);
const DEC = THREE.MathUtils.degToRad(22.5);
const SOLAR_NOON = 13.3;

export function sunDirection(hours, out = new THREE.Vector3()) {
  const H = ((hours - SOLAR_NOON) / 24) * Math.PI * 2;
  const east = -Math.cos(DEC) * Math.sin(H);
  const up = Math.sin(LAT) * Math.sin(DEC) + Math.cos(LAT) * Math.cos(DEC) * Math.cos(H);
  const north = Math.cos(LAT) * Math.sin(DEC) - Math.sin(LAT) * Math.cos(DEC) * Math.cos(H);
  return out.set(east, up, -north).normalize();
}

const KEYS = [
  { el: -9, zen: '#131d33', hor: '#3c435a', fog: '#2e3548', sun: '#ff8a55', si: 0.0, hemi: 0.22, hsky: '#2d3a5c', hgr: '#16170f', cloud: 0.18 },
  { el: -4, zen: '#243457', hor: '#8a7c86', fog: '#5f5d6c', sun: '#ff8a55', si: 0.0, hemi: 0.34, hsky: '#43507a', hgr: '#1e1f16', cloud: 0.35 },
  { el: 0, zen: '#35518a', hor: '#e39a6c', fog: '#a58676', sun: '#ff9a5c', si: 0.5, hemi: 0.5, hsky: '#6b7aa6', hgr: '#2b2a1c', cloud: 0.6 },
  { el: 5, zen: '#4468a6', hor: '#f0bb8c', fog: '#c2a893', sun: '#ffc08a', si: 1.6, hemi: 0.72, hsky: '#90a3c8', hgr: '#3a3622', cloud: 0.85 },
  { el: 14, zen: '#4876b8', hor: '#d6d3c4', fog: '#b7bdbc', sun: '#ffe2bd', si: 2.5, hemi: 0.95, hsky: '#a9bfdc', hgr: '#454026', cloud: 1.0 },
  { el: 30, zen: '#3f76c0', hor: '#b3cce2', fog: '#a9bccb', sun: '#fff4e3', si: 3.0, hemi: 1.1, hsky: '#b7cde8', hgr: '#4a4428', cloud: 1.05 },
  { el: 55, zen: '#3a72c0', hor: '#a8c7e4', fog: '#a3b9cc', sun: '#ffffff', si: 3.2, hemi: 1.15, hsky: '#bcd2ec', hgr: '#4d472a', cloud: 1.1 },
];
const KEYC = KEYS.map((k) => ({
  ...k, zen: new THREE.Color(k.zen), hor: new THREE.Color(k.hor), fog: new THREE.Color(k.fog),
  sun: new THREE.Color(k.sun), hsky: new THREE.Color(k.hsky), hgr: new THREE.Color(k.hgr),
}));

function sampleKeys(el) {
  let a = KEYC[0], b = KEYC[KEYC.length - 1];
  if (el <= a.el) b = a;
  else if (el >= b.el) a = b;
  else {
    for (let i = 0; i < KEYC.length - 1; i++) {
      if (el >= KEYC[i].el && el <= KEYC[i + 1].el) { a = KEYC[i]; b = KEYC[i + 1]; break; }
    }
  }
  const t = a === b ? 0 : (el - a.el) / (b.el - a.el);
  return {
    zen: a.zen.clone().lerp(b.zen, t), hor: a.hor.clone().lerp(b.hor, t), fog: a.fog.clone().lerp(b.fog, t),
    sun: a.sun.clone().lerp(b.sun, t), hsky: a.hsky.clone().lerp(b.hsky, t), hgr: a.hgr.clone().lerp(b.hgr, t),
    si: lerp(a.si, b.si, t), hemi: lerp(a.hemi, b.hemi, t), cloud: lerp(a.cloud, b.cloud, t),
  };
}

const skyVert = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFrag = /* glsl */`
  uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround;
  uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uTime; uniform float uCloudLight; uniform float uSunVis; uniform float uCover;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return s;
  }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.42));
    col = mix(col, uGround, smoothstep(0.0, -0.12, h));
    float sd = max(dot(d, uSunDir), 0.0);
    col += uSunColor * (pow(sd, 1400.0) * 30.0 * uSunVis + pow(sd, 22.0) * 0.28 + pow(sd, 3.0) * 0.1);
    if (h > 0.0) {
      vec2 uv = d.xz / (h + 0.1);
      vec2 drift = vec2(uTime * 0.0035, uTime * 0.0012);
      float c = fbm(uv * 0.8 + drift);
      float c2 = fbm(uv * 2.4 - drift * 1.7);
      c = smoothstep(0.62 - uCover, 0.92 - uCover * 0.6, c * 0.75 + c2 * 0.3);
      float fwd = pow(sd, 5.0);
      vec3 shade = mix(uHorizon * 0.6, uZenith * 0.5, 0.4) + vec3(0.04);
      vec3 lit = vec3(1.0) * uCloudLight * 0.95 + uSunColor * fwd * 0.9;
      vec3 cc = mix(shade, lit, 0.55 + 0.45 * (1.0 - c2));
      col = mix(col, cc, c * smoothstep(0.0, 0.18, h) * 0.9);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Sky {
  constructor(scene, renderer, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.uniforms = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color('#2a2c20') },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() }, uTime: { value: 0 },
      uCloudLight: { value: 1 }, uSunVis: { value: 1 }, uCover: { value: 0.1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: skyVert, fragmentShader: skyFrag,
      side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 20), mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const sz = quality === 'low' ? 45 : 70;
    const ms = quality === 'high' ? 4096 : quality === 'low' ? 1024 : 2048;
    this.shadowSize = sz;
    this.shadowMapSize = ms;
    this.sun.shadow.mapSize.set(ms, ms);
    const cam = this.sun.shadow.camera;
    cam.left = -sz; cam.right = sz; cam.top = sz; cam.bottom = -sz; cam.near = 1; cam.far = 500;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbcd2ec, 0x4d472a, 1);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xa9bccb, 0.0017);
    scene.background = null;

    // environment for reflections (car paint, water, windows)
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    const envDome = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat);
    this.envScene.add(envDome);
    const groundDisc = new THREE.Mesh(new THREE.CircleGeometry(9, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x33361f }));
    groundDisc.position.y = -0.4;
    this.envGround = groundDisc;
    this.envScene.add(groundDisc);
    this.envRT = null;
    this.envTimer = 0;

    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.elevation = 30;
    this.daylight = 1;
    this.cloudTime = 0;
    this._snap = new THREE.Vector3();
  }

  update(hours, focus, dt, forceEnv = false) {
    sunDirection(hours, this.sunDir);
    const el = THREE.MathUtils.radToDeg(Math.asin(clamp(this.sunDir.y, -1, 1)));
    this.elevation = el;
    const k = sampleKeys(el);
    const u = this.uniforms;
    u.uZenith.value.copy(k.zen);
    u.uHorizon.value.copy(k.hor);
    u.uSunDir.value.copy(this.sunDir);
    u.uSunColor.value.copy(k.sun);
    u.uCloudLight.value = k.cloud;
    u.uSunVis.value = clamp((el + 1.5) / 2, 0, 1);
    this.cloudTime += dt;
    u.uTime.value = this.cloudTime;
    u.uGround.value.copy(k.fog).multiplyScalar(0.55);

    this.scene.fog.color.copy(k.fog);
    this.sun.color.copy(k.sun);
    this.sun.intensity = k.si;
    this.sun.castShadow = el > -1;
    this.hemi.color.copy(k.hsky);
    this.hemi.groundColor.copy(k.hgr);
    this.hemi.intensity = k.hemi;
    this.daylight = clamp((el + 6) / 14, 0, 1);

    // light follows the focus point, snapped to shadow texels to stop shimmering
    const lightDir = this.sunDir.y > 0.08 ? this.sunDir : this._low || (this._low = new THREE.Vector3());
    if (this.sunDir.y <= 0.08) { lightDir.copy(this.sunDir); lightDir.y = 0.08; lightDir.normalize(); }
    const fwd = this._f || (this._f = new THREE.Vector3());
    const right = this._r || (this._r = new THREE.Vector3());
    const upv = this._u || (this._u = new THREE.Vector3());
    fwd.copy(lightDir).negate();
    right.crossVectors(fwd, THREE.Object3D.DEFAULT_UP).normalize();
    upv.crossVectors(right, fwd);
    const texel = (this.shadowSize * 2) / this.shadowMapSize;
    const px = Math.round(focus.dot(right) / texel) * texel;
    const py = Math.round(focus.dot(upv) / texel) * texel;
    const pz = focus.dot(fwd);
    this._snap.copy(right).multiplyScalar(px).addScaledVector(upv, py).addScaledVector(fwd, pz);
    this.sun.target.position.copy(this._snap);
    this.sun.position.copy(this._snap).addScaledVector(lightDir, 200);
    this.sun.target.updateMatrixWorld();

    this.envTimer -= dt;
    if (forceEnv || this.envTimer <= 0) {
      this.envTimer = 6;
      this.envGround.material.color.copy(k.hgr).multiplyScalar(1.4);
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
      if (this.envRT) this.envRT.dispose();
      this.envRT = rt;
      this.scene.environment = rt.texture;
    }
  }

  follow(camPos) {
    this.dome.position.copy(camPos);
  }
}
