/**
 * 바닷가 가까운 바다: Ultra Water (MIT, https://github.com/Humpalumps/Ultra-Water) 를 들여와
 * 만(cove) 안쪽 물만 그린다. 먼 바다는 엔진의 원래 평면이 그대로 맡는다.
 *
 * 파도는 부서지지 않고 찰랑거리기만 한다 (해안 파도 진폭을 거품이 일지 않을 만큼 낮춤, 물보라·물속 패스 없음).
 *  - 물: FFT 잔물결, 굴절로 비치는 바닥 모래, 깊이만큼 짙어지는 물빛, 하늘 반사, 해 반짝임
 *  - 모래: 물이 모래 위로 살짝 올라탔다 빠지는 얇은 막·거품 레이스·젖은 자국, 물속 바닥의 물결 코스틱
 *
 * 원본은 해수면이 y=0 이지만 바닷가 모래는 y=0 에 평평하다. 그래서 물을 SEA_Y(−0.22m) 로 내리고,
 * 평평한 모래(z ≥ −1.2)는 그대로 둔 채 그 앞만 얕은 바다로 기울였다 (모양은 shore-terrain.ts).
 * 사람은 그 경사를 따라 바위 끝 앞(허리 남짓 깊이)까지 걸어 들어가고, 물에 들어간 사람은 굴절 패스에도 그려 다리가 비친다.
 * 원본 파일은 고치지 않고, 셰이더 문자열에 해수면 이동·바닷가 톤 매핑만 덧댄다.
 */
import * as THREE from "three";
import { OceanSim, defaultOceanParams } from "../ultra-water/water/OceanSim.js";
import { OceanSurface, SHORE_GLSL, SWASH_GLSL } from "../ultra-water/water/OceanSurface.js";
import { bakeShoreMap, type ShoreMap } from "../ultra-water/water/shoreMap.js";
import { bakeWaterTextures } from "../ultra-water/water/bakeTextures.js";
import { CAUSTICS_GLSL, WaveCaustics } from "../ultra-water/water/Caustics.js";
import { FloaterShadow } from "../ultra-water/scene/floaterShadow.js";
import { REFRACT_LAYER, sandHeight } from "./shore-terrain";
import { HORIZON_MELT } from "./sky-shader";

/** 원본 해수면(0)을 바닷가에서는 이 높이로 */
export const SEA_Y = -0.22;
/** 원본 물이 덮는 반경(원점 기준, m). 그 밖은 원래 먼 바다 평면 */
export const ULTRA_RADIUS = 260;
/** 가까운 바다가 있을 때 먼 바다 색에 섞는 수평선 하늘 비율 (가까운 바다 끝과 먼 바다 평면이 같은 색으로 만난다) */
export const FAR_SKY_SHARE = 0.45;

export type UltraTier = "high" | "mobile";

/** 해수면 기준 높이(원본 좌표, +면 뭍): 모래 경사 + 양쪽 절벽(만 밖은 뭍으로 막는다) */
function shoreHeight(x: number, z: number) {
  if (Math.abs(x) > 25 && z > -16) return 10;
  return sandHeight(z) - SEA_Y;
}

/**
 * 원본이 쓰는 렌더 타깃·텍스처를 가진 객체를 훑어 정리한다 (원본엔 dispose 가 없는 클래스가 있다).
 * 렌더러·DOM·Promise 로는 들어가지 않는다: 렌더러 → 캔버스 → React/Next 내부까지 훑으면 엉뚱한 객체(params 등)를 건드린다.
 */
function disposeDeep(o: unknown, seen = new Set<unknown>(), depth = 0) {
  if (!o || typeof o !== "object" || seen.has(o) || depth > 4) return;
  seen.add(o);
  if (o instanceof THREE.WebGLRenderer || o instanceof Promise || (typeof Node !== "undefined" && o instanceof Node)) return;
  const any = o as { isWebGLRenderTarget?: boolean; isTexture?: boolean; isMaterial?: boolean; isBufferGeometry?: boolean; isCamera?: boolean; dispose?: () => void };
  if (any.isWebGLRenderTarget || any.isTexture || any.isMaterial || any.isBufferGeometry) { any.dispose?.(); return; }
  if (any.isCamera) return;
  for (const v of Array.isArray(o) ? o : Object.values(o)) if (v && typeof v === "object") disposeDeep(v, seen, depth + 1);
}

