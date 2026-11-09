import * as THREE from "three";
import { BAIKAL_BLOCKS, BAIKAL_ROOM_OCCLUSION_BOX, BAIKAL_SNOW_DRIFT_BOX, BAIKAL_WIND } from "./baikal-layout";

/**
 * Every Baikal surface texture beyond the two photographs is generated once on the visitor's own GPU: a few draws at load,
 * nothing to download, and each one tiles perfectly. Everything here needs a live renderer; tests and the low-memory path simply go without.
 */
export interface BaikalBake {
  iceVolume: THREE.Texture | null;
  snowDrift: THREE.Texture | null;
  boucle: THREE.Texture;
  knit: THREE.Texture;
  fur: THREE.Texture;
  rug: THREE.Texture;
  rugNormal: THREE.Texture;
  planks: THREE.Texture;
  planksNormal: THREE.Texture;
  /** The same oak with no board joints, for furniture and beams. */
  wood: THREE.Texture;
  stone: THREE.Texture;
  stoneNormal: THREE.Texture;
  frost: THREE.Texture;
  dispose(): void;
}

const BAKE_VERT = `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** Period-aware noise: `per` wraps the lattice, so every pattern built on these tiles without a seam. */
const BAKE_NOISE = `
varying vec2 vUv;
uniform float uTexel;
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 h22(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
float pn(vec2 p, vec2 per) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(mod(i, per)), h21(mod(i + vec2(1.0, 0.0), per)), f.x), mix(h21(mod(i + vec2(0.0, 1.0), per)), h21(mod(i + vec2(1.0, 1.0), per)), f.x), f.y);
}
float pfbm(vec2 p, vec2 per, int octaves) {
  float amp = 0.5, sum = 0.0, total = 0.0;
  for (int i = 0; i < octaves; i++) { sum += amp * pn(p, per); total += amp; p *= 2.0; per *= 2.0; amp *= 0.5; }
  return sum / total;
}
vec2 pwor(vec2 p, vec2 per) {
  vec2 i = floor(p), f = fract(p); float f1 = 8.0, f2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)), r = g + h22(mod(i + g, per)) - f; float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return sqrt(vec2(f1, f2));
}
vec4 heightNormal(float strength) {
  float c = surfaceHeight(vUv), x = surfaceHeight(vUv + vec2(uTexel, 0.0)), y = surfaceHeight(vUv + vec2(0.0, uTexel));
  vec3 n = normalize(vec3((c - x) * strength, (c - y) * strength, 1.0));
  return vec4(n * 0.5 + 0.5, c);
}
`;
const withNoise = (body: string, main: string) => BAKE_NOISE.replace("vec4 heightNormal", `${body}\nvec4 heightNormal`) + main;

/** Small chunky loops of boucle yarn: normal in RGB, loop height in A for cavity darkening. */
const BOUCLE_FRAG = withNoise(`
float surfaceHeight(vec2 uv) {
  vec2 warp = vec2(pfbm(uv * 9.0, vec2(9.0), 3), pfbm(uv * 9.0 + 5.2, vec2(9.0), 3)) * 0.09;
  vec2 cells = pwor((uv + warp) * 34.0, vec2(34.0));
  float loops = 1.0 - smoothstep(0.08, 0.62, cells.x);
  float ring = smoothstep(0.02, 0.2, cells.x) * loops;
  return clamp(loops * 0.62 + ring * 0.3 + pfbm(uv * 120.0, vec2(120.0), 2) * 0.16, 0.0, 1.0);
}`, `void main() { gl_FragColor = heightNormal(6.0); }`);

/** Hand-knit stockinette: columns of interlocking V stitches with a little yarn fuzz. */
const KNIT_FRAG = withNoise(`
float surfaceHeight(vec2 uv) {
  vec2 p = uv * vec2(14.0, 18.0);
  float column = fract(p.x) - 0.5;
  float across = abs(column) * 2.0;
  float along = fract(p.y + across * 0.62);
  float strand = sqrt(max(0.0, 1.0 - pow((across - 0.5) * 2.0, 2.0)));
  float loop = sqrt(max(0.0, 1.0 - pow((along - 0.5) * 2.1, 2.0)));
  float ply = 0.5 + 0.5 * sin((along + across) * 62.83);
  return clamp(strand * (0.42 + 0.5 * loop) + ply * 0.05 + pfbm(uv * 150.0, vec2(150.0), 2) * 0.1, 0.0, 1.0);
}`, `void main() { gl_FragColor = heightNormal(5.0); }`);

/** One tall strand per cell. The fur shells cut against this; deliberately left without mipmaps so strands stay crisp. */
const FUR_FRAG = withNoise(`float surfaceHeight(vec2 uv) { return 0.0; }`, `
void main() {
  vec2 p = vUv * 96.0, i = floor(p), f = fract(p);
  float best = 0.0, tone = 0.5;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)), id = mod(i + g, 96.0), r = g + h22(id) * 0.9 - f;
    float grow = 0.35 + 0.65 * h21(id + 3.7), strand = max(0.0, 1.0 - length(r) / 0.62) * grow;
    if (strand > best) { best = strand; tone = h21(id + 9.1); }
  }
  gl_FragColor = vec4(best, tone, pfbm(vUv * 18.0, vec2(18.0), 3), 1.0);
}`);

/** Wide brushed-oak boards laid along V, each with its own colour, ring pattern, end joint and the occasional knot. */
const PLANKS_BODY = `
uniform float uBoards;
uniform float uGaps;
vec4 boards(vec2 uv) {
  float bx = uv.x * uBoards, id = floor(bx), fx = fract(bx);
  float shift = h21(vec2(id, 1.7));
  float run = uv.y * 2.0 + shift * 2.0, seg = floor(run), fy = fract(run);
  float tint = h21(vec2(id, mod(seg, 2.0)) + 4.2);
  vec2 period = vec2(uBoards * 3.0, 6.0);
  float warp = pfbm(vec2(bx * 3.0, uv.y * 6.0), period, 4);
  // A knot pulls the growth rings around itself.
  vec2 knotAt = vec2(0.25 + 0.5 * h21(vec2(id, 8.3)), fract(h21(vec2(id, 2.6)) + 0.5));
  vec2 toKnot = vec2((fx - knotAt.x) * 2.2, min(abs(uv.y - knotAt.y), 1.0 - abs(uv.y - knotAt.y)) * uBoards);
  float knot = h21(vec2(id, 5.5)) > 0.62 ? exp(-dot(toKnot, toKnot) * 26.0) : 0.0;
  float rings = sin((fx * 2.4 + warp * 7.0 + tint * 13.0 + knot * 5.0) * 12.566);
  float fibre = pfbm(vec2(bx * 42.0, uv.y * 4.0), vec2(uBoards * 42.0, 4.0), 3);
  float pores = smoothstep(0.62, 0.84, pfbm(vec2(bx * 95.0, uv.y * 9.0), vec2(uBoards * 95.0, 9.0), 2));
  vec3 light = vec3(0.56, 0.405, 0.255), dark = vec3(0.235, 0.15, 0.085);
  vec3 color = mix(dark, light, clamp(0.5 + 0.28 * rings + (fibre - 0.5) * 0.9, 0.0, 1.0));
  color *= 0.9 + 0.2 * tint; color = mix(color, vec3(0.1, 0.05, 0.025), knot * 0.82 + pores * 0.28);
  float side = min(fx, 1.0 - fx) / uBoards, end = min(fy, 1.0 - fy) / 2.0;
  float gap = 1.0, joint = 1.0;
  if (uGaps > 0.5) { gap = smoothstep(0.0007, 0.003, side); joint = smoothstep(0.0003, 0.0016, end); }
  color *= mix(0.22, 1.0, gap) * mix(0.62, 1.0, joint);
  float height = gap * joint * 0.8 + (rings * 0.04 + fibre * 0.14 - pores * 0.08) * gap;
  return vec4(color, height);
}
float surfaceHeight(vec2 uv) { return boards(uv).a; }`;
const PLANKS_FRAG = withNoise(PLANKS_BODY, `void main() { gl_FragColor = vec4(boards(vUv).rgb, 1.0); }`);
const PLANKS_NORMAL_FRAG = withNoise(PLANKS_BODY, `void main() { gl_FragColor = heightNormal(5.0); }`);

/** Courses of split ledgestone for the wall behind the stove: uneven, dark-jointed, each stone its own grey-brown. */
const STONE_BODY = `
vec4 stones(vec2 uv) {
  const vec2 SCALE = vec2(9.0, 15.0);
  vec2 warp = vec2(pfbm(uv * 11.0, vec2(11.0), 4), pfbm(uv * 11.0 + 7.1, vec2(11.0), 4)) * 0.22;
  vec2 q = (uv + warp * 0.08) * SCALE;
  vec2 cell = floor(q), f = fract(q);
  float f1 = 8.0, f2 = 8.0, tint = 0.5;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)), id = mod(cell + g, SCALE), r = g + h22(id) * vec2(0.92, 0.7) - f;
    float d = max(abs(r.x) * 0.72, abs(r.y) * 1.25);
    if (d < f1) { f2 = f1; f1 = d; tint = h21(id + 2.2); } else if (d < f2) { f2 = d; }
  }
  float rough = pfbm(uv * 34.0, vec2(34.0), 5), chip = pfbm(uv * 110.0, vec2(110.0), 3);
  float face = smoothstep(0.015, 0.075 + (rough - 0.5) * 0.05, f2 - f1);
  vec3 grey = vec3(0.145, 0.135, 0.125), warm = vec3(0.215, 0.165, 0.115), cool = vec3(0.095, 0.1, 0.11);
  vec3 color = mix(mix(cool, grey, smoothstep(0.1, 0.5, tint)), warm, smoothstep(0.55, 0.95, tint));
  color *= 0.7 + rough * 0.65 + chip * 0.2; color *= mix(0.1, 1.0, face);
  return vec4(color, face * (0.7 + tint * 0.26 + (rough - 0.5) * 0.55 + (chip - 0.5) * 0.15));
}
float surfaceHeight(vec2 uv) { return stones(uv).a; }`;
const STONE_FRAG = withNoise(STONE_BODY, `void main() { gl_FragColor = vec4(stones(vUv).rgb, 1.0); }`);
const STONE_NORMAL_FRAG = withNoise(STONE_BODY, `void main() { gl_FragColor = heightNormal(7.0); }`);

/** A hand-tufted wool rug: cream pile, thin charcoal diamond lattice softened by the tufts themselves. */
const RUG_BODY = `
vec4 pile(vec2 uv) {
  vec2 q = uv * 3.0;
  vec2 warp = vec2(pfbm(uv * 9.0, vec2(9.0), 3), pfbm(uv * 9.0 + 3.3, vec2(9.0), 3)) * 0.07 - 0.035;
  vec2 d = abs(fract(q + warp) - 0.5);
  float lattice = 1.0 - smoothstep(0.01, 0.034, abs(d.x + d.y - 0.5));
  vec2 tufts = pwor(uv * 150.0, vec2(150.0));
  float pileHeight = 1.0 - smoothstep(0.05, 0.72, tufts.x);
  float mottled = pfbm(uv * 6.0, vec2(6.0), 4);
  vec3 wool = mix(vec3(0.34, 0.285, 0.215), vec3(0.47, 0.40, 0.31), mottled);
  vec3 color = mix(wool, vec3(0.1, 0.075, 0.06), lattice * (0.7 + 0.3 * pileHeight));
  color *= 0.84 + 0.2 * pileHeight;
  return vec4(color, pileHeight * (1.0 - lattice * 0.25));
}
float surfaceHeight(vec2 uv) { return pile(uv).a; }`;
const RUG_FRAG = withNoise(RUG_BODY, `void main() { gl_FragColor = vec4(pile(vUv).rgb, 1.0); }`);
const RUG_NORMAL_FRAG = withNoise(RUG_BODY, `void main() { gl_FragColor = heightNormal(4.0); }`);

/** Ferns of hoar frost for the corners of the panes. */
const FROST_FRAG = withNoise(`float surfaceHeight(vec2 uv) { return 0.0; }`, `
float ridge(vec2 p, vec2 per) { return 1.0 - abs(pfbm(p, per, 5) * 2.0 - 1.0); }
void main() {
  vec2 q = vUv * 5.0, per = vec2(5.0);
  vec2 warp = vec2(pn(q * 2.0, per * 2.0), pn(q * 2.0 + 8.4, per * 2.0)) * 0.9;
  float feather = ridge(q + warp, per) * 0.6 + ridge(q * 2.0 + warp * 1.7, per * 2.0) * 0.28 + ridge(q * 4.0 - warp, per * 4.0) * 0.12;
  float crystals = pow(smoothstep(0.52, 0.98, feather), 1.35);
  float haze = pfbm(q * 3.0, per * 3.0, 4);
  gl_FragColor = vec4(crystals, haze, 0.0, 1.0);
}`);

const random32 = (seed: number) => () => {
  seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

/**
 * The inside of the ice, painted with long fractures that kink and branch the way lake ice really splits.
 * R: the fracture line. G: how deep that sheet reaches (stored as R x depth so it survives anti-aliasing and mips). B: milky feathering around the sheets.
 */
function bakeIceVolume(size: number, renderer: THREE.WebGLRenderer): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const c = context, k = size / 2048, random = random32(90817);
  c.fillStyle = "#000"; c.fillRect(0, 0, size, size);
  c.globalCompositeOperation = "lighter"; c.lineCap = "round"; c.lineJoin = "round";
  type Crack = { points: [number, number][]; width: number; depth: number; generation: number };
  const cracks: Crack[] = [];
  const grow = (x0: number, y0: number, heading: number, length: number, width: number, depth: number, generation: number) => {
    const points: [number, number][] = [[x0, y0]]; let x = x0, y = y0, angle = heading, travelled = 0;
    while (travelled < length) {
      const step = (10 + random() * 34) * k;
      angle += (random() - .5) * .34; if (random() < .08) angle += (random() - .5) * 1.25;
      x += Math.cos(angle) * step; y += Math.sin(angle) * step; travelled += step; points.push([x, y]);
      if (generation < 2 && random() < (generation ? .07 : .09)) {
        const side = random() < .5 ? -1 : 1;
        grow(x, y, angle + side * (.4 + random() * .95), length * (.1 + random() * (generation ? .22 : .38)), width * (.42 + random() * .25), depth * (.42 + random() * .5), generation + 1);
      }
    }
    cracks.push({ points, width, depth, generation });
  };
  for (let i = 0; i < 9; i++) grow(random() * size, random() * size, random() * Math.PI * 2, (1000 + random() * 1700) * k, (1.3 + random() * 1.3) * k, .55 + random() * .45, 0);
  for (let i = 0; i < 46; i++) grow(random() * size, random() * size, random() * Math.PI * 2, (70 + random() * 280) * k, (.7 + random() * .7) * k, .1 + random() * .34, 2);
  const stroke = (points: [number, number][], dx: number, dy: number) => {
    c.beginPath(); c.moveTo(points[0][0] + dx, points[0][1] + dy);
    for (let i = 1; i < points.length; i++) c.lineTo(points[i][0] + dx, points[i][1] + dy);
    c.stroke();
  };
  // A stroke that leaves the tile is drawn again from the other side.
  const wrapped = (points: [number, number][]) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of points) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const reach = 90 * k;
    for (let ox = Math.floor((minX - reach) / size); ox <= Math.floor((maxX + reach) / size); ox++)
      for (let oy = Math.floor((minY - reach) / size); oy <= Math.floor((maxY + reach) / size); oy++) stroke(points, -ox * size, -oy * size);
  };
  for (const crack of cracks) {
    const depth = Math.round(crack.depth * 255);
    c.strokeStyle = `rgb(255,${depth},0)`; c.lineWidth = crack.width; wrapped(crack.points);
    // The veil builds in soft passes rather than a canvas blur filter, which Safari lacks.
    const passes: [number, number][] = crack.generation === 0 ? [[6, .14], [13, .07], [28, .04], [54, .022]] : crack.generation === 1 ? [[4, .1], [10, .05], [20, .024]] : [[3, .05], [7, .02]];
    for (const [width, alpha] of passes) { c.strokeStyle = `rgba(0,0,255,${alpha})`; c.lineWidth = width * k; wrapped(crack.points); }
    // Plumose feathering: short angled barbs along the big fractures.
    if (crack.generation === 0) {
      c.lineWidth = 1.2 * k; c.strokeStyle = "rgba(0,0,255,.2)";
      for (let i = 1; i < crack.points.length - 1; i++) {
        const [ax, ay] = crack.points[i], [bx, by] = crack.points[i + 1], heading = Math.atan2(by - ay, bx - ax);
        for (let j = 0; j < 7; j++) {
          const t = random(), side = random() < .5 ? -1 : 1, barb = (14 + random() * 56) * k, a = heading + side * (.55 + random() * .55);
          const sx = ax + (bx - ax) * t, sy = ay + (by - ay) * t;
          c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + Math.cos(a) * barb, sy + Math.sin(a) * barb); c.stroke();
        }
      }
    }
  }
  // Drifting clouds of pinprick air, thickest in loose bands.
  for (let i = 0; i < 26; i++) {
    const cx = random() * size, cy = random() * size, spread = (40 + random() * 150) * k, dots = 60 + Math.floor(random() * 120);
    for (let j = 0; j < dots; j++) {
      const a = random() * Math.PI * 2, r = spread * Math.sqrt(-Math.log(1 - random() * .98)) * .5;
      const x = (cx + Math.cos(a) * r + size) % size, y = (cy + Math.sin(a) * r + size) % size;
      c.fillStyle = `rgba(0,0,255,${.1 + random() * .32})`; c.beginPath(); c.arc(x, y, (.5 + random() * 1.8) * k, 0, Math.PI * 2); c.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "baikal-ice-volume"; texture.colorSpace = THREE.NoColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = true;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); texture.needsUpdate = true;
  return texture;
}

/** World-space snow tails: wind lays a long drift in the lee of every hummock. */
function bakeSnowDrift(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const box = BAIKAL_SNOW_DRIFT_BOX, canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 1280;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const c = context, scaleX = canvas.width / box.width, scaleZ = canvas.height / box.depth, random = random32(5521);
  c.fillStyle = "#000"; c.fillRect(0, 0, canvas.width, canvas.height);
  c.globalCompositeOperation = "lighter";
  const wind = Math.atan2(BAIKAL_WIND.z * scaleZ, BAIKAL_WIND.x * scaleX);
  for (const block of BAIKAL_BLOCKS) {
    if (!block.solid) continue;
    const tail = block.size * (5 + random() * 9), half = block.size * (1.05 + random() * .7);
    const x = (block.x - box.minX + BAIKAL_WIND.x * tail * .5) * scaleX, z = (block.z - box.minZ + BAIKAL_WIND.z * tail * .5) * scaleZ;
    c.save(); c.translate(x, z); c.rotate(wind); c.scale(tail * .5 * scaleX, half * scaleZ);
    const gradient = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, "rgba(255,255,255,.95)"); gradient.addColorStop(.55, "rgba(255,255,255,.5)"); gradient.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = gradient; c.beginPath(); c.arc(0, 0, 1, 0, Math.PI * 2); c.fill(); c.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "baikal-snow-drift"; texture.colorSpace = THREE.NoColorSpace; texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.needsUpdate = true;
  return texture;
}

export function bakeBaikalTextures(renderer: THREE.WebGLRenderer, mobile: boolean): BaikalBake {
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mesh = new THREE.Mesh(geometry); mesh.frustumCulled = false; scene.add(mesh);
  const targets: THREE.WebGLRenderTarget[] = [], previous = renderer.getRenderTarget(), autoClear = renderer.autoClear;
  const shrink = mobile ? .5 : 1;
  const bake = (name: string, size: number, fragmentShader: string, srgb = false, uniforms: Record<string, THREE.IUniform> = {}, mipmaps = true) => {
    const pixels = Math.max(64, Math.round(size * shrink));
    const target = new THREE.WebGLRenderTarget(pixels, pixels, {
      type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
      magFilter: THREE.LinearFilter, minFilter: mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, generateMipmaps: mipmaps,
      colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace, anisotropy: Math.min(mobile ? 4 : 8, renderer.capabilities.getMaxAnisotropy()),
    });
    target.texture.name = `baikal-${name}`;
    const material = new THREE.ShaderMaterial({ vertexShader: BAKE_VERT, fragmentShader, uniforms: { uTexel: { value: 1 / pixels }, ...uniforms }, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending });
    mesh.material = material; renderer.autoClear = true; renderer.setRenderTarget(target); renderer.render(scene, camera);
    material.dispose(); targets.push(target);
    return target.texture;
  };
  const boards = { uBoards: { value: 8 }, uGaps: { value: 1 } };
  const solid = { uBoards: { value: 3 }, uGaps: { value: 0 } };
  const textures = {
    boucle: bake("boucle", 512, BOUCLE_FRAG), knit: bake("knit", 512, KNIT_FRAG), fur: bake("fur", 512, FUR_FRAG, false, {}, false),
    rug: bake("rug", 1024, RUG_FRAG, true), rugNormal: bake("rug-normal", 1024, RUG_NORMAL_FRAG),
    planks: bake("planks", 2048, PLANKS_FRAG, true, boards), planksNormal: bake("planks-normal", 1024, PLANKS_NORMAL_FRAG, false, boards),
    wood: bake("wood", 1024, PLANKS_FRAG, true, solid),
    stone: bake("stone", 1024, STONE_FRAG, true), stoneNormal: bake("stone-normal", 1024, STONE_NORMAL_FRAG),
    frost: bake("frost", 1024, FROST_FRAG),
  };
  renderer.setRenderTarget(previous); renderer.autoClear = autoClear;
  geometry.dispose(); scene.clear();
  const iceVolume = bakeIceVolume(mobile ? 1024 : 2048, renderer), snowDrift = bakeSnowDrift();
  let disposed = false;
  return { ...textures, iceVolume, snowDrift, dispose() {
    if (disposed) return; disposed = true;
    targets.forEach(target => target.dispose()); iceVolume?.dispose(); snowDrift?.dispose();
  } };
}

/**
 * Soft contact shadow under everything in a room, baked from above once. R is tight, for the dark line where furniture meets the floor; G is wide, for the room's soft ambient pooling.
 * All three cabins are the same room, so the first one's map serves them all.
 */
const BLUR_FRAG = `
uniform sampler2D tSource;
uniform vec2 uStep;
varying vec2 vUv;
void main() {
  vec4 sum = texture2D(tSource, vUv) * 0.1964;
  for (int i = 1; i <= 4; i++) {
    float w = i == 1 ? 0.1747 : i == 2 ? 0.1210 : i == 3 ? 0.0650 : 0.0272;
    sum += (texture2D(tSource, vUv + uStep * float(i)) + texture2D(tSource, vUv - uStep * float(i))) * w;
  }
  gl_FragColor = sum;
}`;
const OCCLUSION_MERGE_FRAG = `
uniform sampler2D tTight;
uniform sampler2D tWide;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tTight, vUv).r, texture2D(tWide, vUv).r, 0.0, 1.0); }`;
export function bakeBaikalRoomOcclusion(renderer: THREE.WebGLRenderer, scene: THREE.Scene, floorY: number, layer: number): THREE.WebGLRenderTarget {
  const box = BAIKAL_ROOM_OCCLUSION_BOX, size = 512;
  const previous = renderer.getRenderTarget(), autoClear = renderer.autoClear, clearColor = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha();
  const make = () => new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  const raw = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  const halfWidth = (box.maxX - box.minX) / 2, halfDepth = (box.maxZ - box.minZ) / 2;
  const camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfDepth, -halfDepth, .01, 1.55);
  camera.position.set((box.minX + box.maxX) / 2, floorY + 1.6, (box.minZ + box.maxZ) / 2); camera.up.set(0, 0, -1); camera.lookAt(camera.position.x, floorY, camera.position.z); camera.layers.set(layer); camera.updateMatrixWorld();
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff }), override = scene.overrideMaterial, fog = scene.fog, background = scene.background;
  scene.overrideMaterial = white; scene.fog = null; scene.background = null;
  renderer.setClearColor(0x000000, 1); renderer.autoClear = true; renderer.setRenderTarget(raw); renderer.render(scene, camera);
  scene.overrideMaterial = override; scene.fog = fog; scene.background = background; white.dispose();
  const quadScene = new THREE.Scene(), quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const blur = new THREE.ShaderMaterial({ vertexShader: BAKE_VERT, fragmentShader: BLUR_FRAG, uniforms: { tSource: { value: null }, uStep: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending });
  const mesh = new THREE.Mesh(geometry, blur); mesh.frustumCulled = false; quadScene.add(mesh);
  const run = (source: THREE.WebGLRenderTarget, target: THREE.WebGLRenderTarget, x: number, y: number) => {
    blur.uniforms.tSource.value = source.texture; (blur.uniforms.uStep.value as THREE.Vector2).set(x / size, y / size);
    renderer.setRenderTarget(target); renderer.render(quadScene, quadCamera);
  };
  const a = make(), b = make(), c = make(), d = make();
  run(raw, a, 1.4, 0); run(a, b, 0, 1.4);                                     // b: tight
  run(b, c, 5, 0); run(c, d, 0, 5); run(d, c, 9, 0); run(c, d, 0, 9);          // d: wide
  const finalTarget = make();
  const merge = new THREE.ShaderMaterial({ vertexShader: BAKE_VERT, fragmentShader: OCCLUSION_MERGE_FRAG, uniforms: { tTight: { value: b.texture }, tWide: { value: d.texture } }, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending });
  mesh.material = merge; renderer.setRenderTarget(finalTarget); renderer.render(quadScene, quadCamera);
  merge.dispose(); blur.dispose(); geometry.dispose(); [raw, a, b, c, d].forEach(target => target.dispose());
  renderer.setRenderTarget(previous); renderer.autoClear = autoClear; renderer.setClearColor(clearColor, clearAlpha);
  finalTarget.texture.name = "baikal-room-occlusion";
  return finalTarget;
}
