import * as THREE from "three";
import type { PowderSample } from "./fire-powder";
import type { PowderColor } from "./net";

const FIRE_PALETTES: Record<string, [number, number, number]> = {
  amber: [0xbf350b, 0xff9b36, 0xfff1bf],
  rose: [0xb52855, 0xff739f, 0xffeef1],
  aurora: [0x197352, 0x62eeb3, 0xe3fff2],
  ocean: [0x175eac, 0x67beff, 0xeaf6ff],
  violet: [0x612d9a, 0xc191ff, 0xf5eaff],
};

const NOISE = `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float turbulence(vec2 p) {
    return noise(p) * 0.57 + noise(p * 2.03 + 13.2) * 0.29 + noise(p * 4.1 - 8.6) * 0.14;
  }
`;

/** 장작이 다 타도 꺼지지 않는 불씨의 세기 (0~1 스케일). 작은 불꽃과 잔불이 자작자작 남는다 */
const EMBER_POWER = 0.07;
/** 장작을 넣었을 때 확 타오르는 정도와, 다시 잦아드는 데 걸리는 시간(초) */
const FLARE_STRENGTH = 0.9;
const FLARE_DECAY_SECONDS = 4.5;

/** Instanced tongues and charred wood, glowing coals, light smoke, sparks and a brief powder toss. */
export class CoastalFire {
  private flames: THREE.InstancedMesh;
  private logs: THREE.InstancedMesh;
  private coalMaterial: THREE.MeshStandardMaterial;
  private material: THREE.ShaderMaterial;
  private powderParticles: THREE.Points;
  private powderMaterial: THREE.ShaderMaterial;
  private powderStarted = -100;
  private powderFlareAt: number | null = null;
  private powderSample: PowderSample = { color: null, weight: 0, hue: 0 };
  private targetPower = EMBER_POWER + (1 - EMBER_POWER) * (3 / 12);
  private baseColors = FIRE_PALETTES.amber.map((color) => new THREE.Color(color));
  private powderColors = FIRE_PALETTES.amber.map((color) => new THREE.Color(color));
  private targetColors = FIRE_PALETTES.amber.map((color) => new THREE.Color(color));
  private lightTint = new THREE.Color(FIRE_PALETTES.amber[1]);
  private lastUpdateTime: number | null = null;
  /** 방금 넣은 장작이 타오르는 여분의 세기. 시간이 지나면 0 으로 잦아든다 */
  private flareLevel = 0;