let shoreCache: ShoreMap | null = null;

export class BeachUltraSea {
  readonly surface: OceanSurface;
  /** 모래 재질 onBeforeCompile 에 넣을 유니폼 (해안 지도·시간·코스틱을 물과 같은 객체로 공유) */
  readonly sandUniforms: Record<string, THREE.IUniform>;
  private sim: OceanSim;
  private caustics: WaveCaustics;
  private floatShadow: FloaterShadow;
  private foam: { foam: THREE.Texture };
  private sky: { cube: THREE.Texture; cubeSize: number; sunDir: THREE.Vector3; sunColor: THREE.Vector3 };
  private cubeRT: THREE.WebGLCubeRenderTarget;
  private cubeCam: THREE.CubeCamera;
  private cubeScene = new THREE.Scene();
  private farRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType });
  private farScene = new THREE.Scene();
  private farCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private farPixel = new Float32Array(4);
  private refractRT: THREE.WebGLRenderTarget | null = null;
  private refractScale: number;
  private bakedTint = new THREE.Vector3(-1, -1, -1);
  private bakedPhoto = -1;
  private photo: THREE.Texture | null;
  private lastLightLayers = -1e9;
  private time = 0;
  private mobile = false;
  private frameNo = 0;
  private clearColor = new THREE.Color();

  static supported(renderer: THREE.WebGLRenderer) {
    // FFT·코스틱은 실수형 렌더 타깃에 그린다
    return renderer.capabilities.isWebGL2 && renderer.extensions.has("EXT_color_buffer_float");
  }

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, opts: {
    photo: THREE.Texture | null; photoTint: THREE.IUniform; tier: UltraTier;
    /** 화면 하늘과 같은 셰이더·유니폼: 물에 비치는 하늘이 보이는 하늘과 똑같다 (낮·노을·밤의 별·달) */
    skyFragment: string; skyUniforms: Record<string, THREE.IUniform>;
  }) {
    const mobile = opts.tier === "mobile";
    this.photo = opts.photo;
    this.refractScale = mobile ? 0.4 : 0.6;
    // 물 셰이더는 정점+조각 단계 합쳐 17개 텍스처를 쓴다. 단위 수 상한을 합산 한도로 (원본과 같은 처리)
    const gl = renderer.getContext() as WebGL2RenderingContext;
    renderer.capabilities.maxTextures = Math.max(renderer.capabilities.maxTextures, gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS));

    // ---- 하늘: 바닷가 사진 파노라마를 큐브로 (물의 반사·주변광). 사진 좌표는 원래 바다 셰이더와 같다.
    const size = mobile ? 128 : 256;
    this.cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.cubeCam = new THREE.CubeCamera(0.1, 10, this.cubeRT);
    const skyMain = "void main() { gl_FragColor = vec4(beachSky(vDir), 1.0); }";
    if (!opts.skyFragment.includes(skyMain)) throw new Error("beach sky shader changed");
    this.cubeScene.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.ShaderMaterial({
      uniforms: opts.skyUniforms,
      vertexShader: "varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      // 하늘 셰이더는 sRGB 값을 그대로 화면에 쓴다 → 물 계산용으로 선형으로 풀어 둔다
      fragmentShader: opts.skyFragment.replace(skyMain, "void main() { gl_FragColor = vec4(pow(max(beachSky(normalize(vDir)), 0.0), vec3(2.2)), 1.0); }"),
      side: THREE.BackSide, depthTest: false, depthWrite: false, toneMapped: false,
    })));
    // 원래 먼 바다가 수렴하는 색 (사진의 수평선 바로 아래): 경계에서 원본 물을 이 색으로 녹인다
    const farMat = new THREE.ShaderMaterial({
      uniforms: { uPhoto: { value: opts.photo }, uPhotoTint: opts.photoTint },
      vertexShader: `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `uniform sampler2D uPhoto; uniform vec3 uPhotoTint; void main() { gl_FragColor = vec4(pow(texture2D(uPhoto, vec2(0.5, 0.475)).rgb * uPhotoTint, vec3(2.2)), 1.0); }`,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.farScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), farMat));
    this.sky = { cube: this.cubeRT.texture, cubeSize: size, sunDir: new THREE.Vector3(0, 1, 0), sunColor: new THREE.Vector3(1, 1, 1) };

    // ---- 물가 지도(해안까지 거리·파도 진행 시간). 지형이 고정이라 한 번만 굽는다.
    shoreCache ??= bakeShoreMap(shoreHeight, 2 * (ULTRA_RADIUS + 40), mobile ? 384 : 512);
    const shore = shoreCache;

    // ---- 바람 약한 맑은 날: 잔물결만, 해안 쪽(+z)으로 오는 낮은 너울
    const params = { ...defaultOceanParams(), windSpeed: 2.4, windDirection: -80, waveScale: 0.6, swellScale: 0.08, swellDirection: -90, choppiness: 0.3, foamRecovery: 2.5 };
    this.sim = new OceanSim(renderer, params);
    this.caustics = new WaveCaustics(renderer, this.sim);
    this.foam = bakeWaterTextures(renderer);
    this.floatShadow = new FloaterShadow(4);
    // 떠다니는 물체는 없지만, 그림자 깊이 텍스처는 한 번 지워져야 비교 모드가 잡혀 그리기가 실패하지 않는다
    this.floatShadow.clear(renderer);
    this.surface = new OceanSurface(this.sim, shore, this.sky, this.floatShadow.uniforms);
    const u = this.surface.uniforms;
    u.uFoamTex.value = this.foam.foam;
    // 찰랑임: 부서질 만큼의 높이(에너지)가 없어 흰 거품이 일지 않는다
    (u.uShoreWave.value as THREE.Vector4).set(0.08, 12, 0.9, 0.0);
    (u.uFoam.value as THREE.Vector4).set(0.02, 1.0, 0.12, 0.72);
    // 휴대폰은 반짝이(픽셀마다 도는 확률 계산)를 끈다
    u.uGlint.value = mobile ? 0 : 0.35;
    // 휴대폰: 가까운 물의 가장 잔 물결 두 겹은 화면 픽셀보다 잘아 해 반사가 지글거린다.
    // 카메라 가까이에서 그 물결을 줄이고(줄인 만큼 표면 거칠기로 남아 빛이 부드럽게 번진다),
    // 기본 거칠기를 조금 올리고, 저해상도 굴절 화면이 흔들려 보이지 않게 굴절 어긋남을 줄인다. 먼 물은 그대로.
    // (측정: 해 반사 줄기의 픽셀 단위 지글거림 −59%, 그 깜빡임 −34%. 이보다 세게 줄여도 거의 나아지지 않는다)
    u.uFineNear = { value: mobile ? 0.12 : 1.0 };
    if (mobile) (u.uOptics.value as THREE.Vector4).setX(0.055).setY(0.022);
    this.mobile = mobile;
    u.uReflection.value = emptyReflection();
    u.uSeaY = { value: SEA_Y };
    u.uUltraRadius = { value: ULTRA_RADIUS };
    u.uFarSea = { value: new THREE.Vector3(0.1, 0.2, 0.25) };
    patchWaterMaterial(this.surface.material);
    this.surface.mesh.name = "beach-ultra-sea";
    this.surface.mesh.renderOrder = 1;
    scene.add(this.surface.mesh);

    this.sandUniforms = {
      ...Object.fromEntries(["uShore", "uTravel", "uSurf", "uShoreExtent", "uTime", "uShoreWave", "uSwellDir", "uAbsorption"].map(k => [k, u[k]])),
      ...this.caustics.uniforms,
      uSunDirT: { value: this.sky.sunDir },
      uSeaY: u.uSeaY,
      uCausticStrength: { value: 1.0 },
    };
  }

  /** 모래(굴절 패스에서 다시 그릴 것)를 등록한다 */
  addRefracted(obj: THREE.Object3D) { obj.layers.enable(REFRACT_LAYER); }

  /** 낮밤: 해·달 방향과 색, 하늘 큐브·먼 바다 색 다시 굽기 */
  setDaylight(sunDir: readonly number[], sunColor: readonly number[], tint: THREE.Vector3 | readonly number[], isSun: boolean) {
    const dir = this.sky.sunDir.set(sunDir[0], sunDir[1], sunDir[2]).normalize();
    // 원본은 HDR 하늘(해 세기 ~9)을 노출로 낮춘다. 여기 하늘은 사진(0~1)이라 해도 그 눈금에 맞춘다.
    // 달빛은 해보다 훨씬 약하다 (밤에 달이 높이 떠 있어도)
    const k = isSun ? 0.95 : 0.16;
    this.sky.sunColor.set(sunColor[0] * k, sunColor[1] * k, sunColor[2] * k);
    const t = Array.isArray(tint) ? new THREE.Vector3(tint[0], tint[1], tint[2]) : (tint as THREE.Vector3);
    // 사진은 늦게 도착한다: 색조가 바뀌었거나 사진이 새로 올라왔을 때만 다시 굽는다
    const photoVersion = this.photo?.image ? this.photo.version : -1;
    this.bakedTint.copy(t); this.bakedPhoto = photoVersion; this.bakeSky();
  }

  private bakeSky() {
    const r = this.renderer, prev = r.getRenderTarget(), autoClear = r.autoClear;
    r.autoClear = true;
    this.cubeCam.update(r, this.cubeScene);
    r.setRenderTarget(this.farRT);
    r.render(this.farScene, this.farCam);
    r.readRenderTargetPixels(this.farRT, 0, 0, 1, 1, this.farPixel);
    (this.surface.uniforms.uFarSea.value as THREE.Vector3).set(this.farPixel[0], this.farPixel[1], this.farPixel[2]);
    r.setRenderTarget(prev);
    r.autoClear = autoClear;
  }

  /** 매 프레임 본 렌더 전에: 파도 계산·코스틱·물 유니폼, 그리고 물속 모래 굴절 패스 */
  prepare(dt: number, camera: THREE.PerspectiveCamera) {
    const r = this.renderer;
    this.time += dt;
    // 하늘 사진이 막 도착했으면 큐브·먼 바다 색을 다시 굽는다 (처음엔 검은 사진으로 구워져 있다)
    if (this.photo?.image && this.photo.version !== this.bakedPhoto) { this.bakedPhoto = this.photo.version; this.bakeSky(); }
    const prev = r.getRenderTarget(), autoClear = r.autoClear, shadowAuto = r.shadowMap.autoUpdate;
    const clearAlpha = r.getClearAlpha();
    r.getClearColor(this.clearColor);
    r.autoClear = false; // 원본 패스들은 스스로 지운다
    const u = this.surface.uniforms;
    this.sim.update(dt);
    // 휴대폰은 코스틱을 한 프레임 걸러 갱신한다 (물결이 느려 티가 나지 않는다)
    if (!this.mobile || (this.frameNo++ & 1) === 0) this.caustics.update(this.sky.sunDir);
    this.surface.update(camera, this.time % 3600);
    if (this.mobile) {
      // 휴대폰은 늘 절반 밀도 격자 (정점 20만 → 5만). 바닷가 카메라는 낮아 원본은 촘촘한 쪽을 고른다.
      this.surface.mesh.geometry = this.surface.grids[1];
      u.uCellStep.value = (2 * Math.PI) / 192;
    }
    u.uCamSide.value = -1; // 바닷가 카메라는 늘 물 위
    (u.uSunDir.value as THREE.Vector3).copy(this.sky.sunDir);

    // 굴절: 물 아래 모래(와 절벽)만 낮은 해상도로 다시 그려 물이 읽는다. 그림자 지도는 다시 굽지 않는다.
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(1, Math.round(size.x * this.refractScale)), h = Math.max(1, Math.round(size.y * this.refractScale));
    if (!this.refractRT || this.refractRT.width !== w || this.refractRT.height !== h) {
      this.refractRT?.dispose();
      this.refractRT = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(w, h, THREE.FloatType), generateMipmaps: false,
      });
    }
    (u.uResolution.value as THREE.Vector2).copy(size);
    u.uSceneColor.value = this.refractRT.texture;
    u.uSceneDepth.value = this.refractRT.depthTexture;
    if (this.time - this.lastLightLayers > 2) {
      // 새로 켜진 불빛(모닥불 등)도 굴절 패스에서 모래를 비추게
      this.lastLightLayers = this.time;
      this.scene.traverse(o => { if ((o as THREE.Light).isLight) o.layers.enable(REFRACT_LAYER); });
    }
    const mask = camera.layers.mask, visible = this.surface.mesh.visible;
    camera.layers.set(REFRACT_LAYER);
    this.surface.mesh.visible = false;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.refractRT);
    r.setClearColor(new THREE.Color().setRGB(...(u.uFarSea.value as THREE.Vector3).toArray(), THREE.LinearSRGBColorSpace), 1);
    r.clear(true, true, false);
    r.render(this.scene, camera);
    camera.layers.mask = mask;
    this.surface.mesh.visible = visible;
    r.shadowMap.autoUpdate = shadowAuto;
    r.setRenderTarget(prev);
    r.setClearColor(this.clearColor, clearAlpha); // 엔진은 안개색으로 지운다
    r.autoClear = autoClear;
  }

  /** 꺼지면 물 메시를 숨기고 매 프레임 계산도 건너뛴다 (엔진이 화질을 낮췄을 때 원래 바다로) */
  get enabled() { return this.surface.mesh.visible; }
  set enabled(v: boolean) { this.surface.mesh.visible = v; }

  dispose() {
    this.surface.mesh.removeFromParent();
    this.surface.material.dispose();
    this.surface.mesh.geometry.dispose();
    this.refractRT?.dispose();
    this.cubeRT.dispose();
    this.farRT.dispose();
    this.cubeScene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
    this.farScene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
    disposeDeep(this.sim);
    disposeDeep(this.caustics);
    disposeDeep(this.floatShadow);
    this.foam.foam.dispose();
  }
}

function emptyReflection() {
  const t = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  t.needsUpdate = true;
  return t;
}

/**
 * 원본 물 셰이더에 덧대기 (원본 파일은 그대로):
 *  - 해수면을 SEA_Y 로: 화면 위치·시선 계산에만 높이를 더한다 (원본 좌표는 해수면 0 그대로)
 *  - 원점에서 ULTRA_RADIUS 밖은 버린다 (먼 바다 평면이 그린다), 경계 전에 원래 먼 바다 색으로 녹인다
 *  - 출력: 원본은 HDR + 자체 후처리, 여기서는 바닷가 렌더러의 톤 매핑·sRGB 로
 */
function patchWaterMaterial(material: THREE.ShaderMaterial) {
  const lift = "vec3(0.0, uSeaY, 0.0)";
  const must = (s: string, a: string, b: string) => { if (!s.includes(a)) throw new Error(`ultra-water patch: ${a.slice(0, 40)}`); return s.replace(a, b); };
  let v = material.vertexShader;
  v = must(v, "uniform float uGridScale;", "uniform float uGridScale;\nuniform float uSeaY;");
  v = must(v, "gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);", `gl_Position = projectionMatrix * viewMatrix * vec4(vWorld + ${lift}, 1.0);`);
  let f = material.fragmentShader;
  f = must(f, "uniform float uCamSide;", "uniform float uCamSide;\nuniform float uSeaY;\nuniform float uUltraRadius;\nuniform vec3 uFarSea;\nuniform float uFineNear;\n" + HORIZON_MELT);
  // 가까이(~10m 는 온전히, 80m 까지 서서히)만 잔 물결 두 겹(12m·2.1m 파장대)을 줄인다. 그보다 먼 물은 그대로.
  // 2차 모멘트도 같은 비율이라 줄어든 몫이 거칠기로 간다.
  f = must(f, "  vec4 s2 = texture(uSlope2, vXZ / uLength.z) * damp.z;\n  vec4 s3 = texture(uSlope3, vXZ / uLength.w) * damp.z;",
    "  float fineK = mix(uFineNear, 1.0, smoothstep(10.0, 80.0, dist));\n  vec4 s2 = texture(uSlope2, vXZ / uLength.z) * damp.z * fineK;\n  vec4 s3 = texture(uSlope3, vXZ / uLength.w) * damp.z * fineK;");
  f = must(f, "  vec3 toCam = cameraPosition - vWorld;", `  if (length(vWorld.xz) > uUltraRadius) discard;\n  vec3 toCam = cameraPosition - ${lift} - vWorld;`);
  f = f.split("viewMatrix * vec4(vWorld, 1.0)").join(`viewMatrix * vec4(vWorld + ${lift}, 1.0)`);
  // 물가의 얇은 막 처리는 굴절 화면에 실제 바닥이 있을 때만. 원본은 굴절 화면에 하늘까지 그리지만
  // 여기선 모래만 그리므로, 수평선 쪽 스치는 시선에서 빈(검은) 굴절 화면이 드러나던 것을 막는다.
  f = must(f, "  col = mix(refracted, col, smoothstep(0.0, 0.12 + dist * 5e-4, vth));",
    "  col = mix(refracted, col, max(smoothstep(0.0, 0.12 + dist * 5e-4, vth), step(0.9995, textureLod(uSceneDepth, ruv, 0.0).r)));");
  // 세로 결: 바닷가 카메라는 물을 스치듯 봐서, 물결 기울기마다 반사 비율(프레넬)이 0.3↔0.8 로 크게 뒤집혀
  // 해안과 나란한 물결이 밝고 어두운 줄로 늘어서 보인다. 반사 비율은 거의 평평한 법선으로 재고
  // (반사 방향·해 반사는 물결 그대로), 하늘 반사도 조금 줄인다. (측정: 줄무늬 대비 −67%, 밝기는 그대로)
  f = must(f, "  float F = F0 + (F90 - F0) * pow(1.0 - NoV, 5.0);",
    "  float NoVf = max(dot(normalize(mix(Nrm, vec3(0.0, 1.0, 0.0), 0.85)), V), 1e-4);\n  float F = F0 + (F90 - F0) * pow(1.0 - NoVf, 5.0);");
  f = must(f, "  vec3 col = mix(body, refl, F *", "  vec3 col = mix(body, refl, 0.8 * F *");
  // 먼 바다·수평선은 톤 매핑 뒤 화면 값으로 녹인다: 원래 먼 바다와 하늘 셰이더는 그 값을 톤 매핑 없이 그대로 쓴다
  // (톤 매핑 앞에서 섞으면 경계에 밝은 띠가 남는다). 수평선 바로 아래는 하늘과 같은 규칙으로 하늘 수평선 색에 녹는다.
  f = must(f, "  fragColor = vec4(col, 2.0);", `  #ifdef TONE_MAPPING
  col = toneMapping(col);
  #endif
  vec4 outColor = linearToOutputTexel(vec4(col, 1.0));
  // 먼 바다는 사진의 진한 파랑 그대로면 회청색(하늘 반사) 물과 베이지 수평선 사이에 진한 줄로 떠 보인다.
  // 스치는 시선의 물처럼 수평선 하늘을 반쯤 비친 색으로 녹인다 (먼 바다 평면 SEA_FRAG 도 같은 색).
  vec3 horizonSky = pow(max(skyLod(normalize(vec3(-V.x, 0.0, -V.z)), 0.0), vec3(0.0)), vec3(1.0 / 2.2));
  vec3 farTone = mix(pow(uFarSea, vec3(1.0 / 2.2)), horizonSky, ${FAR_SKY_SHARE.toFixed(2)});
  outColor.rgb = mix(outColor.rgb, farTone, smoothstep(uUltraRadius * 0.45, uUltraRadius * 0.95, dist));
  outColor.rgb = mix(outColor.rgb, horizonSky, horizonMelt(-V.y));
  fragColor = outColor;`);
  material.vertexShader = v;
  material.fragmentShader = f;
  material.toneMapped = true;
  material.side = THREE.FrontSide; // 바닷가 카메라는 물 밑으로 들어가지 않는다
  material.needsUpdate = true;
}

/** 모래 재질에 끼울 물가 셰이더 (MeshStandardMaterial onBeforeCompile 에서 사용) */
export const SAND_SHORE_PARS = /* glsl */ `
uniform float uSeaY;
uniform vec3 uSunDirT;
uniform vec3 uAbsorption;
uniform float uCausticStrength;
${CAUSTICS_GLSL}
${SHORE_GLSL}
${SWASH_GLSL}
`;

/** map_fragment 뒤: 젖은 모래·물가 막·거품 레이스, 물속 바닥에 닿는 햇빛 감쇠. vCoastWorld 가 필요하다. */
export const SAND_SHORE_ALBEDO = /* glsl */ `
  float hgt = vCoastWorld.y - uSeaY;
  {
    vec3 sw = swash(vCoastWorld.xz, hgt);
    float wet = max(1.0 - smoothstep(0.03, 0.35, hgt), sw.z);
    vec3 alb = diffuseColor.rgb;
    alb *= mix(vec3(1.0), mix(0.8 * alb + 0.06, vec3(0.62), smoothstep(0.0, -0.8, hgt)), wet);
    float film = smoothstep(0.0, 0.004, sw.x) * smoothstep(-0.05, 0.05, hgt);
    alb *= mix(vec3(1.0), vec3(0.9, 0.97, 0.97), smoothstep(0.0, 0.06, sw.x) * film);
    if (sw.y > 0.0) {
      float fwP = max(fwidth(vCoastWorld.x), fwidth(vCoastWorld.z));
      float lace = smoothstep(0.75 - 0.4 * sw.y, 0.92 - 0.3 * sw.y, vnoise(vCoastWorld.xz * 3.1 + uTime * 0.15) * 0.6 + vnoise(vCoastWorld.xz * 7.3) * 0.4);
      lace = mix(lace, 0.3, smoothstep(0.05, 0.3, fwP));
      alb = mix(alb, alb * 0.4 + vec3(0.42, 0.41, 0.38), min(sw.y * 1.4, 1.0) * lace * 0.7);
    }
    diffuseColor.rgb = alb;
    float wdepth = max(-hgt, 0.0);
    vec3 rsunA = refract(-uSunDirT, vec3(0.0, 1.0, 0.0), 1.0 / 1.33);
    diffuseColor.rgb *= exp(-uAbsorption * (wdepth / max(-rsunA.y, 0.1) * 0.6 + wdepth * 0.4));
  }
`;

/** lights_fragment_end 뒤: 물결이 모은 햇빛 무늬(코스틱)를 물속 바닥에 */
export const SAND_SHORE_CAUSTICS = /* glsl */ `
  {
    float wdepthC = max(-(vCoastWorld.y - uSeaY), 0.0);
    vec3 rsun = refract(-uSunDirT, vec3(0.0, 1.0, 0.0), 1.0 / 1.33);
    if (wdepthC > 0.0 && rsun.y < -0.05) {
      vec2 entry = vCoastWorld.xz + rsun.xz / rsun.y * wdepthC;
      vec2 fwc = fwidth(entry);
      float c = waveCaustic(entry, wdepthC, log2(max(max(fwc.x, fwc.y) * CAUSTIC_TEXELS_PER_M, 1.0)));
      float cs = uCausticStrength * mix(1.35, 1.0, smoothstep(1.5, 3.0, wdepthC)) * smoothstep(0.0, 0.3, wdepthC);
      reflectedLight.directDiffuse *= max(mix(1.0, c, cs), 0.0);
    }
  }
`;
