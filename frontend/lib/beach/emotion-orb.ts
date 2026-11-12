import * as THREE from "three";

/**
 * 맵 안의 감정구슬 (docs/EMOTION_ORBS.md 2.1장): 내 화면에만 보이는 작은 빛구슬.
 * 알리지 않고 조용히 나타나 천천히 떠오르내린다. 멀리서도 우연히 눈에 띄도록 엷은 빛무리와 가는 빛기둥,
 * 둘레를 도는 반짝임을 둔다. 줍기 전에는 정해지지 않은 흰빛이고, 주우면 그날의 빛깔로 물들며 떠올라 사라진다.
 */

const HOVER = 0.95; // 바닥에서 뜬 높이 (m)
const APPEAR_S = 1.4;
const COLLECT_S = 1.6;
const PLAIN = new THREE.Color("#fff4d8");
const WHITE = new THREE.Color(0xffffff);
const MOTES = 10;

function radialTexture(stops: readonly [number, string][]): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function beamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 8; canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  // v=0 이 아래(구슬 쪽): 아래가 밝고 위로 갈수록 스러진다
  const gradient = ctx.createLinearGradient(0, 128, 0, 0);
  gradient.addColorStop(0, "rgba(255,255,255,0.9)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.35)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 8, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class EmotionOrbLight {
  readonly object = new THREE.Group();
  readonly x: number;
  readonly z: number;
  private readonly bob = new THREE.Group();
  private readonly core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly shell: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly halo: THREE.Sprite;
  private readonly beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private readonly motes: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly textures: THREE.Texture[] = [];
  private readonly color = PLAIN.clone();
  private readonly target = PLAIN.clone();
  private age = 0;
  private near = 0;
  private taking = -1;
  private done: (() => void) | null = null;
  private disposed = false;

  constructor(x: number, floorY: number, z: number) {
    this.x = x; this.z = z;
    this.object.position.set(x, floorY, z);
    this.bob.position.y = HOVER;
    this.object.add(this.bob);

    const haloTexture = radialTexture([[0, "rgba(255,255,255,0.95)"], [0.18, "rgba(255,255,255,0.55)"], [0.5, "rgba(255,255,255,0.14)"], [1, "rgba(255,255,255,0)"]]);
    const moteTexture = radialTexture([[0, "rgba(255,255,255,1)"], [0.35, "rgba(255,255,255,0.5)"], [1, "rgba(255,255,255,0)"]]);
    const beam = beamTexture();
    this.textures.push(haloTexture, moteTexture, beam);

    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, toneMapped: false, fog: false }));
    this.shell = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 14),
      new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture, color: this.color, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    this.halo.scale.setScalar(1.1);
    this.bob.add(this.core, this.shell, this.halo);

    // 가는 빛기둥: 옆에서 보면 엷은 선, 위에서는 보이지 않는다 (양 끝이 열린 원통)
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.055, 4.4, 8, 1, true),
      new THREE.MeshBasicMaterial({ map: beam, color: this.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
    this.beam.position.y = HOVER + 2.2;
    this.object.add(this.beam);

    const positions = new Float32Array(MOTES * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.motes = new THREE.Points(geometry, new THREE.PointsMaterial({ map: moteTexture, color: this.color, size: 0.11, sizeAttenuation: true,
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    this.motes.frustumCulled = false;
    this.bob.add(this.motes);
  }

  /** time: 엔진이 흐른 시간(초). near: 0(멀다)~1(바로 곁). 가까울수록 조금 밝아진다 */
  update(dt: number, time: number, near: number) {
    if (this.disposed) return;
    this.age += dt;
    this.near += (Math.max(0, Math.min(1, near)) - this.near) * Math.min(1, dt * 4);
    const shown = Math.min(1, this.age / APPEAR_S);
    let fade = shown * shown * (3 - 2 * shown), lift = 0, swell = 1;
    if (this.taking >= 0) {
      this.taking += dt;
      const t = Math.min(1, this.taking / COLLECT_S);
      lift = t * t * 1.5;
      swell = 1 + Math.sin(Math.min(1, t * 1.6) * Math.PI) * 0.9;
      fade = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
      this.color.lerp(this.target, Math.min(1, dt * 6));
      if (t >= 1 && this.done) { const done = this.done; this.done = null; done(); }
    }
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.7);
    const swellHalo = this.taking >= 0 ? 1.6 : 1;
    this.bob.position.y = HOVER + Math.sin(time * 1.1) * 0.07 + lift;
    this.bob.scale.setScalar(swell);
    this.core.material.opacity = fade * 0.95;
    this.core.material.color.copy(this.color).lerp(WHITE, 0.6);
    this.shell.material.color.copy(this.color);
    this.shell.material.opacity = fade * (0.34 + 0.16 * pulse);
    const halo = this.halo.material as THREE.SpriteMaterial;
    halo.color.copy(this.color);
    // 가까이서는 빛무리가 시야를 덮지 않게 작게, 멀리서는 눈에 띄게 조금 크게
    halo.opacity = fade * (0.42 + 0.16 * pulse) * (1 - 0.35 * this.near);
    this.halo.scale.setScalar((1.35 + 0.18 * pulse) * (1 - 0.4 * this.near) * swellHalo);
    this.beam.material.color.copy(this.color);
    // 빛기둥은 멀리서 우연히 눈에 띄라고 두는 것이라, 다가가면 스러진다
    this.beam.material.opacity = fade * (this.taking >= 0 ? 0.4 : (0.13 + 0.05 * pulse) * (1 - 0.9 * this.near));
    this.beam.position.y = HOVER + 2.2 + lift;
    const positions = this.motes.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < MOTES; i++) {
      const phase = i * 2.399 + time * (0.5 + (i % 3) * 0.14);
      const radius = (0.34 + (i % 4) * 0.08) * (this.taking >= 0 ? 1 + this.taking * 1.2 : 1);
      positions.setXYZ(i, Math.cos(phase) * radius, Math.sin(time * 0.9 + i * 1.7) * 0.24 + (i % 2 ? 0.08 : -0.06), Math.sin(phase) * radius);
    }
    positions.needsUpdate = true;
    this.motes.material.color.copy(this.color);
    this.motes.material.opacity = fade * (0.6 + 0.3 * pulse);
  }

  get collecting() { return this.taking >= 0; }

  /** 주웠다: 그날의 빛깔로 물들며 떠오른다. 다 사라지면 끝난다 */
  collect(color: string): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.target.set(color);
    this.age = Math.max(this.age, APPEAR_S);
    if (this.taking < 0) this.taking = 0;
    return new Promise((resolve) => { const before = this.done; this.done = () => { before?.(); resolve(); }; });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.object.removeFromParent();
    this.core.geometry.dispose(); this.core.material.dispose();
    this.shell.geometry.dispose(); this.shell.material.dispose();
    this.halo.material.dispose();
    this.beam.geometry.dispose(); this.beam.material.dispose();
    this.motes.geometry.dispose(); this.motes.material.dispose();
    for (const texture of this.textures) texture.dispose();
    const done = this.done; this.done = null; done?.();
  }
}
