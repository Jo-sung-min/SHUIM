import * as THREE from "three";

const FIRE_PALETTES: Record<string, [number, number, number]> = {
  amber: [0xbf350b, 0xff9b36, 0xfff1bf],
  rose: [0xc94e67, 0xffa5a3, 0xfff2d3],
  aurora: [0x329879, 0xa1edbf, 0xfff4d2],
  ocean: [0x387eae, 0x9ed8ee, 0xfff4dc],
  violet: [0x8657ac, 0xd4afe9, 0xffeed7],
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

/** Layered translucent tongues, glowing charcoal, smoke and sparks in six draw calls. */
export class CoastalFire {
  private flames: THREE.InstancedMesh;
  private logs: THREE.InstancedMesh;
  private coalMaterial: THREE.MeshStandardMaterial;
  private material: THREE.ShaderMaterial;
  private targetPower = 3 / 12;
  private targetColors = FIRE_PALETTES.amber.map((color) => new THREE.Color(color));
  private lastUpdateTime: number | null = null;

  constructor(scene: THREE.Scene, x: number, z: number) {
    const wood = typeof document === "undefined"
      ? new THREE.Texture()
      : new THREE.TextureLoader().load("/beach/real/wood.jpg");
    wood.colorSpace = THREE.SRGBColorSpace;
    wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
    wood.anisotropy = 4;
    const logMaterial = new THREE.MeshStandardMaterial({ map: wood, color: 0x67523c, roughness: 0.98 });
    this.logs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 1.5, 14, 3), logMaterial, 12);
    const transform = new THREE.Object3D();
    for (let i = 0; i < 12; i++) {
      const a = i * 2.399963;
      const spread = 0.2 + (i % 3) * 0.075;
      transform.position.set(x + Math.sin(a) * spread, 0.23 + Math.floor(i / 4) * 0.12, z + Math.cos(a) * spread);
      transform.rotation.set(1.35 + Math.sin(i * 2.1) * 0.15, a, Math.sin(i) * 0.15);
      transform.scale.setScalar(0.86 + (i % 4) * 0.07);
      transform.updateMatrix();
      this.logs.setMatrixAt(i, transform.matrix);
    }
    this.logs.count = 3;
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
          vec3 p = position;
          p.x += sin(rise * 8.0 - uTime * 3.1 + aSeed * 9.0) * rise * rise * 0.075;
          p.z += sin(rise * 5.0 - uTime * 2.0 + aSeed * 17.0) * rise * 0.06;
          p.y *= 0.93 + sin(uTime * 4.3 + aSeed * 18.0) * 0.055 + sin(uTime * 7.0 + aSeed * 5.0) * 0.025;
          vec4 local = instanceMatrix * vec4(p, 1.0);
          float heat = sqrt(max(uPower, 0.0));
          local.xz *= 0.62 + heat * 0.42;
          local.y *= 0.42 + heat * 3.3;
          local.y += 0.16;
          gl_Position = projectionMatrix * modelViewMatrix * local;
        }
      `,
      fragmentShader: `
        uniform float uTime; uniform float uPower;
        uniform vec3 uOuter; uniform vec3 uMid; uniform vec3 uCore;
        varying vec2 vUv; varying float vSeed;
        ${NOISE}
        void main() {
          float t = uTime * (1.5 + vSeed * 0.45);
          vec2 p = vUv;
          float flow = turbulence(vec2(p.x * 4.5 + vSeed * 31.0, p.y * 5.5 - t * 2.2));
          float detail = turbulence(vec2(p.x * 10.0 - vSeed * 9.0, p.y * 11.0 - t * 3.1));
          float bend = sin(p.y * 7.0 - t * 1.8 + vSeed * 23.0) * p.y * 0.075;
          bend += (flow - 0.5) * p.y * 0.18;
          float width = 0.36 * pow(max(1.0 - p.y, 0.0), 0.7) * (0.72 + flow * 0.65);
          float body = 1.0 - smoothstep(width * 0.28, width + 0.045, abs(p.x - 0.5 + bend));
          float top = 1.0 - smoothstep(0.46 + flow * 0.3, 0.73 + flow * 0.25, p.y);
          float wisps = smoothstep(0.17, 0.52, detail + (1.0 - p.y) * 0.16);
          float alpha = body * top * wisps * smoothstep(0.0, 0.075, p.y);
          alpha *= 0.42 + flow * 0.28;
          alpha *= smoothstep(0.0, 0.035, uPower);
          vec3 color = mix(uOuter, uMid, body * (0.75 - p.y * 0.38) + detail * 0.15);
          color = mix(color, uCore, pow(body, 5.0) * pow(1.0 - p.y, 2.1) * 0.9);
          gl_FragColor = vec4(color, alpha);
          #include <colorspace_fragment>
        }
      `,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      blending: THREE.NormalBlending,
    });
    this.material.forceSinglePass = true;
    const flameGeometry = new THREE.PlaneGeometry(1, 1, 3, 10);
    flameGeometry.translate(0, 0.5, 0);
    const seeds = new Float32Array(9);
    for (let i = 0; i < seeds.length; i++) seeds[i] = i / seeds.length;
    flameGeometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    this.flames = new THREE.InstancedMesh(flameGeometry, this.material, seeds.length);
    for (let i = 0; i < seeds.length; i++) {
      const a = i * 2.399963;
      const outer = i > 2;
      transform.position.set(Math.sin(a) * (outer ? 0.38 : 0.16), 0.01 * (i % 3), Math.cos(a) * 0.24);
      transform.rotation.set(0, Math.sin(a) * 0.4, Math.sin(a * 1.4) * 0.09);
      transform.scale.set(outer ? 0.58 + i % 2 * 0.12 : 0.95, outer ? 0.54 + i % 3 * 0.14 : 0.91 + i * 0.045, 1);
      transform.updateMatrix();
      this.flames.setMatrixAt(i, transform.matrix);
    }
    this.flames.position.set(x, 0, z);
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
          float cracks = pow(turbulence(p * 8.0), 2.5);
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

    this.coalMaterial = new THREE.MeshStandardMaterial({ color: 0x29221b, emissive: FIRE_PALETTES.amber[0], emissiveIntensity: 0.2, roughness: 0.98 });
    const coals = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), this.coalMaterial, 22);
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
            0.28 + life * (1.9 + heat * 3.2), position.z + sin(life * 6.0) * life * 0.18);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(38.0 / max(-mv.z, 0.1), 1.0, 4.0);
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
    const embers = new THREE.Points(particleGeometry(36), emberMaterial);
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
          alpha *= 0.07 + uPower * 0.06;
          gl_FragColor = vec4(vec3(0.19, 0.18, 0.17), alpha);
          #include <colorspace_fragment>
        }
      `,
      transparent: true, depthWrite: false, toneMapped: false,
    });
    const smoke = new THREE.Points(particleGeometry(16), smokeMaterial);
    smoke.position.set(x, 0, z);
    smoke.frustumCulled = false;
    smoke.renderOrder = 6;
    scene.add(smoke);
  }

  setState(logs: number, color: string) {
    const count = Number.isFinite(logs) ? Math.round(THREE.MathUtils.clamp(logs, 0, 12)) : 3;
    this.logs.count = count;
    this.targetPower = count / 12;
    const palette = FIRE_PALETTES[color] ?? FIRE_PALETTES.amber;
    for (let i = 0; i < 3; i++) this.targetColors[i].setHex(palette[i]);
  }

  update(time: number, camera: THREE.Camera) {
    const dt = this.lastUpdateTime === null ? 1 / 60 : THREE.MathUtils.clamp(time - this.lastUpdateTime, 0, 0.1);
    this.lastUpdateTime = time;
    const blend = 1 - Math.exp(-dt * 4);
    const uniforms = this.material.uniforms;
    uniforms.uTime.value = time;
    uniforms.uPower.value += (this.targetPower - uniforms.uPower.value) * blend;
    if (this.targetPower === 0 && uniforms.uPower.value < 0.0005) uniforms.uPower.value = 0;
    for (const [i, name] of ["uOuter", "uMid", "uCore"].entries()) uniforms[name].value.lerp(this.targetColors[i], blend);
    this.flames.visible = uniforms.uPower.value > 0;
    this.flames.rotation.y = Math.atan2(camera.position.x - this.flames.position.x, camera.position.z - this.flames.position.z);
    this.coalMaterial.emissive.copy(uniforms.uOuter.value);
    this.coalMaterial.emissiveIntensity = 0.12 + Math.sqrt(uniforms.uPower.value) * 0.55;
  }
}
