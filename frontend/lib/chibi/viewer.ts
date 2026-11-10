/**
 * 360° 캐릭터 뷰어: 렌더러, 궤도 카메라(마우스 드래그·터치 회전/확대), 시점 프리셋, 바닥, FPS·드로우 콜 측정.
 * React 와 떨어진 순수 three 코드라 다른 화면에서도 그대로 쓸 수 있다.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildChibiAsync, type ChibiBuild } from "./build";
import { ChibiCharacter, createChibiMaterials, type ChibiMaterials } from "./character";

export type ViewPreset = "front" | "front45" | "left" | "right" | "back";

export interface ViewerStats {
  fps: number;
  frameMs: number;
  cpuMs: number;
  calls: number;
  triangles: number;
  buildMs: number;
  modelTriangles: number;
}

const PRESET_AZIMUTH: Record<ViewPreset, number> = {
  front: 0,
  front45: Math.PI / 4,
  left: -Math.PI / 2, // 캐릭터의 왼쪽(+x)에서 보면 화면 기준 왼쪽 옆모습
  right: Math.PI / 2,
  back: Math.PI,
};

export class ChibiViewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly build: ChibiBuild;
  readonly materials: ChibiMaterials;
  readonly character: ChibiCharacter;
  /** 걷는 캐릭터를 카메라가 따라간다 */
  follow = true;
  onStats?: (s: ViewerStats) => void;

  private clock = new THREE.Clock();
  private raf = 0;
  private frames = 0;
  private statClock = 0;
  private cpuAcc = 0;
  private presetTween: { from: THREE.Spherical; to: THREE.Spherical; t: number } | null = null;
  private ro: ResizeObserver;
  private pixelRatioCap = 2;
  private disposed = false;

  /** 메싱은 워커에서 하고, 끝나면 뷰어를 만든다 */
  static async create(container: HTMLElement) {
    const build = await buildChibiAsync();
    return new ChibiViewer(container, build);
  }

  constructor(private container: HTMLElement, build: ChibiBuild) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.pixelRatioCap));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.info.autoReset = true;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = "none";

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    this.camera.position.set(0, 0.62, 2.9);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.5, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.1;
    this.controls.maxDistance = 6;
    this.controls.minPolarAngle = 0.15;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.08;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.controls.addEventListener("start", () => { this.presetTween = null; });

    this.build = build;
    this.materials = createChibiMaterials();
    this.character = new ChibiCharacter(this.build, this.materials);
    this.scene.add(this.character.object);
    this.scene.add(createGround());

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.loop();
  }

  setPixelRatioCap(cap: number) {
    this.pixelRatioCap = cap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap));
    this.resize();
  }

  setView(preset: ViewPreset) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const from = new THREE.Spherical().setFromVector3(offset);
    // 캐릭터가 보는 방향 기준으로 시점을 잡는다
    const theta = this.character.motion.yaw + PRESET_AZIMUTH[preset];
    const to = new THREE.Spherical(Math.min(from.radius, 3.2), Math.PI / 2 - 0.13, theta);
    // 가까운 쪽으로 돌기
    to.theta = from.theta + Math.atan2(Math.sin(to.theta - from.theta), Math.cos(to.theta - from.theta));
    this.presetTween = { from, to, t: 0 };
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 좁은 화면(세로 폰)에서는 화각을 넓혀 전신이 들어오게
    const tall = w / h < 0.75;
    this.camera.fov = tall ? 40 : 30;
    // 세로 폰에서는 아래 조작 패널에 다리가 가리지 않게 화면 속 캐릭터를 위로 올린다
    if (tall) this.camera.setViewOffset(w, h, 0, h * 0.13, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.materials.outline.uniforms.uRes.value.copy(size);
    this.materials.outline.uniforms.uWidth.value = (this.materials.outline.userData.widthCss ?? 1) * this.renderer.getPixelRatio();
  }

  setOutlineWidth(cssPx: number) {
    this.materials.outline.userData.widthCss = cssPx;
    this.materials.outline.uniforms.uWidth.value = cssPx * this.renderer.getPixelRatio();
  }

  /** 수동으로 한 프레임 (패널이 숨겨져 rAF 가 멈췄을 때 검증용) */
  frame(dt = 1 / 60) {
    const t0 = performance.now();
    this.character.update(dt);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
    return performance.now() - t0;
  }

  private updateCamera(dt: number) {
    const target = this.controls.target;
    if (this.follow) {
      const p = this.character.motion.position;
      const goal = new THREE.Vector3(p.x, 0.5, p.z);
      const delta = goal.sub(target).multiplyScalar(1 - Math.exp(-dt * 3));
      target.add(delta);
      this.camera.position.add(delta);
    }
    if (this.presetTween) {
      const tw = this.presetTween;
      tw.t = Math.min(1, tw.t + dt / 0.6);
      const e = tw.t < 0.5 ? 2 * tw.t * tw.t : 1 - Math.pow(-2 * tw.t + 2, 2) / 2;
      const s = new THREE.Spherical(
        THREE.MathUtils.lerp(tw.from.radius, tw.to.radius, e),
        THREE.MathUtils.lerp(tw.from.phi, tw.to.phi, e),
        THREE.MathUtils.lerp(tw.from.theta, tw.to.theta, e),
      );
      this.camera.position.setFromSpherical(s).add(target);
      if (tw.t >= 1) this.presetTween = null;
    }
    this.controls.update();
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = this.clock.getDelta();
    const cpu = this.frame(dt);
    this.frames++;
    this.cpuAcc += cpu;
    this.statClock += dt;
    if (this.statClock >= 0.5) {
      const info = this.renderer.info.render;
      this.onStats?.({
        fps: this.frames / this.statClock,
        frameMs: (this.statClock / this.frames) * 1000,
        cpuMs: this.cpuAcc / this.frames,
        calls: info.calls,
        triangles: info.triangles,
        buildMs: this.build.stats.ms,
        modelTriangles: this.build.stats.bodyTriangles + this.build.stats.faceTriangles,
      });
      this.frames = 0; this.statClock = 0; this.cpuAcc = 0;
    }
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.build.body.dispose();
    this.build.face.dispose();
    Object.values(this.materials).forEach(m => m.dispose());
    this.scene.traverse(o => { if ((o as THREE.Mesh).isMesh && o !== this.character.body) { (o as THREE.Mesh).geometry.dispose(); } });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/** 은은한 원형 바닥 + 발이 미끄러지는지 보이도록 옅은 점 무늬 */
function createGround() {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color("#ffffff") }, uDot: { value: new THREE.Color("#c9bfe6") } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform vec3 uDot; varying vec2 vP;
      void main(){
        float r = length(vP);
        float a = (1.0 - smoothstep(1.6, 3.2, r)) * 0.55;
        vec2 g = fract(vP / 0.2) - 0.5;
        float dotm = 1.0 - smoothstep(0.05, 0.085, length(g));
        vec3 c = mix(uColor, uDot, dotm * 0.8);
        gl_FragColor = vec4(c, a);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(3.4, 64), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = -2;
  return m;
}