  constructor(scene: THREE.Scene, x: number, z: number) {
    const wood = typeof document === "undefined"
      ? new THREE.Texture()
      : new THREE.TextureLoader().load("/beach/real/wood.jpg");
    wood.colorSpace = THREE.SRGBColorSpace;
    wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
    wood.anisotropy = 4;
    const logMaterial = new THREE.MeshStandardMaterial({ map: wood, color: 0x655b50, roughness: 1, emissive: 0x7d2107, emissiveIntensity: 0.1 });
    logMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = `varying vec3 vLogPosition; varying vec3 vLogNormal;\n${shader.vertexShader}`
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLogPosition = position; vLogNormal = normal;");
      shader.fragmentShader = `varying vec3 vLogPosition; varying vec3 vLogNormal;\n${NOISE}\n${shader.fragmentShader}`
        .replace("#include <map_fragment>", `#include <map_fragment>
          float grain = turbulence(vLogPosition.xy * vec2(24.0, 7.0) + vLogPosition.z * 9.0);
          float charred = smoothstep(0.24, 0.8, grain + (1.0 - smoothstep(0.2, 0.72, abs(vLogPosition.y))) * 0.25);
          diffuseColor.rgb *= mix(vec3(0.72, 0.64, 0.55), vec3(0.18, 0.16, 0.14), charred);
          float endGrain = 0.13 + 0.09 * sin(length(vLogPosition.xz) * 190.0 + grain * 4.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.14, 0.105, 0.076) * (0.65 + endGrain), smoothstep(0.65, 0.9, abs(vLogNormal.y)));
        `)
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= pow(max(0.0, 1.0 - abs(grain * 2.0 - 1.0)), 24.0) * 0.55;");
    };
    const logGeometry = new THREE.CylinderGeometry(0.12, 0.16, 1.5, 14, 7);
    const barkVertices = logGeometry.getAttribute("position");
    for (let i = 0; i < barkVertices.count; i++) {
      const x = barkVertices.getX(i), y = barkVertices.getY(i), z = barkVertices.getZ(i);
      const angle = Math.atan2(x, z);
      const bark = 0.94 + Math.sin(angle * 5 + y * 7) * 0.06 + Math.cos(angle * 3 - y * 12) * 0.035;
      barkVertices.setXYZ(i, x * bark, y, z * bark);
    }
    logGeometry.computeVertexNormals();
    this.logs = new THREE.InstancedMesh(logGeometry, logMaterial, 12);
    const transform = new THREE.Object3D();
    for (let i = 0; i < 12; i++) {
      const a = (i % 3) * Math.PI / 3 + Math.floor(i / 3) * 0.41;
      const spread = 0.2 + (i % 3) * 0.075;
      transform.position.set(x + Math.sin(a) * spread, 0.23 + Math.floor(i / 4) * 0.12, z + Math.cos(a) * spread);
      transform.rotation.set(Math.PI / 2 + Math.sin(i * 2.1) * 0.09, a, Math.sin(i) * 0.08, "YXZ");
      transform.scale.setScalar(0.86 + (i % 4) * 0.07);
      transform.updateMatrix();
      this.logs.setMatrixAt(i, transform.matrix);
    }
    this.logs.count = 3;
    this.logs.name = "campfire-charred-logs";
    this.logs.castShadow = this.logs.receiveShadow = true;
    scene.add(this.logs);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uPower: { value: this.targetPower },
        uOuter: { value: this.targetColors[0].clone() },
        uMid: { value: this.targetColors[1].clone() },
        uCore: { value: this.targetColors[2].clone() },
      },
      vertexShader: `
        uniform float uTime; uniform float uPower;
        attribute float aSeed;
        varying vec2 vUv; varying float vSeed;
        void main() {
          vUv = uv; vSeed = aSeed;
          float rise = uv.y;
          float heat = min(sqrt(max(uPower, 0.0)), 1.1);
          vec3 origin = instanceMatrix[3].xyz;
          origin.xz *= 0.65 + heat * 0.35;
          origin.y += 0.18;
          vec3 world = (modelMatrix * vec4(origin, 1.0)).xyz;
          vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
          vec3 cameraUp = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));
          float overhead = smoothstep(0.3, 0.95, abs(normalize(cameraPosition - world).y));
          vec3 up = normalize(mix(vec3(0.0, 1.0, 0.0), cameraUp, overhead * 0.55));
          float sway = sin(rise * 7.0 - uTime * 3.2 + aSeed * 23.0) * rise * rise * 0.15;
          sway += sin(rise * 12.0 - uTime * 4.8 + aSeed * 11.0) * rise * 0.045;
          float pulse = 0.94 + sin(uTime * 3.7 + aSeed * 31.0) * 0.055 + sin(uTime * 6.2 + aSeed * 9.0) * 0.025;
          float width = length(instanceMatrix[0].xyz) * (0.7 + heat * 0.3);
          float height = length(instanceMatrix[1].xyz) * (0.42 + heat * 1.44) * pulse;
          world += right * (position.x + sway) * width + up * position.y * height;
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime; uniform float uPower;
        uniform vec3 uOuter; uniform vec3 uMid; uniform vec3 uCore;
        varying vec2 vUv; varying float vSeed;
        ${NOISE}
        void main() {
          float t = uTime * (1.25 + vSeed * 0.6);
          vec2 p = vec2((vUv.x - 0.5) * 2.0, vUv.y);
          float flow = turbulence(vec2(p.x * 2.8 + vSeed * 29.0, p.y * 5.8 - t * 2.25));
          float detail = noise(vec2(p.x * 8.0 - vSeed * 11.0, p.y * 13.0 - t * 3.1));
          float bend = sin(p.y * 9.0 - t * 2.1 + vSeed * 19.0) * p.y * 0.18 + (flow - 0.5) * p.y * 0.5;
          float width = 0.76 * pow(max(1.0 - p.y, 0.0), 0.62) * (0.7 + flow * 0.6);
          float edge = abs(p.x + bend) - width + (detail - 0.5) * (0.07 + p.y * 0.28);
          float body = 1.0 - smoothstep(-0.09, 0.075, edge);
          float top = 1.0 - smoothstep(0.66 + flow * 0.2, 0.86 + flow * 0.13, p.y);
          float fork = (1.0 - smoothstep(0.025, 0.115, abs(p.x + bend * 0.5))) * smoothstep(0.38, 0.72, p.y);
          float wisps = smoothstep(0.13, 0.49, flow + (1.0 - p.y) * 0.22);
          float alpha = body * top * wisps * (1.0 - fork * 0.8) * smoothstep(0.0, 0.13, p.y);
          alpha *= (0.48 + flow * 0.27) * 0.4 * smoothstep(0.0, 0.035, uPower);
          float core = pow(body, 4.0) * exp(-p.y * 5.0) * (0.7 + flow * 0.4);
          vec3 color = mix(uOuter, uMid, clamp(body * 0.78 + detail * 0.16 - p.y * 0.22, 0.0, 1.0));
          color = mix(color, uCore * 1.1, core);
          color = mix(color, vec3(0.18, 0.32, 0.92), exp(-p.y * 33.0) * body * 0.27);
          if (alpha < 0.008) discard;
          gl_FragColor = vec4(color, alpha);
          #include <colorspace_fragment>
        }
      `,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    this.material.forceSinglePass = true;
    const flameGeometry = new THREE.PlaneGeometry(1, 1, 8, 20);
    flameGeometry.translate(0, 0.5, 0);
    const seeds = new Float32Array(17);
    for (let i = 0; i < seeds.length; i++) seeds[i] = i / seeds.length;
    flameGeometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    this.flames = new THREE.InstancedMesh(flameGeometry, this.material, seeds.length);
    for (let i = 0; i < seeds.length; i++) {
      const a = i * 2.399963;
      const outer = i > 4;
      transform.position.set(Math.sin(a) * (outer ? 0.48 : 0.16), 0.01 * (i % 3), Math.cos(a) * (outer ? 0.38 : 0.14));
      transform.rotation.set(0, 0, 0);
      transform.scale.set(outer ? 0.38 + i % 3 * 0.065 : 0.62, outer ? 0.45 + i % 4 * 0.09 : 0.9 + i * 0.025, 1);
      transform.updateMatrix();
      this.flames.setMatrixAt(i, transform.matrix);
    }
    this.flames.position.set(x, 0, z);
    this.flames.name = "campfire-tongues";
    this.flames.renderOrder = 4;
    this.flames.frustumCulled = false;
    scene.add(this.flames);

    const coalBedMaterial = new THREE.ShaderMaterial({
      uniforms: this.material.uniforms,
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `
        varying vec2 vUv; uniform float uTime; uniform float uPower;
        uniform vec3 uOuter; uniform vec3 uMid;
        ${NOISE}
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float edge = 1.0 - smoothstep(0.72, 1.0, length(p));
          float cracks = pow(1.0 - abs(turbulence(p * 11.0) * 2.0 - 1.0), 12.0);
          float pulse = 0.82 + noise(p * 4.0 + uTime * 0.32) * 0.3;
          float heat = (0.12 + sqrt(uPower) * 0.8) * cracks * pulse;
          vec3 color = mix(vec3(0.018, 0.012, 0.008), mix(uOuter, uMid, heat), heat * edge);
          gl_FragColor = vec4(color, edge);
          #include <colorspace_fragment>
        }
      `,
      transparent: true, depthWrite: false, toneMapped: false,
    });
    const coalBed = new THREE.Mesh(new THREE.CircleGeometry(1.03, 48), coalBedMaterial);
    coalBed.rotation.x = -Math.PI / 2;
    coalBed.position.set(x, 0.035, z);
    scene.add(coalBed);

    this.coalMaterial = new THREE.MeshStandardMaterial({ color: 0x292724, emissive: FIRE_PALETTES.amber[0], emissiveIntensity: 0.2, roughness: 1 });
    this.coalMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = `varying vec3 vCoalPosition;\n${shader.vertexShader}`
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCoalPosition = position;");
      shader.fragmentShader = `varying vec3 vCoalPosition;\n${NOISE}\n${shader.fragmentShader}`
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          float fissure = pow(1.0 - abs(turbulence(vCoalPosition.xy * 5.0 + vCoalPosition.z * 2.3) * 2.0 - 1.0), 18.0);
          totalEmissiveRadiance *= 0.015 + fissure * 1.2;
          diffuseColor.rgb *= 0.45 + noise(vCoalPosition.xz * 14.0) * 0.55;
        `);
    };
    const coalGeometry = new THREE.SphereGeometry(1, 9, 6);
    const coalVertices = coalGeometry.getAttribute("position");
    for (let i = 0; i < coalVertices.count; i++) {
      const x = coalVertices.getX(i), y = coalVertices.getY(i), z = coalVertices.getZ(i);
      const uneven = 0.84 + Math.sin(x * 12.3 + y * 7.1 + z * 9.4) * 0.1 + Math.cos(x * 5.7 - z * 11.4) * 0.07;
      coalVertices.setXYZ(i, x * uneven, y * uneven, z * uneven);
    }
    coalGeometry.computeVertexNormals();
    const coals = new THREE.InstancedMesh(coalGeometry, this.coalMaterial, 22);
    coals.name = "campfire-charcoal";
    for (let i = 0; i < 22; i++) {
      const a = i * 2.399963;
      const radius = 0.2 + ((i * 7) % 17) / 17 * 0.6;
      transform.position.set(x + Math.cos(a) * radius, 0.08, z + Math.sin(a) * radius);
      transform.rotation.set(i * 0.2, a, 0);
      transform.scale.set(0.1 + (i % 3) * 0.025, 0.06 + (i % 2) * 0.025, 0.08 + (i % 4) * 0.02);
      transform.updateMatrix();
      coals.setMatrixAt(i, transform.matrix);
    }
    coals.receiveShadow = true;
    scene.add(coals);

    const particleGeometry = (count: number) => {
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = Math.sin(i * 7.2) * 0.38;
        positions[i * 3 + 1] = i / count;
        positions[i * 3 + 2] = Math.cos(i * 3.7) * 0.38;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      return geometry;
    };
    const emberMaterial = new THREE.ShaderMaterial({
      uniforms: this.material.uniforms,
      vertexShader: `
        uniform float uTime; uniform float uPower; varying float vLife; varying float vSeed;
        void main() {
          float life = fract(position.y + uTime * (0.15 + position.x * 0.05));
          float heat = sqrt(uPower);
          vLife = life; vSeed = position.y;
          vec3 p = vec3(position.x + sin(life * 9.0 + position.y * 40.0) * life * 0.42,
            0.28 + life * (1.5 + heat * 2.2), position.z + sin(life * 6.0) * life * 0.18);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(27.0 / max(-mv.z, 0.1), 1.0, 3.0);
        }
      `,
      fragmentShader: `
        uniform float uPower; uniform vec3 uMid; uniform vec3 uCore;
        varying float vLife; varying float vSeed;
        void main() {
          float sparkVisible = 1.0 - smoothstep(0.03 + uPower * 0.9, 0.09 + uPower * 0.9, vSeed);
          float circle = 1.0 - smoothstep(0.04, 0.5, length(gl_PointCoord - 0.5));
          float alpha = circle * smoothstep(0.0, 0.08, vLife) * (1.0 - vLife) * sparkVisible;
          gl_FragColor = vec4(mix(uMid, uCore, 1.0 - vLife), alpha * 0.85);
          #include <colorspace_fragment>
        }
      `,
      transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    });
    const embers = new THREE.Points(particleGeometry(24), emberMaterial);
    embers.name = "campfire-embers";
    embers.position.set(x, 0, z);
    embers.frustumCulled = false;
    embers.renderOrder = 5;
    scene.add(embers);

    const smokeMaterial = new THREE.ShaderMaterial({
      uniforms: this.material.uniforms,
      vertexShader: `
        uniform float uTime; uniform float uPower; varying float vLife; varying float vSeed;
        void main() {
          float life = fract(position.y + uTime * 0.075);
          vLife = life; vSeed = position.y;
          float heat = sqrt(uPower);
          vec3 p = vec3(position.x * 0.6 + life * life * 0.8 + sin(life * 6.0 + position.y * 20.0) * life * 0.24,
            0.35 + heat * 1.0 + life * (2.2 + heat * 3.5), position.z * 0.65 + life * 0.2);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp((180.0 + life * 380.0) / max(-mv.z, 0.1), 3.0, 76.0);
        }
      `,
      fragmentShader: `
        uniform float uTime; uniform float uPower; varying float vLife; varying float vSeed;
        ${NOISE}
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float wisps = turbulence(p * 5.0 + vec2(vSeed * 17.0, -uTime * 0.13));
          float edge = 1.0 - smoothstep(0.14, 0.48, length(p) + (wisps - 0.5) * 0.14);
          float alpha = edge * wisps * smoothstep(0.0, 0.16, vLife) * pow(1.0 - vLife, 1.5);
          alpha *= 0.028 + min(uPower, 1.0) * 0.035;
          gl_FragColor = vec4(vec3(0.19, 0.18, 0.17), alpha);
          #include <colorspace_fragment>
        }
      `,
      transparent: true, depthWrite: false, toneMapped: false,
    });
    const smoke = new THREE.Points(particleGeometry(12), smokeMaterial);
    smoke.name = "campfire-smoke";
    smoke.position.set(x, 0, z);
    smoke.frustumCulled = false;
    smoke.renderOrder = 6;
    scene.add(smoke);

    const grains = 84;
    const powderGeometry = new THREE.BufferGeometry();
    powderGeometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(grains * 3), 3));
    const grainSeeds = new Float32Array(grains * 4);
    for (let i = 0; i < grains; i++) {
      grainSeeds.set([i / grains, Math.sin(i * 12.9898) * 0.5 + 0.5, Math.cos(i * 7.731) * 0.5 + 0.5, Math.sin(i * 3.17) * 0.5 + 0.5], i * 4);
    }
    powderGeometry.setAttribute("aGrain", new THREE.Float32BufferAttribute(grainSeeds, 4));
    this.powderMaterial = new THREE.ShaderMaterial({
      uniforms: { ...this.material.uniforms, uTossStart: { value: -100 }, uTossOrigin: { value: new THREE.Vector3() }, uTossColor: { value: new THREE.Color(0xffffff) } },
      vertexShader: `
        uniform float uTime; uniform float uTossStart; uniform vec3 uTossOrigin;
        attribute vec4 aGrain; varying float vAge; varying float vGrain;
        void main() {
          float age = uTime - uTossStart - aGrain.x * 0.22;
          float travel = clamp(age / 0.95, 0.0, 1.0);
          vec3 landing = vec3((aGrain.y - 0.5) * 0.58, 0.34 + aGrain.w * 0.18, (aGrain.z - 0.5) * 0.58);
          vec3 p = mix(uTossOrigin, landing, travel);
          p.y += sin(travel * 3.14159265) * (0.65 + aGrain.z * 0.25);
          p.xz += vec2(aGrain.z - 0.5, aGrain.w - 0.5) * sin(travel * 3.14159265) * 0.22;
          float burned = max(age - 0.95, 0.0);
          p.y += burned * (0.7 + aGrain.y * 0.8);
          p.xz += vec2(aGrain.y - 0.5, aGrain.z - 0.5) * burned * 0.8;
          vAge = age; vGrain = aGrain.w;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp((9.0 + aGrain.w * 7.0) / max(-mv.z, 0.1), 1.2, 4.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uTossColor; varying float vAge; varying float vGrain;
        void main() {
          float dot_ = 1.0 - smoothstep(0.05, 0.5, length(gl_PointCoord - 0.5));
          float alpha = smoothstep(0.0, 0.06, vAge) * (1.0 - smoothstep(1.02, 2.05, vAge)) * dot_;
          if (alpha < 0.005) discard;
          vec3 color = mix(uTossColor, vec3(1.0, 0.94, 0.76), 0.2 + vGrain * 0.35);
          gl_FragColor = vec4(color, alpha);
          #include <colorspace_fragment>
        }
      `,
      transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    });
    this.powderParticles = new THREE.Points(powderGeometry, this.powderMaterial);
    this.powderParticles.name = "campfire-powder-grains";
    this.powderParticles.position.set(x, 0, z);
    this.powderParticles.frustumCulled = false;
    this.powderParticles.renderOrder = 7;
    this.powderParticles.visible = false;
    scene.add(this.powderParticles);
  }

  setState(logs: number, color: string) {
    const count = Number.isFinite(logs) ? Math.round(THREE.MathUtils.clamp(logs, 0, 12)) : 3;
    this.logs.count = count;
    // 장작이 0 이어도 불씨는 남는다 (불멍 상태). 장작 수에 따라 그 위로 커진다
    this.targetPower = EMBER_POWER + (1 - EMBER_POWER) * (count / 12);
    const palette = FIRE_PALETTES[color] ?? FIRE_PALETTES.amber;
    for (let i = 0; i < 3; i++) this.baseColors[i].setHex(palette[i]);
  }

  setPowder(sample: PowderSample) { this.powderSample = sample; }

  /** One confirmed, fresh server event throws grains in an arc toward the charcoal. */
  tossPowder(color: PowderColor, from: THREE.Vector3, hue = 0) {
    const direction = new THREE.Vector2(from.x - this.flames.position.x, from.z - this.flames.position.z);
    if (direction.lengthSq() < 0.001) direction.set(0, 1);
    direction.normalize();
    this.powderMaterial.uniforms.uTossOrigin.value.set(direction.x * 1.8 - direction.y * 0.32, 1.05, direction.y * 1.8 + direction.x * 0.32);
    const tint = this.powderMaterial.uniforms.uTossColor.value as THREE.Color;
    if (color === "rainbow") tint.setHSL(hue, 0.82, 0.66, THREE.SRGBColorSpace);
    else tint.setHex((FIRE_PALETTES[color] ?? FIRE_PALETTES.amber)[1]);
    this.powderStarted = this.lastUpdateTime ?? 0;
    this.powderMaterial.uniforms.uTossStart.value = this.powderStarted;
    this.powderParticles.visible = true;
    this.powderFlareAt = this.powderStarted + 0.75;
  }

  get lightColor() { return this.lightTint; }

  /** 장작을 넣은 직후: 불이 확 타올랐다가 몇 초에 걸쳐 원래 세기로 잦아든다 */
  flare(strength = FLARE_STRENGTH) {
    this.flareLevel = Math.min(1.2, this.flareLevel + strength);
  }

  /** 지금 타오르는 여분의 세기 0~1.4 (조명도 같이 밝아지도록 바깥에 알려 준다) */
  get flareAmount() {
    return this.flareLevel;
  }

  update(time: number, camera: THREE.Camera) {
    const dt = this.lastUpdateTime === null ? 1 / 60 : THREE.MathUtils.clamp(time - this.lastUpdateTime, 0, 0.1);
    this.lastUpdateTime = time;
    if (this.powderFlareAt !== null && time >= this.powderFlareAt) {
      this.flare(0.32);
      this.powderFlareAt = null;
    }
    this.flareLevel *= Math.exp(-dt / FLARE_DECAY_SECONDS);
    if (this.flareLevel < 0.01) this.flareLevel = 0;
    const uniforms = this.material.uniforms;
    uniforms.uTime.value = time;
    const powder = this.powderSample;
    if (powder.color === "rainbow") {
      this.powderColors[0].setHSL(powder.hue, 0.86, 0.34, THREE.SRGBColorSpace);
      this.powderColors[1].setHSL((powder.hue + 0.035) % 1, 0.82, 0.66, THREE.SRGBColorSpace);
      this.powderColors[2].setHSL(powder.hue, 0.2, 0.94, THREE.SRGBColorSpace);
    } else if (powder.color) {
      const palette = FIRE_PALETTES[powder.color] ?? FIRE_PALETTES.amber;
      for (let i = 0; i < 3; i++) this.powderColors[i].setHex(palette[i]);
    }
    for (let i = 0; i < 3; i++) this.targetColors[i].copy(this.baseColors[i]).lerp(this.powderColors[i], powder.color ? powder.weight : 0);
    // 타오를 땐 빨리(0.25초), 잦아들 땐 천천히 따라간다
    const goal = Math.min(1.4, this.targetPower + this.flareLevel * 0.8);
    const blend = 1 - Math.exp(-dt * (goal > uniforms.uPower.value ? 4 : 2.2));
    uniforms.uPower.value += (goal - uniforms.uPower.value) * blend;
    for (const [i, name] of ["uOuter", "uMid", "uCore"].entries()) uniforms[name].value.lerp(this.targetColors[i], blend);
    this.flames.visible = true;
    void camera; // Every tongue faces the current camera in its vertex shader, including overhead views.
    this.powderParticles.visible = time - this.powderStarted < 2.5;
    this.lightTint.copy(uniforms.uMid.value).lerp(uniforms.uCore.value, 0.12);
    this.coalMaterial.emissive.copy(uniforms.uOuter.value);
    // 불씨 상태에선 잔불이 느리게 일렁인다
    const glowPulse = 1 + (Math.sin(time * 2.1) * 0.5 + Math.sin(time * 3.7) * 0.3) * 0.18 * (1 - Math.min(1, uniforms.uPower.value));
    this.coalMaterial.emissiveIntensity = (0.18 + Math.sqrt(uniforms.uPower.value) * 0.75) * glowPulse;
  }
}
