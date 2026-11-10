/**
 * 2D 애니메이션풍 재질 3종 (씬 조명에 기대지 않고 셰이더 안에서 빛 하나로 계산한다 → 싸고 일정하다).
 *  - toon   : 부드러운 2~3단 명암, 그림자는 회색이 아닌 따뜻한 파스텔 톤, 아주 약한 테두리 빛, 볼 홍조.
 *             정점 색 alpha 에 구워 둔 '덮임' 값만큼 그림자 쪽으로 기울어 앞머리 아래 이마·턱 아래 목에 툰 그림자가 진다.
 *  - outline: 뒷면을 화면 픽셀 단위로 밀어내는 얇은 실루엣 선 (거리와 상관없이 같은 두께), 선 색은 바탕색의 어두운 톤.
 *  - face   : 눈·입. 빛을 받지 않는 그림처럼 칠하고 눈동자는 모프가 적용된 위치로 계산한다.
 */
import * as THREE from "three";
import { FACE } from "./design";

export interface ToonSettings {
  lightDir: THREE.Vector3;
  bands: 2 | 3;
  softness: number;
  rim: number;
  outline: boolean;
  outlineWidth: number;
}

const SKIN_VERT = /* glsl */ `
#include <common>
#include <color_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
`;

export function createToonMaterial() {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    uniforms: {
      uLightDir: { value: new THREE.Vector3(-0.38, 0.66, 0.66).normalize() },
      uShade: { value: new THREE.Color(0.86, 0.76, 0.84) },
      uShade2: { value: new THREE.Color(0.74, 0.64, 0.76) },
      uThreshold: { value: 0.43 },
      uThreshold2: { value: 0.18 },
      uThird: { value: 1 },
      uSoft: { value: 0.035 },
      uRim: { value: 0.22 },
      uBlush: { value: 0.32 },
      uBlushCenter: { value: new THREE.Vector3(FACE.blushX, FACE.blushY, 0) },
    },
    vertexShader: /* glsl */ `
      ${SKIN_VERT}
      varying vec3 vN;
      varying vec3 vView;
      varying vec3 vRest;
      void main() {
        #include <color_vertex>
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        vRest = transformed;
        #include <skinning_vertex>
        #include <project_vertex>
        vN = normalize(transformedNormal);
        vView = -mvPosition.xyz;
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <color_pars_fragment>
      uniform vec3 uLightDir;
      uniform vec3 uShade;
      uniform vec3 uShade2;
      uniform float uThreshold;
      uniform float uThreshold2;
      uniform float uThird;
      uniform float uSoft;
      uniform float uRim;
      uniform float uBlush;
      uniform vec3 uBlushCenter;
      varying vec3 vN;
      varying vec3 vView;
      varying vec3 vRest;
      void main() {
        vec3 N = normalize(vN);
        if (!gl_FrontFacing) N = -N;
        vec3 V = normalize(vView);
        vec3 L = normalize((viewMatrix * vec4(uLightDir, 0.0)).xyz);
        // 반 람베르트로 부드럽게 펴고, 덮임 값만큼 그림자 쪽으로
        float hl = dot(N, L) * 0.5 + 0.5 - vColor.a * 0.42;
        float lit = smoothstep(uThreshold - uSoft, uThreshold + uSoft, hl);
        float mid = mix(1.0, smoothstep(uThreshold2 - uSoft, uThreshold2 + uSoft, hl), uThird);
        vec3 base = vColor.rgb;
        // 볼 홍조: 휴식 자세 좌표로 얼굴에 붙어 다닌다
        vec2 bq = vec2(abs(vRest.x) - uBlushCenter.x, vRest.y - uBlushCenter.y) / vec2(0.034, 0.02);
        float blush = (1.0 - smoothstep(0.35, 1.0, length(bq))) * step(0.04, vRest.z) * step(0.42, vRest.y) * uBlush;
        base = mix(base, base * vec3(1.0, 0.62, 0.64), blush);
        vec3 col = mix(base * uShade2, base * uShade, mid);
        col = mix(col, base, lit);
        // 아주 약한 테두리 빛 (밝은 쪽에만)
        float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * uRim * lit;
        col += rim * vec3(1.0, 0.96, 0.93);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function createOutlineMaterial() {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    uniforms: {
      uWidth: { value: 1.1 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uColor: { value: new THREE.Color(0.5, 0.36, 0.4) },
    },
    vertexShader: /* glsl */ `
      ${SKIN_VERT}
      uniform float uWidth;
      uniform vec2 uRes;
      void main() {
        #include <color_vertex>
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        // 화면 픽셀 단위로 노멀 방향을 따라 민다 → 카메라 거리와 상관없이 같은 두께
        vec4 cn = projectionMatrix * vec4(transformedNormal, 0.0);
        vec2 dir = cn.xy * uRes;
        float l = length(dir);
        if (l > 1e-5) gl_Position.xy += (dir / l) / uRes * 2.0 * uWidth * gl_Position.w;
        gl_Position.z += 0.00002 * gl_Position.w;
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <color_pars_fragment>
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(vColor.rgb * uColor, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function createFaceMaterial() {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    uniforms: {
      uEye: { value: new THREE.Vector2(FACE.eyeX, FACE.eyeY) },
      uGaze: { value: new THREE.Vector2(0, 0) },
      uIrisTop: { value: new THREE.Color("#4d3aa8") },
      uIrisMid: { value: new THREE.Color("#8a78ea") },
      uIrisLow: { value: new THREE.Color("#d9b4f4") },
      uPupil: { value: new THREE.Color("#35267a") },
      uSclera: { value: new THREE.Color("#ffffff") },
      uScleraShade: { value: new THREE.Color("#d7d0ee") },
    },
    vertexShader: /* glsl */ `
      ${SKIN_VERT}
      varying vec2 vKind;
      varying vec3 vMorph;
      void main() {
        #include <color_vertex>
        vKind = uv;
        #include <skinbase_vertex>
        #include <begin_vertex>
        #include <morphtarget_vertex>
        vMorph = transformed;
        #include <skinning_vertex>
        #include <project_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <color_pars_fragment>
      uniform vec2 uEye;
      uniform vec2 uGaze;
      uniform vec3 uIrisTop, uIrisMid, uIrisLow, uPupil, uSclera, uScleraShade;
      varying vec2 vKind;
      varying vec3 vMorph;
      float aa(float d) { float w = fwidth(d) * 0.75; return 1.0 - smoothstep(-w, w, d); }
      void main() {
        vec3 col = vColor.rgb;
        if (vKind.x < 0.5) {
          float s = vKind.y;
          // 눈 좌표: dx 는 화면(월드) 방향 그대로 → 양쪽 눈 하이라이트가 같은 쪽(왼쪽 위)에 맺힌다
          float dx = vMorph.x - s * uEye.x - s * 0.004 - uGaze.x;
          float dy = vMorph.y - uEye.y + 0.007 - uGaze.y;
          vec2 q = vec2(dx / 0.0435, dy / 0.05);
          float r = length(q);
          float iris = aa(r - 1.0);
          float t = clamp(dy / 0.05 * 0.5 + 0.5, 0.0, 1.0);
          vec3 ic = mix(uIrisLow, uIrisMid, smoothstep(0.08, 0.55, t));
          ic = mix(ic, uIrisTop, smoothstep(0.5, 0.95, t));
          // 눈동자 가장자리 살짝 진하게, 동공
          ic = mix(ic, uIrisTop, smoothstep(0.78, 1.0, r) * 0.55);
          float pupil = aa(length(vec2(dx / 0.016, (dy - 0.004) / 0.022)) - 1.0);
          ic = mix(ic, uPupil, pupil * 0.85);
          // 흰자: 위 눈꺼풀 그늘
          vec3 sc = mix(uSclera, uScleraShade, smoothstep(-0.004, 0.018, vMorph.y - uEye.y));
          col = mix(sc, ic, iris);
          // 하이라이트 (빛을 받지 않는 그림처럼)
          float h1 = aa(length(vec2((dx + 0.012) / 0.0105, (dy - 0.012) / 0.0135)) - 1.0);
          float h2 = aa(length(vec2((dx - 0.012) / 0.0052, (dy + 0.022) / 0.0052)) - 1.0);
          col = mix(col, vec3(1.0), max(h1, h2 * 0.9));
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** 바닥에 까는 둥근 그림자 (실시간 그림자 대신) */
export function createBlobShadow() {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uOpacity: { value: 0.22 }, uColor: { value: new THREE.Color("#7a6c9a") } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uOpacity; uniform vec3 uColor; varying vec2 vUv;
      void main(){ float d = length(vUv - 0.5) * 2.0; float a = (1.0 - smoothstep(0.35, 1.0, d)) * uOpacity; gl_FragColor = vec4(uColor, a);
      #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.5), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  mesh.renderOrder = -1;
  return mesh;
}
