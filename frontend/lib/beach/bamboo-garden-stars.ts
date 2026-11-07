import * as THREE from "three";
import { SECRET_GARDEN, groundHeight, seededRandom } from "./bamboo-trail";

type Scalar = { value: number };
type Star = { x: number; y: number; z: number; size: number; phase: number; speed: number; accent: number; color: number };

/** Small lights on the inward faces of the enclosure, not a sky dome or extra lighting pass. */
export function buildBambooGardenStars(parent: THREE.Object3D, uniforms: { time: Scalar; night: Scalar; reveal: Scalar }) {
  const root = new THREE.Group(); root.name = "secret-garden-star-backdrop"; root.visible = false; parent.add(root);
  const rand = seededRandom(74531), stars: Star[] = [];
  const palette = [0xffedbd, 0xd5eaff, 0xe7d4ff, 0xffdf98, 0xf5f0e5];
  const rearCount = 360, sideCount = 160, entranceCount = 280;
  const add = (x: number, z: number, index: number) => {
    const accent = index % 17 === 0 ? 1 : 0;
    // Equal numbers in the upper and lower halves, with generous dark space
    // between points so the wall stays a quiet backdrop for the sculptures.
    stars.push({ x, z, y: groundHeight(x, z) + .9 + (index % 2) * 4.8 + rand() * 4.8,
      size: accent ? 1.45 + rand() * .35 : .46 + rand() * .42,
      phase: rand() * Math.PI * 2, speed: .52 + rand() * .35, accent,
      color: palette[Math.floor(rand() * palette.length)] });
  };
  for (let i = 0; i < rearCount; i++) {
    add(SECRET_GARDEN.minX + 1.6 + rand() * (SECRET_GARDEN.maxX - SECRET_GARDEN.minX - 3.2),
      SECRET_GARDEN.maxZ - .95 + (rand() - .5) * .08, i);
  }
  for (const side of [-1, 1]) for (let i = 0; i < sideCount; i++) {
    const x = side < 0 ? SECRET_GARDEN.minX + 1.5 : SECRET_GARDEN.maxX - 1.5;
    // Include the entrance wings added below z=92, without a bare first bay.
    // A small inward offset clears the opaque hedge surface without drawing through trees.
    add(x + (rand() - .5) * .08, 85.8 + (i + rand()) / sideCount * 26, i);
  }
  const veilHeight = 11.4, veilZ = 85.25, doorHalfWidth = 1.7, doorHeight = 3.4;
  // Lower stars are spread across the two wings, leaving the actual doorway clear.
  const entranceLeft = SECRET_GARDEN.minX + 1.2, entranceWidth = SECRET_GARDEN.maxX - SECRET_GARDEN.minX - 2.4;
  for (let i = 0; i < entranceCount; i++) {
    const fraction = (i + rand()) / entranceCount;
    const x = entranceLeft + fraction * entranceWidth;
    const z = 85.45 + (rand() - .5) * .06;
    add(x, z, i);
    const star = stars[stars.length - 1], height = star.y - groundHeight(x, z);
    if (height < doorHeight + .3) {
      const gapHalf = doorHalfWidth + .3, offset = fraction * (entranceWidth - gapHalf * 2);
      star.x = entranceLeft + offset + (offset >= SECRET_GARDEN.spineX - gapHalf - entranceLeft ? gapHalf * 2 : 0);
      star.y = groundHeight(star.x, z) + height;
    }
  }
  const veilGeometry = new THREE.BufferGeometry(), veilVertices: number[] = [], veilUvs: number[] = [];
  const veilVertex = (x: number, height: number) => {
    veilVertices.push(x, groundHeight(x, veilZ) + height, veilZ);
    veilUvs.push((x - SECRET_GARDEN.minX) / (SECRET_GARDEN.maxX - SECRET_GARDEN.minX), Math.max(0, height / veilHeight));
  };
  const veilPanel = (left: number, right: number, bottom: number) => {
    const segments = Math.ceil((right - left) / 2);
    for (let i = 0; i < segments; i++) {
      const a = THREE.MathUtils.lerp(left, right, i / segments), b = THREE.MathUtils.lerp(left, right, (i + 1) / segments);
      veilVertex(a, bottom); veilVertex(b, bottom); veilVertex(b, veilHeight);
      veilVertex(a, bottom); veilVertex(b, veilHeight); veilVertex(a, veilHeight);
    }
  };
  veilPanel(SECRET_GARDEN.minX, SECRET_GARDEN.spineX - doorHalfWidth, -.08);
  veilPanel(SECRET_GARDEN.spineX + doorHalfWidth, SECRET_GARDEN.maxX, -.08);
  veilPanel(SECRET_GARDEN.spineX - doorHalfWidth, SECRET_GARDEN.spineX + doorHalfWidth, doorHeight);
  veilGeometry.setAttribute("position", new THREE.Float32BufferAttribute(veilVertices, 3));
  veilGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(veilUvs, 2));
  veilGeometry.computeVertexNormals(); veilGeometry.computeBoundingSphere();
  const veilMaterial = new THREE.ShaderMaterial({
    uniforms: { uNight: uniforms.night, uReveal: uniforms.reveal },
    transparent: true, depthWrite: false, side: THREE.FrontSide, toneMapped: false,
    vertexShader: `varying vec2 vUv;
      void main() { vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uNight; uniform float uReveal; varying vec2 vUv;
      void main() {
        float edge=smoothstep(0.,.035,vUv.x)*smoothstep(0.,.035,1.-vUv.x);
        float top=1.-smoothstep(.94,1.,vUv.y);
        // Neutral black, fully covering the green bamboo once revealed.
        float cover=smoothstep(0.,.95,uNight*uReveal);
        gl_FragColor=vec4(0.,0.,0.,edge*top*cover);
        #include <colorspace_fragment>
      }`,
  });
  const entranceVeil = new THREE.Mesh(veilGeometry, veilMaterial);
  entranceVeil.name = "secret-garden-entrance-night-veil"; entranceVeil.renderOrder = 1; root.add(entranceVeil);
  entranceVeil.userData.opening = { x: SECRET_GARDEN.spineX, z: veilZ, halfWidth: doorHalfWidth, height: doorHeight };
  // The remaining three walls use the same inward-only night surface. There is
  // no solid box on the outside: the surrounding real bamboo remains visible.
  const wallGeometry = new THREE.BufferGeometry(), wallVertices: number[] = [], wallUvs: number[] = [];
  const wallVertex = (x: number, z: number, height: number) => {
    wallVertices.push(x, groundHeight(x, z) + height, z);
    // No horizontal edge fade at shared corners; only the upper rim softens.
    wallUvs.push(.5, Math.max(0, height / veilHeight));
  };
  const wallPanel = (ax: number, az: number, bx: number, bz: number) => {
    const segments = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
    for (let i = 0; i < segments; i++) {
      const a = i / segments, b = (i + 1) / segments;
      const x1 = THREE.MathUtils.lerp(ax, bx, a), z1 = THREE.MathUtils.lerp(az, bz, a);
      const x2 = THREE.MathUtils.lerp(ax, bx, b), z2 = THREE.MathUtils.lerp(az, bz, b);
      wallVertex(x1, z1, -.08); wallVertex(x2, z2, -.08); wallVertex(x2, z2, veilHeight);
      wallVertex(x1, z1, -.08); wallVertex(x2, z2, veilHeight); wallVertex(x1, z1, veilHeight);
    }
  };
  const west = SECRET_GARDEN.minX + .85, east = SECRET_GARDEN.maxX - .85, rear = SECRET_GARDEN.maxZ - .45;
  wallPanel(west, rear, west, veilZ);
  wallPanel(east, veilZ, east, rear);
  wallPanel(east, rear, west, rear);
  wallGeometry.setAttribute("position", new THREE.Float32BufferAttribute(wallVertices, 3));
  wallGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(wallUvs, 2));
  wallGeometry.computeVertexNormals(); wallGeometry.computeBoundingSphere();
  const interiorWalls = new THREE.Mesh(wallGeometry, veilMaterial);
  interiorWalls.name = "secret-garden-interior-night-walls"; interiorWalls.renderOrder = 1; root.add(interiorWalls);
  // Interleave all faces while retaining the same small star field on phones.
  for (let i = stars.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1)); [stars[i], stars[j]] = [stars[j], stars[i]];
  }
  const count = stars.length, positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
  const details = new Float32Array(count * 4), color = new THREE.Color();
  stars.forEach((star, i) => {
    positions.set([star.x, star.y, star.z], i * 3);
    color.setHex(star.color).toArray(colors, i * 3);
    details.set([star.size, star.phase, star.speed, star.accent], i * 4);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aStar", new THREE.BufferAttribute(details, 4));
  geometry.computeBoundingSphere();
  const pointLimit = { value: 14 };
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.time, uNight: uniforms.night, uReveal: uniforms.reveal, uPointLimit: pointLimit },
    vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec4 aStar;
      uniform float uTime; uniform float uPointLimit;
      varying vec3 vColor; varying float vShine; varying float vAccent; varying float vFacing;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.);
        float viewPhase = dot(normalize(-view.xyz), vec3(1.7, 2.3, .8));
        float wave = .5 + .5 * sin(uTime * aStar.z + aStar.y + viewPhase);
        vShine = .62 + .38 * wave;
        vAccent = aStar.w * (.28 + .72 * pow(wave, 4.));
        vColor = color;
        vec4 world = modelMatrix * vec4(position, 1.);
        float entrance = 1. - step(85.6, position.z);
        float inward = step(0., dot(cameraPosition-world.xyz, mat3(modelMatrix)*vec3(0.,0.,1.)));
        vFacing = mix(1., inward, entrance);
        gl_PointSize = clamp(aStar.x * 125. / max(1., -view.z), 2.4, uPointLimit);
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `uniform float uNight; uniform float uReveal;
      varying vec3 vColor; varying float vShine; varying float vAccent; varying float vFacing;
      void main() {
        if (vFacing < .5) discard;
        vec2 p = (gl_PointCoord - .5) * 2.;
        float radius = length(p);
        if (radius > 1.) discard;
        float halo = pow(1. - radius, 2.4);
        float core = 1. - smoothstep(.04, .3, radius);
        float cross = (exp(-abs(p.x) * 25.) + exp(-abs(p.y) * 25.))
          * pow(1. - radius, .65) * vAccent;
        float alpha = (halo * .75 + core * .85 + cross * .42) * vShine * uNight * uReveal;
        gl_FragColor = vec4(vColor * (1.5 + core * .65) + vec3(core * .14), alpha);
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geometry, material); points.name = "secret-garden-backdrop-stars"; points.renderOrder = 3; root.add(points);
  let disposed = false;
  return {
    root, points, entranceVeil, interiorWalls,
    setQuality(low: boolean) {
      if (disposed) return;
      geometry.setDrawRange(0, count); pointLimit.value = low ? 10 : 14;
    },
    dispose() {
      if (disposed) return;
      disposed = true; root.removeFromParent(); root.clear(); geometry.dispose(); material.dispose();
      veilGeometry.dispose(); wallGeometry.dispose(); veilMaterial.dispose();
    },
  };
}
