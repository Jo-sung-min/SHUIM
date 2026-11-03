import * as THREE from "three";

/**
 * 밤하늘 풍등 (태국 이펑 축제처럼). 종이등 수십 개가 따뜻한 주황빛을 내며 천천히 흔들리며 올라가고,
 * 그 너머로 먼 풍등 수백 개가 작은 점으로 반짝인다.
 * 인스턴스 하나가 등 하나: 출발점·속도·크기는 버퍼에 두고, 떠오르는 움직임·흔들림·촛불 깜빡임은 전부 셰이더에서 계산한다
 * (CPU 는 매 프레임 시간만 넘긴다). 낮에는 uAmount 가 0 이라 그리지 않는다.
 */
const RISE_GLSL = `
uniform float uTime;
attribute vec3 aBase;  // 출발점 (x, 바닥 높이, z)
attribute vec4 aSeed;  // 씨앗 0~1, 상승 속도(m/s), 크기, 한 바퀴 높이(m)
varying float vFade; varying float vSeed; varying float vDist;
vec3 lanternWorld(out float life) {
  float speed = aSeed.y, span = aSeed.w;
  life = mod(uTime * speed + aSeed.x * span, span) / span; // 0: 막 띄움, 1: 저 멀리 사라짐
  // 바람에 흔들리며 바다 쪽(-z)으로 천천히 흘러간다
  float sway = sin(uTime * 0.35 + aSeed.x * 40.0) * (0.8 + life * 1.6) + sin(uTime * 0.9 + aSeed.x * 17.0) * 0.25;
  float drift = life * (6.0 + aSeed.x * 10.0);
  return vec3(aBase.x + sway, aBase.y + life * span, aBase.z - drift + cos(uTime * 0.3 + aSeed.x * 23.0) * 0.6);
}`;

