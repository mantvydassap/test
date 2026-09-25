import * as THREE from 'three';

// Final screen pass: a washed-out, slightly yellow-green 90s-PC-game grade with
// film grain and vignette, plus double vision when drunk.
const frag = /* glsl */`
  uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uDrunk; uniform float uGrade;
  varying vec2 vUv;
  float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec2 uv = vUv;
    if (uDrunk > 0.0) {
      uv += vec2(sin(uTime * 0.7 + uv.y * 3.0), cos(uTime * 0.5 + uv.x * 2.0)) * 0.004 * uDrunk;
    }
    vec3 c = texture2D(tDiffuse, uv).rgb;
    if (uDrunk > 0.0) {
      vec2 o = vec2(sin(uTime * 0.9), cos(uTime * 0.6)) * 0.012 * min(uDrunk, 1.6);
      c = mix(c, texture2D(tDiffuse, uv + o).rgb, 0.45 * min(uDrunk, 1.0));
    }
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 g = mix(vec3(l), c, 0.74);                 // desaturate
    g *= vec3(1.02, 1.03, 0.88);                    // yellow-green cast
    g = g * 0.95 + vec3(0.014, 0.016, 0.012);       // lifted, milky blacks
    c = mix(c, g, uGrade);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    float d = distance(vUv, vec2(0.5));
    gl_FragColor.rgb *= mix(1.0, smoothstep(0.95, 0.3, d) * 0.4 + 0.6, uGrade);
    gl_FragColor.rgb += (rand(vUv * uRes + fract(uTime) * 91.0) - 0.5) * 0.05 * uGrade;
  }
`;

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.uniforms = {
      tDiffuse: { value: this.rt.texture }, uTime: { value: 0 }, uRes: { value: size.clone() },
      uDrunk: { value: 0 }, uGrade: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, fragmentShader: frag,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  resize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt.setSize(size.x, size.y);
    this.uniforms.uRes.value.copy(size);
  }

  render(scene, camera, time, drunk) {
    const r = this.renderer;
    this.uniforms.uTime.value = time;
    this.uniforms.uDrunk.value = drunk > 0.3 ? Math.min(2, drunk - 0.3) : 0;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }
}
