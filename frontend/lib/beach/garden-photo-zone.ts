import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GARDEN_PHOTO_ZONE, GROUND_Y } from "./garden-layout";

/** An open-air light exhibition. The same six batches are used on phones and desktop;
 * light spills are flat, translucent shapes rather than extra realtime lights. */
export function buildGardenPhotoZone(parent: THREE.Object3D, mobile: boolean) {
  const root = new THREE.Group();
  root.name = "garden-photo-zone";
  parent.add(root);
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const tubes: THREE.BufferGeometry[] = [], halos: THREE.BufferGeometry[] = [];
  const bases: THREE.BufferGeometry[] = [], frames: THREE.BufferGeometry[] = [], spills: THREE.BufferGeometry[] = [];
  const cream = 0xffe7b3, pink = 0xff94bd, lavender = 0xb8a5ff, teal = 0x8ee4d8;
  const rearZ = GARDEN_PHOTO_ZONE.z - 1.75;
  const colorize = (geometry: THREE.BufferGeometry, hex: number) => {
    const color = new THREE.Color(hex), count = geometry.getAttribute("position").count;
    const data = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) color.toArray(data, i * 3);
    geometry.setAttribute("color", new THREE.BufferAttribute(data, 3));
    return geometry;
  };
  const push = (list: THREE.BufferGeometry[], geometry: THREE.BufferGeometry, x: number, y: number, z: number) => {
    geometry.translate(x, GROUND_Y + y, z); list.push(geometry);
  };
  const tube = (points: THREE.Vector3[], hex: number, radius = 0.035, closed = false) => {
    const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal");
    const segments = Math.max(12, Math.min(mobile ? 72 : 100, points.length * 2));
    for (const [list, r] of [[tubes, radius], [halos, radius * 3.5]] as const) {
      list.push(colorize(new THREE.TubeGeometry(curve, segments, r, 5, closed), hex));
    }
  };
  const line = (points: number[][], hex: number, radius = 0.035, closed = false) =>
    tube(points.map(([x, y, z]) => new THREE.Vector3(x, GROUND_Y + y, z)), hex, radius, closed);
  const loop = (x: number, y: number, z: number, r: number, hex: number, shape: (a: number) => [number, number], count = 48) => {
    const points = Array.from({ length: count }, (_, i) => {
      const [px, py] = shape(i / count * Math.PI * 2);
      return [x + px * r, y + py * r, z];
    });
    line(points, hex, 0.038, true);
  };
  const plinth = (x: number, z: number, radius: number) => {
    // Flush stone inlays: visitors can pose inside the sculptures without sinking into a step.
    push(bases, new THREE.CylinderGeometry(radius, radius + 0.12, 0.16, 24), x, -0.068, z);
    line(Array.from({ length: 40 }, (_, i) => [x + Math.cos(i / 40 * Math.PI * 2) * radius, 0.025, z + Math.sin(i / 40 * Math.PI * 2) * radius]), cream, 0.018, true);
  };
  const spill = (x: number, z: number, size: number, hex: number) => {
    const geometry = new THREE.PlaneGeometry(size, size);
    geometry.rotateX(-Math.PI / 2);
    push(spills, colorize(geometry, hex), x, 0.025, z);
  };
  const star = (x: number, y: number, z: number, radius: number, hex: number) => {
    const points = Array.from({ length: 8 }, (_, i) => {
      const a = Math.PI / 2 + i * Math.PI / 4, r = radius * (i % 2 ? 0.25 : 1);
      return [x + Math.cos(a) * r, y + Math.sin(a) * r, z];
    });
    line(points, hex, 0.022, true);
  };

  // Low stone paving follows the open photo court; its top stays at the ground plane.
  const pavement = new THREE.CircleGeometry(1, 64);
  pavement.rotateX(-Math.PI / 2); pavement.scale(GARDEN_PHOTO_ZONE.rx, 1, GARDEN_PHOTO_ZONE.rz);
  push(bases, pavement, GARDEN_PHOTO_ZONE.x, 0.008, GARDEN_PHOTO_ZONE.z);

  // A high, slender canopy carries lettering, with no wall behind or below it.
  for (const side of [-1, 1]) {
    const post = new THREE.CylinderGeometry(0.048, 0.065, 5.15, 8);
    push(frames, post, side * 5.3, 2.575, rearZ);
    line([[side * 5.3, 0.22, rearZ], [side * 5.3, 4.7, rearZ], [side * 4.7, 5.3, rearZ], [side * 2.65, 5.65, rearZ], [0, 5.8, rearZ]], side < 0 ? lavender : pink, 0.027);
    plinth(side * 5.3, rearZ, 0.3);
  }
  for (const [x, y, size] of [[-3.8, 5.55, 0.22], [3.8, 5.55, 0.22], [0, 6.12, 0.27]]) star(x, y, rearZ, size, cream);

  // Crescent and orbiting stars on one side; a heart and luminous flowers on the other.
  plinth(-7.55, rearZ + 0.15, 1.55);
  const moon: number[][] = [];
  for (let i = 0; i <= 42; i++) {
    const a = 0.8 + i / 42 * (Math.PI * 2 - 1.6);
    moon.push([-7.7 + Math.cos(a) * 1.65, 2.15 + Math.sin(a) * 1.65, rearZ + 0.15]);
  }
  const tipX = Math.cos(0.8) * 1.65, tipY = Math.sin(0.8) * 1.65;
  for (let i = 1; i < 25; i++) {
    const t = i / 25;
    moon.push([-7.7 + tipX - Math.sin(t * Math.PI) * 1.32, 2.15 - tipY + 2 * tipY * t, rearZ + 0.15]);
  }
  line(moon, cream, 0.055, true);
  star(-6.45, 3.65, rearZ + 0.05, 0.3, lavender);
  star(-6.15, 2.7, rearZ + 0.05, 0.2, teal);
  star(-8.85, 4.25, rearZ + 0.05, 0.23, pink);
  spill(-7.55, rearZ + 0.45, 5.8, cream);

  plinth(7.35, rearZ + 0.55, 1.55);
  loop(7.35, 2.22, rearZ + 0.55, 1.55, pink, a => [Math.pow(Math.sin(a), 3), (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16]);
  star(9.12, 3.4, rearZ + 0.55, 0.32, cream);
  star(5.75, 3.7, rearZ + 0.55, 0.21, lavender);
  spill(7.35, rearZ + 0.55, 5.7, pink);

  for (const [x, z, height, hex] of [[-10.3, -14.2, 1.6, lavender], [10.35, -14.0, 1.8, teal], [9.7, -12.65, 1.1, pink]]) {
    plinth(x, z, 0.5);
    line([[x, 0.23, z], [x + 0.08, height * 0.7, z], [x, height, z]], teal, 0.026);
    loop(x, height + 0.45, z, 0.7, hex, a => {
      const r = 0.7 + 0.23 * Math.cos(a * 5);
      return [r * Math.sin(a), r * Math.cos(a)];
    });
    loop(x, height + 0.45, z, 0.16, cream, a => [Math.cos(a), Math.sin(a)], 24);
    line([[x, height * 0.62, z], [x - 0.48, height * 0.7, z], [x - 0.32, height * 0.95, z], [x, height * 0.62, z]], teal, 0.022);
    spill(x, z, 3.6, hex);
  }

  // Two broken oval borders frame the picture without crossing the central walking route.
  for (const side of [-1, 1]) {
    const points = Array.from({ length: 45 }, (_, i) => {
      const a = -1.38 + i / 44 * 2.76;
      return [side * Math.cos(a) * GARDEN_PHOTO_ZONE.rx, 0.16, GARDEN_PHOTO_ZONE.z + Math.sin(a) * GARDEN_PHOTO_ZONE.rz];
    });
    line(points, side < 0 ? lavender : teal, 0.025);
    for (const angle of [-1.2, -0.6, 0.05, 0.7, 1.2]) {
      const x = side * Math.cos(angle) * GARDEN_PHOTO_ZONE.rx, z = GARDEN_PHOTO_ZONE.z + Math.sin(angle) * GARDEN_PHOTO_ZONE.rz;
      push(frames, new THREE.CylinderGeometry(0.026, 0.035, 0.5, 6), x, 0.25, z);
      push(tubes, colorize(new THREE.SphereGeometry(0.085, 8, 6), cream), x, 0.53, z);
      spill(x, z, 1.8, cream);
    }
  }

  const core = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  core.name = "photo-neon-core";
  const halo = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  halo.name = "photo-neon-halo";
  const stone = new THREE.MeshStandardMaterial({ color: 0xc8c4be, roughness: 0.68, metalness: 0.08 });
  stone.name = "photo-limestone";
  const brass = new THREE.MeshStandardMaterial({ color: 0xa39677, roughness: 0.4, metalness: 0.5 });
  brass.name = "photo-champagne-metal";
  const wash = new THREE.ShaderMaterial({
    uniforms: { uNight: { value: 0 } }, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: "varying vec2 vUv; varying vec3 vColor; void main(){vUv=uv;vColor=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: "varying vec2 vUv; varying vec3 vColor; uniform float uNight; void main(){float r=length((vUv-.5)*2.);float a=pow(max(0.,1.-r),2.)*.23*uNight;gl_FragColor=vec4(vColor,a);}",
  });
  wash.name = "photo-light-pools";
  const merge = (pieces: THREE.BufferGeometry[], material: THREE.Material) => {
    const flat = pieces.map(p => p.index ? p.toNonIndexed() : p);
    const geometry = mergeGeometries(flat, false)!;
    for (const part of new Set([...pieces, ...flat])) part.dispose();
    geometries.push(geometry); materials.push(material);
    const mesh = new THREE.Mesh(geometry, material); mesh.name = material.name; mesh.layers.enable(2);
    if (material.transparent) mesh.renderOrder = 4;
    root.add(mesh);
  };
  merge(bases, stone); merge(frames, brass); merge(tubes, core); merge(halos, halo); merge(spills, wash);

  const texture = photoSignTexture(mobile);
  const sign = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.02, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  sign.name = "photo-neon-lettering"; materials.push(sign);
  const signGeometry = new THREE.PlaneGeometry(9.6, 2.4); geometries.push(signGeometry);
  const lettering = new THREE.Mesh(signGeometry, sign);
  lettering.name = "garden-photo-sign"; lettering.position.set(0, GROUND_Y + 4.4, rearZ + 0.03); lettering.layers.enable(2); root.add(lettering);
  let disposed = false;
  return {
    root,
    applyDaylight(lanterns: number) {
      const night = THREE.MathUtils.clamp(lanterns, 0, 1);
      core.color.setScalar(0.58 + night * 0.42);
      halo.opacity = night * 0.055;
      wash.uniforms.uNight.value = night;
      sign.color.setScalar(0.66 + night * 0.34);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent(); root.clear();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      texture.dispose();
    },
  };
}