const LANTERN_VERT = `
${RISE_GLSL}
varying vec2 vUv;
void main() {
  vUv = uv; vSeed = aSeed.x;
  float life;
  vec3 world = lanternWorld(life);
  vFade = smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.78, 1.0, life));
  vec3 toCam = cameraPosition - world;
  vDist = length(toCam);
  // 세로축은 그대로 두고 카메라 쪽만 보는 원통형 빌보드
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vec3 p = world + right * position.x * aSeed.z + vec3(0.0, position.y * aSeed.z, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const LANTERN_FRAG = `
uniform float uTime; uniform float uAmount;
varying vec2 vUv; varying float vFade; varying float vSeed; varying float vDist;
float rbox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec2 p = (vUv - 0.5) * vec2(2.6, 3.4); // 크기 1 기준 월드 단위
  // 종이등 몸통: 위는 둥글고 아래 입구는 살짝 좁은 원통
  float taper = mix(0.84, 1.0, smoothstep(-0.6, 0.6, p.y));
  float body = rbox(vec2(p.x / taper, p.y - 0.05), vec2(0.34, 0.62), 0.26);
  float paper = 1.0 - smoothstep(-0.02, 0.03, body);
  // 안쪽 촛불: 아래 가운데가 가장 밝고 위로 갈수록 은은한 살구색. 불꽃은 가볍게 깜빡인다
  float v = clamp((p.y + 0.6) / 1.2, 0.0, 1.0);
  float flicker = 0.9 + 0.1 * sin(uTime * 9.0 + vSeed * 50.0) * sin(uTime * 5.3 + vSeed * 20.0);
  vec3 glow = mix(vec3(1.0, 0.42, 0.08), vec3(1.0, 0.8, 0.52), v);
  vec2 fromCandle = p - vec2(0.0, -0.35);
  float candle = exp(-dot(fromCandle, fromCandle) * 9.0);
  vec3 paperColor = glow * (0.8 + candle * 1.0) * flicker;
  paperColor *= mix(0.7, 1.0, smoothstep(-0.02, -0.14, body)); // 가장자리는 종이가 겹쳐 조금 어둡다
  vec2 fromFlame = (p - vec2(0.0, -0.64)) * vec2(3.6, 2.2);
  paperColor += vec3(1.0, 0.82, 0.5) * exp(-dot(fromFlame, fromFlame) * 5.0) * 1.3;
  // 둘레 빛무리
  float d = length(p * vec2(1.0, 0.78));
  float halo = exp(-d * d * 1.25) * 0.62;
  vec3 color = mix(vec3(1.0, 0.46, 0.12) * flicker, paperColor, paper);
  float alpha = max(paper, halo) * vFade * uAmount * (1.0 - smoothstep(220.0, 320.0, vDist));
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(color, alpha);
  #include <colorspace_fragment>
}`;

/* 멀리 떠 있는 풍등은 작은 점으로: 수백 개가 하늘을 가득 채운다 */
const FAR_VERT = `
${RISE_GLSL}
void main() {
  vSeed = aSeed.x;
  float life;
  vec3 world = lanternWorld(life);
  vFade = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.75, 1.0, life));
  vec4 mv = viewMatrix * vec4(world, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSeed.z * 520.0 / max(vDist, 1.0), 1.5, 9.0);
}`;

const FAR_FRAG = `
uniform float uTime; uniform float uAmount;
varying float vFade; varying float vSeed; varying float vDist;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float core = 1.0 - smoothstep(0.08, 0.3, length(p));
  float halo = exp(-dot(p, p) * 14.0) * 0.6;
  float flicker = 0.85 + 0.15 * sin(uTime * 7.0 + vSeed * 80.0);
  vec3 color = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.85, 0.6), core);
  float alpha = max(core, halo) * flicker * vFade * uAmount * (1.0 - smoothstep(260.0, 420.0, vDist));
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(color, alpha);
  #include <colorspace_fragment>
}`;

/** 매번 같은 하늘이 되도록 고정 씨앗 난수 */
function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

export class SkyLanterns {
  private near: THREE.Mesh;
  private far: THREE.Points;
  private materials: THREE.ShaderMaterial[];
  private amount = 0;
  private shown = 0;

  constructor(scene: THREE.Scene, count: number) {
    // 가까운 풍등: 모래밭 위에서 띄운 것부터 바다 위까지, 카메라 둘레를 넓게 채운다
    const nearGeometry = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(2.6, 3.4);
    nearGeometry.setAttribute("position", quad.getAttribute("position"));
    nearGeometry.setAttribute("uv", quad.getAttribute("uv"));
    nearGeometry.setIndex(quad.getIndex());
    nearGeometry.instanceCount = count;
    const rand = seeded(7);
    const base = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      base[i * 3] = (rand() - 0.5) * 120;
      base[i * 3 + 1] = 1 + rand() * 12;
      base[i * 3 + 2] = 34 - rand() * 120;
      seed[i * 4] = rand();
      seed[i * 4 + 1] = 0.5 + rand() * 0.45;
      seed[i * 4 + 2] = 1 + rand() * 0.7;
      seed[i * 4 + 3] = 40 + rand() * 28;
    }
    nearGeometry.setAttribute("aBase", new THREE.InstancedBufferAttribute(base, 3));
    nearGeometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 4));
    const nearMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAmount: { value: 0 } },
      vertexShader: LANTERN_VERT, fragmentShader: LANTERN_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    this.near = new THREE.Mesh(nearGeometry, nearMaterial);
    this.near.frustumCulled = false;
    this.near.renderOrder = 2;
    scene.add(this.near);

    // 먼 풍등: 점으로, 더 넓고 높게
    const farCount = count * 3;
    const farGeometry = new THREE.BufferGeometry();
    const farBase = new Float32Array(farCount * 3);
    const farSeed = new Float32Array(farCount * 4);
    for (let i = 0; i < farCount; i++) {
      farBase[i * 3] = (rand() - 0.5) * 380;
      farBase[i * 3 + 1] = 6 + rand() * 70;
      farBase[i * 3 + 2] = 70 - rand() * 330;
      farSeed[i * 4] = rand();
      farSeed[i * 4 + 1] = 0.4 + rand() * 0.5;
      farSeed[i * 4 + 2] = 0.6 + rand() * 0.8;
      farSeed[i * 4 + 3] = 50 + rand() * 40;
    }
    farGeometry.setAttribute("position", new THREE.BufferAttribute(farBase, 3)); // 실제 위치는 셰이더에서 aBase 로 계산한다
    farGeometry.setAttribute("aBase", new THREE.BufferAttribute(farBase, 3));
    farGeometry.setAttribute("aSeed", new THREE.BufferAttribute(farSeed, 4));
    const farMaterial = new THREE.ShaderMaterial({
      uniforms: nearMaterial.uniforms,
      vertexShader: FAR_VERT, fragmentShader: FAR_FRAG,
      transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    });
    this.far = new THREE.Points(farGeometry, farMaterial);
    this.far.frustumCulled = false;
    this.far.renderOrder = 2;
    scene.add(this.far);
    this.materials = [nearMaterial, farMaterial];
    this.setVisible(false);
  }

  private setVisible(visible: boolean) {
    this.near.visible = visible;
    this.far.visible = visible;
  }

  /** 떠 있는 정도 0~1 (Daylight.lanterns). 0 이면 아예 그리지 않는다 */
  setAmount(amount: number) {
    this.amount = THREE.MathUtils.clamp(amount, 0, 1);
  }

  update(time: number) {
    this.shown += (this.amount - this.shown) * 0.05;
    if (this.amount === 0 && this.shown < 0.01) this.shown = 0;
    const u = this.materials[0].uniforms;
    u.uTime.value = time;
    u.uAmount.value = this.shown;
    this.setVisible(this.shown > 0.005);
  }
}
