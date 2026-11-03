import * as THREE from "three";

/** Four real lamps and two inexpensive shared glow draws, all owned by the scene. */
export function buildNightLights(
  scene: THREE.Scene,
  floorPositions: readonly [number, number][],
  festoonPositions: readonly THREE.Vector3[],
): { applyDaylight(night: number): void } {
  const nightAmount = { value: 0 };
  const warm = { value: new THREE.Color(0xffbb78) };
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
    uniforms: { uNight: nightAmount, uWarm: warm },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec2 size = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
        center.xy += position.xy * size;
        gl_Position = projectionMatrix * center;
      }
    `,
    fragmentShader: `
      uniform float uNight;
      uniform vec3 uWarm;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float radiusSq = dot(p, p);
        float edge = 1.0 - smoothstep(0.45, 1.0, radiusSq);
        float core = exp(-radiusSq * 18.0);
        float haze = exp(-radiusSq * 4.5);
        float alpha = uNight * edge * (core * 0.24 + haze * 0.09);
        gl_FragColor = vec4(uWarm, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  const halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), haloMaterial, floorPositions.length + festoonPositions.length);
  halos.name = "coastal-lantern-halos";
  halos.renderOrder = 4;
  transform.rotation.set(0, 0, 0);
  for (let index = 0; index < halos.count; index++) {
    if (index < floorPositions.length) {
      const [x, z] = floorPositions[index];
      transform.position.set(x, 0.31, z);
      transform.scale.set(0.56, 0.56, 1);
    } else {
      transform.position.copy(festoonPositions[index - floorPositions.length]);
      transform.scale.set(0.5, 0.5, 1);
    }
    transform.updateMatrix();
    halos.setMatrixAt(index, transform.matrix);
  }
  for (const mesh of [pools, halos]) {
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
      for (const light of lamps) {
        light.intensity = 2.4 * amount;
        light.visible = amount > 0;
      }
    },
  };
}