function photoSignTexture(mobile: boolean): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  const canvas = document.createElement("canvas");
  canvas.width = mobile ? 1024 : 1536; canvas.height = canvas.width / 4;
  const ctx = canvas.getContext("2d")!, scale = canvas.width / 1024;
  ctx.scale(scale, scale); ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.shadowColor = "#ffc3db"; ctx.shadowBlur = 12;
  ctx.fillStyle = "#fff1d8"; ctx.font = "300 116px Georgia, serif";
  const word = "SOROW", spacing = 15;
  const widths = [...word].map(letter => ctx.measureText(letter).width);
  let x = 512 - (widths.reduce((a, b) => a + b, 0) + spacing * (word.length - 1)) / 2;
  for (let i = 0; i < word.length; i++) { ctx.fillText(word[i], x + widths[i] / 2, 94); x += widths[i] + spacing; }
  ctx.shadowBlur = 7; ctx.fillStyle = "#dfcbff"; ctx.font = "500 27px Arial, sans-serif";
  ctx.fillText("N I G H T   G A R D E N", 512, 174);
  ctx.shadowBlur = 3; ctx.fillStyle = "#fae9d8"; ctx.font = "18px 'Malgun Gothic', sans-serif";
  ctx.fillText("우리의 밤이 빛나는 곳", 512, 220);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}
