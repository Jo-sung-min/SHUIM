import * as THREE from "three";

const FULLSCREEN_VERT = `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** Lets only what already glows through; the knee keeps lamps from growing a hard outline. */
const BRIGHT_FRAG = `
uniform sampler2D tSrc;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  // Characters write zero alpha, so a pale shirt can never start to glow.
  vec4 source = texture2D(tSrc, vUv);
  vec3 c = source.rgb * source.a;
  float peak = max(c.r, max(c.g, c.b));
  float knee = uThreshold * 0.22;
  float soft = clamp(peak - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float weight = max(soft, peak - uThreshold) / max(peak, 1e-4);
  gl_FragColor = vec4(c * weight, 1.0);
}`;
/** Dual-filter blur: five taps down, eight taps up. Wide halos cost a handful of small draws. */
const DOWN_FRAG = `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 sum = texture2D(tSrc, vUv).rgb * 4.0;
  sum += texture2D(tSrc, vUv - uTexel).rgb;
  sum += texture2D(tSrc, vUv + uTexel).rgb;
  sum += texture2D(tSrc, vUv + vec2(uTexel.x, -uTexel.y)).rgb;
  sum += texture2D(tSrc, vUv - vec2(uTexel.x, -uTexel.y)).rgb;
  gl_FragColor = vec4(sum / 8.0, 1.0);
}`;
const UP_FRAG = `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uWeight;
varying vec2 vUv;
void main() {
  vec3 sum = texture2D(tSrc, vUv + vec2(-uTexel.x * 2.0, 0.0)).rgb;
  sum += texture2D(tSrc, vUv + vec2(-uTexel.x, uTexel.y)).rgb * 2.0;
  sum += texture2D(tSrc, vUv + vec2(0.0, uTexel.y * 2.0)).rgb;
  sum += texture2D(tSrc, vUv + vec2(uTexel.x, uTexel.y)).rgb * 2.0;
  sum += texture2D(tSrc, vUv + vec2(uTexel.x * 2.0, 0.0)).rgb;
  sum += texture2D(tSrc, vUv + vec2(uTexel.x, -uTexel.y)).rgb * 2.0;
  sum += texture2D(tSrc, vUv + vec2(0.0, -uTexel.y * 2.0)).rgb;
  sum += texture2D(tSrc, vUv + vec2(-uTexel.x, -uTexel.y)).rgb * 2.0;
  gl_FragColor = vec4(sum / 12.0 * uWeight, 1.0);
}`;
/** The scene arrives display-referred, so the grade is a photographic print step: screen in the bloom, split tone, gentle S-curve, vignette, grain. */
const FINISH_FRAG = `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloom;
uniform float uInterior;
uniform float uNight;
uniform float uTime;
uniform vec2 uResolution;
varying vec2 vUv;
float grainHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main() {
  vec2 centred = vUv - 0.5;
  float radial = dot(centred, centred);
  // The faintest lens fringe at the corners, so straight black mullions do not look computer-ruled.
  vec2 fringe = centred * radial * 0.0035;
  vec3 color = vec3(texture2D(tScene, vUv + fringe).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - fringe).b);
  vec3 bloom = texture2D(tBloom, vUv).rgb * uBloom;
  color = 1.0 - (1.0 - color) * (1.0 - clamp(bloom, 0.0, 1.0));
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  // Outdoors: blue-green shadows under a neutral top. Indoors: amber all the way up, the way candlelit film prints.
  vec3 shadows = mix(vec3(0.955, 1.0, 1.06), vec3(1.02, 1.0, 0.95), uInterior);
  vec3 lights = mix(vec3(1.03, 1.0, 0.975), vec3(1.03, 1.0, 0.95), uInterior);
  color *= mix(shadows, lights, smoothstep(0.05, 0.72, luma));
  color = mix(color, color * color * (3.0 - 2.0 * color), 0.26);
  float grey = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(grey), color, 1.08 + uInterior * 0.06);
  color *= 1.0 - smoothstep(0.1, 0.62, radial) * mix(0.26, 0.4, uInterior);
  // Grain sits mostly in the dark, and also dithers away the eight-bit banding of a night sky.
  float grain = grainHash(vUv * uResolution + fract(uTime) * 311.0) - 0.5;
  color += grain * mix(0.028, 0.012, smoothstep(0.0, 0.7, grey)) * (0.75 + uNight * 0.25);
  gl_FragColor = vec4(color, 1.0);
}`;

const pass = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>, additive = false) => new THREE.ShaderMaterial({
  uniforms, vertexShader: FULLSCREEN_VERT, fragmentShader, depthTest: false, depthWrite: false, toneMapped: false,
  blending: additive ? THREE.CustomBlending : THREE.NoBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
});

/**
 * Baikal's print stage. The world is drawn exactly as it would be on screen (tone-mapped, sRGB) into a multisampled
 * buffer, so its display-referred sky and ice shaders stay correct; bloom and the grade work on that image. Skipped entirely on the low tier.
 */
export class BaikalPost {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  private readonly target: THREE.WebGLRenderTarget;
  private readonly chain: THREE.WebGLRenderTarget[] = [];
  private readonly bright: THREE.ShaderMaterial;
  private readonly down: THREE.ShaderMaterial;
  private readonly up: THREE.ShaderMaterial;
  private readonly finish: THREE.ShaderMaterial;
  private readonly bufferSize = new THREE.Vector2();
  private readonly levels: number;
  private width = 0;
  private height = 0;
  interior = 0;
  night = 0;
  time = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer, mobile: boolean) {
    this.levels = mobile ? 3 : 5;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.bright = pass(BRIGHT_FRAG, { tSrc: { value: null }, uThreshold: { value: .72 } });
    this.down = pass(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.up = pass(UP_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: .8 } }, true);
    this.finish = pass(FINISH_FRAG, { tScene: { value: null }, tBloom: { value: null }, uBloom: { value: .9 }, uInterior: { value: 0 }, uNight: { value: 0 }, uTime: { value: 0 }, uResolution: { value: new THREE.Vector2(1, 1) } });
    this.mesh = new THREE.Mesh(geometry, this.finish); this.mesh.frustumCulled = false; this.scene.add(this.mesh);
    this.target = new THREE.WebGLRenderTarget(4, 4, { samples: mobile ? 2 : 4, type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, colorSpace: THREE.SRGBColorSpace });
    this.target.texture.internalFormat = "RGBA8";
    // Treated as a presenting surface: materials tone-map and encode exactly as for the canvas, and the buffer stays plain RGBA8.
    (this.target as unknown as { isXRRenderTarget: boolean }).isXRRenderTarget = true;
    const float = renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float");
    for (let i = 0; i < this.levels; i++) this.chain.push(new THREE.WebGLRenderTarget(4, 4, { type: float ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false }));
  }

  private resize() {
    this.renderer.getDrawingBufferSize(this.bufferSize);
    const width = Math.max(4, Math.floor(this.bufferSize.x)), height = Math.max(4, Math.floor(this.bufferSize.y));
    if (width === this.width && height === this.height) return;
    this.width = width; this.height = height;
    this.target.setSize(width, height);
    this.chain.forEach((target, level) => target.setSize(Math.max(2, width >> (level + 1)), Math.max(2, height >> (level + 1))));
    (this.finish.uniforms.uResolution.value as THREE.Vector2).set(width, height);
  }

  private draw(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null, clear = true) {
    this.mesh.material = material;
    this.renderer.setRenderTarget(target);
    if (clear) this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    this.resize();
    const renderer = this.renderer, autoClear = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.autoClear = false;
    // Indoors the lamps are the subject, so more of their warmth is let through the threshold.
    this.bright.uniforms.tSrc.value = this.target.texture;
    this.bright.uniforms.uThreshold.value = THREE.MathUtils.lerp(.84, .76, this.interior);
    this.draw(this.bright, this.chain[0]);
    for (let i = 1; i < this.levels; i++) {
      const source = this.chain[i - 1];
      this.down.uniforms.tSrc.value = source.texture; (this.down.uniforms.uTexel.value as THREE.Vector2).set(1 / source.width, 1 / source.height);
      this.draw(this.down, this.chain[i]);
    }
    for (let i = this.levels - 1; i > 0; i--) {
      const source = this.chain[i];
      this.up.uniforms.tSrc.value = source.texture; (this.up.uniforms.uTexel.value as THREE.Vector2).set(.5 / source.width, .5 / source.height);
      this.draw(this.up, this.chain[i - 1], false);
    }
    const finish = this.finish.uniforms;
    finish.tScene.value = this.target.texture; finish.tBloom.value = this.chain[0].texture;
    finish.uBloom.value = THREE.MathUtils.lerp(.55, .8, this.interior);
    finish.uInterior.value = this.interior; finish.uNight.value = this.night; finish.uTime.value = this.time;
    this.draw(this.finish, null);
    renderer.autoClear = autoClear;
  }

  dispose() {
    this.target.dispose(); this.chain.forEach(target => target.dispose());
    this.bright.dispose(); this.down.dispose(); this.up.dispose(); this.finish.dispose();
    this.mesh.geometry.dispose(); this.scene.clear();
  }
}
