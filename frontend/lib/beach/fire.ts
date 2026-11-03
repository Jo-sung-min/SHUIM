import * as THREE from "three";

/** Soft, continuously moving flames; avatars are the only pixel-art objects. */
export class CoastalFire {
  private flame: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private embers: THREE.Points;

  constructor(scene: THREE.Scene, x: number, z: number) {
    const wood = new THREE.TextureLoader().load("/beach/real/wood.jpg");
    wood.colorSpace = THREE.SRGBColorSpace;
    wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
    const logMaterial = new THREE.MeshStandardMaterial({ map: wood, color: 0x30251e, roughness: 0.98 });
    const logGeometry = new THREE.CylinderGeometry(0.12, 0.16, 1.5, 12, 2);
    for (let i = 0; i < 6; i++) {
      const log = new THREE.Mesh(logGeometry, logMaterial);
      const a = i * Math.PI / 3;
      log.position.set(x + Math.sin(a) * 0.22, 0.22 + i % 2 * 0.09, z + Math.cos(a) * 0.22);
      log.rotation.set(1.15, a, 0.16);
      log.castShadow = log.receiveShadow = true;
      scene.add(log);
    }

    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        varying vec2 vUv; uniform float uTime;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        void main() {
          vec2 p = vUv; float t = uTime;
          float n = noise(vec2(p.x * 7.0, p.y * 5.0 - t * 3.0));
          n += noise(vec2(p.x * 15.0 + 3.2, p.y * 13.0 - t * 5.0)) * 0.45;
          float bend = sin(p.y * 8.0 - t * 2.3) * p.y * 0.07;
          float width = (0.42 - p.y * 0.37) * (0.7 + n * 0.4);
          float core = 1.0 - smoothstep(width * 0.3, width, abs(p.x - 0.5 + bend));
          float height = 1.0 - smoothstep(0.45 + n * 0.23, 0.9 + n * 0.06, p.y);
          float alpha = core * height * smoothstep(0.0, 0.08, p.y);
          alpha *= 0.55 + noise(vec2(p.x * 11.0, p.y * 9.0 - t * 4.0)) * 0.45;
          vec3 color = mix(vec3(1.0, 0.18, 0.018), vec3(1.0, 0.72, 0.19), core * (1.0 - p.y));
          color = mix(color, vec3(1.0, 0.94, 0.66), pow(core, 6.0) * pow(1.0 - p.y, 3.0));
          gl_FragColor = vec4(color, alpha * 0.92);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    this.flame = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 2.1), this.material);
    this.flame.position.set(x, 1.08, z);
    this.flame.renderOrder = 4;
    scene.add(this.flame);

    const positions = new Float32Array(18 * 3);
    for (let i = 0; i < 18; i++) {
      positions[i * 3] = Math.sin(i * 7.2) * 0.45;
      positions[i * 3 + 1] = i / 18;
      positions[i * 3 + 2] = Math.cos(i * 3.7) * 0.45;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const embers = new THREE.ShaderMaterial({
      uniforms: this.material.uniforms,
      vertexShader: `
        uniform float uTime; varying float vLife;
        void main() {
          float life = fract(position.y + uTime * 0.17); vLife = 1.0 - life;
          vec3 p = vec3(position.x + sin(life * 9.0 + position.y * 40.0) * life * 0.3, 0.5 + life * 2.6, position.z);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(24.0 / -mv.z, 1.0, 3.0);
        }`,
      fragmentShader: `varying float vLife; void main() { float a = 1.0 - smoothstep(0.1, 0.5, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(1.0, 0.46, 0.09, a * vLife); }`,
      transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    });
    this.embers = new THREE.Points(geometry, embers);
    this.embers.position.set(x, 0, z);
    this.embers.frustumCulled = false;
    scene.add(this.embers);
  }

  update(time: number, camera: THREE.Camera) {
    this.material.uniforms.uTime.value = time;
    this.flame.rotation.y = Math.atan2(camera.position.x - this.flame.position.x, camera.position.z - this.flame.position.z);
  }
}
