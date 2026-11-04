import * as THREE from "three";

/** Four ground lamps and three shared decorative draws; floating paper adds no real lights. */
export function buildNightLights(
  scene: THREE.Scene,
  floorPositions: readonly [number, number][],
  floatingPositions: readonly THREE.Vector3[],
): { applyDaylight(night: number): void; update(time: number): void } {
  const nightAmount = { value: 0 };
  const time = { value: 0 };
  const warm = { value: new THREE.Color(0xffbb78) };
  const redHalo = new THREE.Color(0xff7959);
  // Every third lantern scatters warm red accents through all three depth layers.
  const isRedLantern = (index: number) => index % 3 === 1;
  const lamps = floorPositions.slice(0, 4).map(([x, z], index) => {
    const light = new THREE.PointLight(0xffbb78, 0, 5, 2);
    light.name = `coastal-lantern-light-${index}`;
    light.position.set(x, 0.55, z);
    light.castShadow = false;
    light.visible = false;
    scene.add(light);
    return light;
  });

  const poolsMaterial = new THREE.ShaderMaterial({
    uniforms: { uNight: nightAmount, uWarm: warm },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uNight;
      uniform vec3 uWarm;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float radiusSq = dot(p, p);
        float falloff = pow(max(0.0, 1.0 - radiusSq), 3.0);
        float alpha = uNight * 0.15 * falloff;
        gl_FragColor = vec4(uWarm, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), poolsMaterial, floorPositions.length);
  pools.name = "coastal-lantern-ground-pools";
  pools.renderOrder = 2;
  const transform = new THREE.Object3D();
  for (const [index, [x, z]] of floorPositions.entries()) {
    transform.position.set(x, 0.018, z);
    transform.rotation.set(-Math.PI / 2, 0, 0);
    transform.scale.set(3.2, 3.2, 1);
    transform.updateMatrix();
    pools.setMatrixAt(index, transform.matrix);
  }

  const haloMaterial = new THREE.ShaderMaterial({
    uniforms: { uNight: nightAmount, uWarm: warm, uTime: time },
    vertexShader: `
      uniform float uTime;
      attribute vec2 lanternMotion;
      attribute vec3 lanternTint;
      varying vec2 vUv;
      varying vec3 vTint;
      void main() {
        vUv = uv;
        vTint = lanternTint;
        vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float phase = lanternMotion.x;
        vec3 sway = vec3(sin(uTime * 0.19 + phase) * 0.28, sin(uTime * 0.27 + phase * 0.7) * 0.18, cos(uTime * 0.16 + phase) * 0.22);
        center += modelViewMatrix * vec4(sway * lanternMotion.y, 0.0);
        vec2 size = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
        center.xy += position.xy * size;
        gl_Position = projectionMatrix * center;
      }
    `,
    fragmentShader: `
      uniform float uNight;
      uniform vec3 uWarm;
      varying vec2 vUv;
      varying vec3 vTint;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float radiusSq = dot(p, p);
        float edge = 1.0 - smoothstep(0.45, 1.0, radiusSq);
        float core = exp(-radiusSq * 18.0);
        float haze = exp(-radiusSq * 4.5);
        float alpha = uNight * edge * (core * 0.24 + haze * 0.09);
        gl_FragColor = vec4(vTint, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  const halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), haloMaterial, floorPositions.length + floatingPositions.length);
  halos.name = "coastal-lantern-halos";
  halos.renderOrder = 4;
  const motion = new Float32Array(halos.count * 2);
  const haloTints = new Float32Array(halos.count * 3);
  transform.rotation.set(0, 0, 0);
  for (let index = 0; index < halos.count; index++) {
    if (index < floorPositions.length) {
      const [x, z] = floorPositions[index];
      transform.position.set(x, 0.31, z);
      transform.scale.set(0.56, 0.56, 1);
      warm.value.toArray(haloTints, index * 3);
    } else {
      const floatingIndex = index - floorPositions.length;
      transform.position.copy(floatingPositions[floatingIndex]);
      const size = 0.72 + (Math.sin(floatingIndex * 2.31) + 1) * 0.16;
      transform.scale.set(size * 1.8, size * 2.2, 1);
      motion.set([floatingIndex * 2.399, 1], index * 2);
      (isRedLantern(floatingIndex) ? redHalo : warm.value).toArray(haloTints, index * 3);
    }
    transform.updateMatrix();
    halos.setMatrixAt(index, transform.matrix);
  }
  halos.geometry.setAttribute("lanternMotion", new THREE.InstancedBufferAttribute(motion, 2));
  halos.geometry.setAttribute("lanternTint", new THREE.InstancedBufferAttribute(haloTints, 3));

  // A closed paper volume stays visible when looking upward from beside the fire or a mat.
  const paperGeometry = new THREE.CylinderGeometry(0.43, 0.32, 1, 12, 5);
  const paperPositions = paperGeometry.getAttribute("position");
  for (let i = 0; i < paperPositions.count; i++) {
    const y = paperPositions.getY(i);
    const fullness = 1 + Math.sin((y + 0.5) * Math.PI) * 0.12;
    paperPositions.setXYZ(i, paperPositions.getX(i) * fullness, y, paperPositions.getZ(i) * fullness);
  }
  paperGeometry.computeVertexNormals();
  const paperMaterial = new THREE.ShaderMaterial({
    uniforms: { uNight: nightAmount, uTime: time },
    vertexShader: `
      uniform float uTime;
      attribute float lanternPhase;
      attribute float lanternRed;
      varying vec2 vUv;
      varying float vHeight;
      varying float vPhase;
      varying float vShade;
      varying float vRed;
      void main() {
        vUv = uv;
        vHeight = position.y + 0.5;
        vPhase = lanternPhase;
        vRed = lanternRed;
        vShade = 0.88 + normal.z * 0.08 + normal.x * 0.04;
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        world.xyz += vec3(sin(uTime * 0.19 + vPhase) * 0.28, sin(uTime * 0.27 + vPhase * 0.7) * 0.18, cos(uTime * 0.16 + vPhase) * 0.22);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uNight;
      uniform float uTime;
      varying vec2 vUv;
      varying float vHeight;
      varying float vPhase;
      varying float vShade;
      varying float vRed;
      void main() {
        float height = clamp(vHeight, 0.0, 1.0);
        float warmth = pow(1.0 - height, 1.6);
        vec3 paper = mix(vec3(0.74, 0.16, 0.025), vec3(1.38, 0.72, 0.20), warmth);
        vec3 redPaper = mix(vec3(0.62, 0.025, 0.014), vec3(1.30, 0.34, 0.08), warmth);
        paper = mix(paper, redPaper, vRed);
        // Faint folded paper seams, with a golden light source at the open lower end.
        float ribs = 1.0 - pow(0.5 + 0.5 * cos(vUv.x * 75.398), 16.0) * 0.055;
        float grain = 0.985 + 0.015 * sin(vUv.y * 130.0 + sin(vUv.x * 85.0));
        float flicker = 0.98 + 0.02 * sin(uTime * 1.4 + vPhase) * sin(uTime * 2.1 + vPhase);
        float rim = 1.0 - (1.0 - smoothstep(0.0, 0.035, height)) * 0.25;
        float alpha = uNight * 0.97;
        if (alpha < 0.008) discard;
        gl_FragColor = vec4(paper * vShade * ribs * grain * flicker * rim, alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
  });
  const paper = new THREE.InstancedMesh(paperGeometry, paperMaterial, floatingPositions.length);
  paper.name = "campfire-floating-paper-lanterns";
  paper.renderOrder = 3;
  const phases = new Float32Array(floatingPositions.length);
  const redAccents = new Float32Array(floatingPositions.length);
  for (let index = 0; index < floatingPositions.length; index++) {
    const size = 0.72 + (Math.sin(index * 2.31) + 1) * 0.16;
    transform.position.copy(floatingPositions[index]);
    transform.rotation.set(Math.sin(index * 1.7) * 0.045, index * 2.399, Math.cos(index * 1.3) * 0.055);
    transform.scale.set(size, size * (1.28 + (index % 3) * 0.1), size);
    transform.updateMatrix();
    paper.setMatrixAt(index, transform.matrix);
    phases[index] = index * 2.399;
    redAccents[index] = isRedLantern(index) ? 1 : 0;
  }
  paperGeometry.setAttribute("lanternPhase", new THREE.InstancedBufferAttribute(phases, 1));
  paperGeometry.setAttribute("lanternRed", new THREE.InstancedBufferAttribute(redAccents, 1));
  for (const mesh of [pools, halos, paper]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.count) mesh.computeBoundingSphere();
    mesh.visible = false;
    scene.add(mesh);
  }
  return {
    applyDaylight(night: number) {
      const clamped = Number.isFinite(night) ? THREE.MathUtils.clamp(night, 0, 1) : 0;
      const amount = clamped * clamped * (3 - 2 * clamped);
      nightAmount.value = amount;
      pools.visible = amount > 0 && pools.count > 0;
      halos.visible = amount > 0 && halos.count > 0;
      paper.visible = amount > 0 && paper.count > 0;
      for (const light of lamps) {
        light.intensity = 2.4 * amount;
        light.visible = amount > 0;
      }
    },
    update(elapsed: number) {
      if (Number.isFinite(elapsed)) time.value = elapsed;
    },
  };
}
