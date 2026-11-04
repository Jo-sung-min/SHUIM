import * as THREE from "three";
import { assetLoader, assetUrl } from "../assets";

/** Quarter-split wood: two cleaved faces meet above a small, irregular bark arc. */
function splitWoodGeometry() {
  const section: [number, number][] = [
    [-0.008, 0.055], [-0.086, -0.025], [-0.081, -0.061], [-0.043, -0.089],
    [0.006, -0.092], [0.055, -0.070], [0.083, -0.028], [0.066, -0.007],
  ];
  const segments = 8, positions: number[] = [], uvs: number[] = [], surfaces: number[] = [];
  const vertex = (point: THREE.Vector3, u: number, v: number, surface: number) => {
    positions.push(point.x, point.y, point.z); uvs.push(u, v); surfaces.push(surface);
  };
  const ringPoint = (ring: number, edge: number) => {
    const [x, y] = section[edge];
    const t = ring / segments;
    const taper = 0.96 + t * 0.05;
    const bark = edge > 0 && edge < section.length - 1;
    const rough = Math.sin(edge * 8.7 + ring * 1.9) * (bark ? 0.0035 : 0.0012);
    const bend = Math.sin(t * Math.PI) * 0.006;
    const chip = (ring === 0 || ring === segments) ? Math.sin(edge * 3.7 + ring) * 0.008 : 0;
    return new THREE.Vector3(x * taper + rough + bend, y * taper + rough * 0.5, t - 0.5 + chip);
  };
  for (let edge = 0; edge < section.length; edge++) {
    const next = (edge + 1) % section.length;
    const surface = edge === 0 || edge === section.length - 1 ? 1 : 0;
    for (let ring = 0; ring < segments; ring++) {
      const a = ringPoint(ring, edge), b = ringPoint(ring, next);
      const c = ringPoint(ring + 1, next), d = ringPoint(ring + 1, edge);
      const u0 = ring / segments * 1.4, u1 = (ring + 1) / segments * 1.4;
      const v0 = edge / section.length * 0.7, v1 = (edge + 1) / section.length * 0.7;
      vertex(a, u0, v0, surface); vertex(b, u0, v1, surface); vertex(c, u1, v1, surface);
      vertex(a, u0, v0, surface); vertex(c, u1, v1, surface); vertex(d, u1, v0, surface);
    }
  }
  for (const ring of [0, segments]) {
    const center = new THREE.Vector3(-0.005, -0.025, ring === 0 ? -0.5 : 0.5);
    for (let edge = 0; edge < section.length; edge++) {
      const a = ringPoint(ring, edge), b = ringPoint(ring, (edge + 1) % section.length);
      const triangle = ring === 0 ? [center, b, a] : [center, a, b];
      for (const p of triangle) vertex(p, p.x * 5 + 0.5, p.y * 5 + 0.5, 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("woodSurface", new THREE.Float32BufferAttribute(surfaces, 1));
  // Separate faces retain the small ridges left by splitting; no smooth tube normals.
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A compact pile owned entirely by the scene graph; count remains server-controlled. */
export function buildFirewood(scene: THREE.Scene, x: number, z: number): THREE.InstancedMesh {
  const wood = typeof document === "undefined" ? new THREE.Texture()
    : assetLoader(new THREE.TextureLoader()).load(assetUrl("/beach/real/wood.jpg"));
  wood.colorSpace = THREE.SRGBColorSpace;
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  wood.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({ map: wood, color: 0xffffff, roughness: 1, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute float woodSurface;\nvarying float vWoodSurface;\nvarying vec3 vWoodPosition;\n${shader.vertexShader}`
      .replace("#include <begin_vertex>", `
        #include <begin_vertex>
        vWoodSurface = woodSurface;
        vWoodPosition = position;
      `);
    shader.fragmentShader = `
      varying float vWoodSurface;
      varying vec3 vWoodPosition;
      float woodHash(vec2 p) {
        vec3 q = fract(vec3(p.xyx) * 0.1031);
        q += dot(q, q.yzx + 33.33);
        return fract((q.x + q.y) * q.z);
      }
      float woodNoise(vec2 p) {
        vec2 cell = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(woodHash(cell), woodHash(cell + vec2(1.0, 0.0)), f.x),
          mix(woodHash(cell + vec2(0.0, 1.0)), woodHash(cell + vec2(1.0)), f.x), f.y);
      }
      ${shader.fragmentShader}`
      .replace("#include <map_fragment>", `
        vec3 photoWood = texture2D(map, vMapUv).rgb;
        float across = vWoodPosition.x * 0.8 + vWoodPosition.y * 0.6;
        float broadGrain = woodNoise(vec2(vWoodPosition.z * 4.0, across * 90.0));
        float thinGrain = woodNoise(vec2(vWoodPosition.z * 12.0, across * 310.0));
        float furrow = smoothstep(0.65, 0.94, sin(across * 440.0 + broadGrain * 3.0));
        vec3 bark = photoWood * vec3(0.78, 0.69, 0.55) * (0.85 + broadGrain * 0.2 - furrow * 0.14);
        vec3 cleaved = mix(photoWood, vec3(0.48, 0.30, 0.15), 0.76)
          * (0.86 + broadGrain * 0.15 + thinGrain * 0.10);
        vec3 woodColor = mix(bark, cleaved, step(0.5, vWoodSurface));
        if (vWoodSurface > 1.5) {
          vec2 grainPoint = vec2(vWoodPosition.x + 0.008, (vWoodPosition.y + 0.028) * 1.13);
          float radius = length(grainPoint);
          float rings = sin(radius * 560.0 + woodNoise(grainPoint * 60.0) * 2.4);
          float angle = atan(grainPoint.y, grainPoint.x);
          float crack = (1.0 - smoothstep(0.016, 0.065, abs(sin(angle * 3.0 + 0.7))))
            * smoothstep(0.017, 0.075, radius);
          woodColor = vec3(0.46, 0.285, 0.14) * (0.9 + rings * 0.08 - crack * 0.34);
        }
        diffuseColor.rgb *= woodColor;
      `);
  };
  material.customProgramCacheKey = () => "small-split-firewood-v1";
  const logs = new THREE.InstancedMesh(splitWoodGeometry(), material, 12);
  logs.name = "campfire-charred-logs";
  const transform = new THREE.Object3D(), variation = new THREE.Color();
  for (let i = 0; i < 12; i++) {
    const layer = Math.floor(i / 4);
    const angle = i * 2.11 + layer * 0.37;
    transform.position.set(x + Math.cos(i * 2.7) * 0.14, [0.125, 0.205, 0.265][layer], z + Math.sin(i * 3.1) * 0.13);
    transform.rotation.set(Math.sin(i * 1.7) * 0.025, angle, Math.cos(i * 2.3) * 0.10);
    transform.scale.set(0.98 + Math.sin(i * 3.7) * 0.07, 0.92 + Math.cos(i * 2.1) * 0.06, 0.99 + Math.sin(i * 1.9) * 0.085);
    transform.updateMatrix();
    logs.setMatrixAt(i, transform.matrix);
    variation.setRGB(0.94 + Math.sin(i * 1.3) * 0.04, 0.91 + Math.sin(i * 1.3) * 0.04, 0.85 + Math.sin(i * 1.3) * 0.04);
    logs.setColorAt(i, variation);
  }
  logs.instanceMatrix.needsUpdate = true;
  if (logs.instanceColor) logs.instanceColor.needsUpdate = true;
  // Bounds include all twelve pieces even when the server initially shows only three.
  logs.computeBoundingBox();
  logs.computeBoundingSphere();
  logs.count = 3;
  logs.castShadow = logs.receiveShadow = true;
  scene.add(logs);
  return logs;
}
