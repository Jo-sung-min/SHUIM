import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { BAMBOO_GLOW_FRAG, BAMBOO_GLOW_VERT } from "./bamboo-shader";
import { BAIKAL_BLOCKS, BAIKAL_BOUNDS, BAIKAL_CABIN, BAIKAL_CABINS, BAIKAL_CANDLE_GROUPS, BAIKAL_COZY_PER_ROOM, BAIKAL_JOURNEY_ROUTE, BAIKAL_REFUGE_CEILING, BAIKAL_SHORE, BAIKAL_TERRACES, BAIKAL_TREES, baikalFloorHeight, baikalRoofHeight, baikalSnowCover, baikalShoreHeight, baikalTerraceHeight } from "./baikal-layout";
import { type BaikalUniforms, createBaikalGlassMaterial, createBaikalHummockMaterial, createBaikalIceMaterial } from "./baikal-materials";
import type { BaikalBake } from "./baikal-bake";
import { type CozyOptions, applyCozyLighting, cushionGeometry, curtainGeometry, drapeGeometry, logGeometry, poufGeometry, quiltGeometry, softBoxGeometry } from "./baikal-cozy";

export interface BaikalTextures { wood: THREE.Texture; cotton: THREE.Texture; snow?: THREE.Texture; ice?: THREE.Texture }

/** A box whose texture repeats per metre instead of stretching one tile over a whole wall. */
function texturedBox(width: number, height: number, depth: number, density = .5): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(width, height, depth), uv = box.getAttribute("uv") as THREE.BufferAttribute;
  const spans: [number, number][] = [[depth, height], [depth, height], [width, depth], [width, depth], [width, height], [width, height]];
  for (let face = 0; face < 6; face++) for (let i = 0; i < 4; i++) {
    const index = face * 4 + i;
    uv.setXY(index, uv.getX(index) * spans[face][0] * density, uv.getY(index) * spans[face][1] * density);
  }
  return box;
}

/* ---------------- turquoise hummocks ---------------- */
/** Pressure ridges are broken plates shoved on end: a few jagged slabs leaning into each other, each with its own fracture faces. */
function hummockGeometry(variant: number): THREE.BufferGeometry {
  let state = 7919 + variant * 104729;
  const random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
  const plates: THREE.BufferGeometry[] = [];
  const count = 4 + variant, tall = variant % 2 === 1;
  for (let plate = 0; plate < count; plate++) {
    const halfW = .3 + random() * .42, height = (tall ? .7 : .5) + random() * (tall ? .5 : .32), halfT = .07 + random() * .1;
    const points: THREE.Vector3[] = [];
    const rim = 9 + Math.floor(random() * 4);
    for (let i = 0; i < rim; i++) {
      const a = i / rim * Math.PI * 2, u = Math.cos(a) * halfW * (.72 + random() * .42), v = (Math.sin(a) * .5 + .5) * height * (.72 + random() * .4);
      points.push(new THREE.Vector3(u, v, halfT * (.72 + random() * .45)), new THREE.Vector3(u * (.85 + random() * .2), v * (.92 + random() * .12), -halfT * (.72 + random() * .45)));
    }
    points.push(new THREE.Vector3(-halfW, 0, -halfT), new THREE.Vector3(halfW, 0, -halfT), new THREE.Vector3(halfW, 0, halfT), new THREE.Vector3(-halfW, 0, halfT));
    const piece = new ConvexGeometry(points);
    piece.rotateY(random() * Math.PI * 2);
    const yaw = random() * Math.PI * 2;
    piece.rotateX((random() - .5) * 1.1); piece.rotateZ((random() - .5) * .9); piece.rotateY(yaw);
    piece.translate((random() - .5) * 1.0, -.02, (random() - .5) * .72);
    piece.computeVertexNormals();
    // Grounded: nothing hangs below the ice.
    const raw = piece.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < raw.count; i++) raw.setY(i, Math.max(raw.getY(i), -.02));
    piece.computeVertexNormals();
    addCreases(piece, halfT);
    piece.deleteAttribute("uv");
    plates.push(piece);
  }
  const merged = mergeGeometries(plates, false)!;
  plates.forEach(piece => piece.dispose());
  return merged;
}
/** Barycentrics plus a flag per triangle edge: only a real fold between faces counts, so coplanar triangles never draw a line. */
function addCreases(geometry: THREE.BufferGeometry, halfThickness: number) {
  const position = geometry.getAttribute("position") as THREE.BufferAttribute, normal = geometry.getAttribute("normal") as THREE.BufferAttribute;
  const key = (i: number) => `${Math.round(position.getX(i) * 400)},${Math.round(position.getY(i) * 400)},${Math.round(position.getZ(i) * 400)}`;
  const edges = new Map<string, number[]>(), triangles = position.count / 3;
  const edgeKey = (a: number, b: number) => { const ka = key(a), kb = key(b); return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`; };
  const faceNormal = (t: number) => new THREE.Vector3(normal.getX(t * 3), normal.getY(t * 3), normal.getZ(t * 3)).normalize();
  for (let t = 0; t < triangles; t++) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
    const id = edgeKey(t * 3 + a, t * 3 + b); if (!edges.has(id)) edges.set(id, []); edges.get(id)!.push(t);
  }
  const bary = new Float32Array(position.count * 3), crease = new Float32Array(position.count * 3), thick = new Float32Array(position.count);
  const fold = (t: number, a: number, b: number) => {
    const shared = edges.get(edgeKey(t * 3 + a, t * 3 + b)) ?? [], own = faceNormal(t);
    return shared.some(other => other !== t && faceNormal(other).dot(own) < .94) ? 1 : 0;
  };
  // Broad faces cover a short path through the plate; the narrow fracture edges look down its whole length.
  const up = new THREE.Vector3(), area = new THREE.Vector3(), p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
  for (let t = 0; t < triangles; t++) {
    const n = t * 3;
    bary.set([1, 0, 0, 0, 1, 0, 0, 0, 1], n * 3);
    const e12 = fold(t, 1, 2), e20 = fold(t, 2, 0), e01 = fold(t, 0, 1);
    for (let i = 0; i < 3; i++) crease.set([e12, e20, e01], (n + i) * 3);
    p0.fromBufferAttribute(position, n); p1.fromBufferAttribute(position, n + 1); p2.fromBufferAttribute(position, n + 2);
    const size = area.crossVectors(up.subVectors(p1, p0), new THREE.Vector3().subVectors(p2, p0)).length();
    const value = THREE.MathUtils.clamp(.34 + .66 * (1 - Math.min(1, size / (halfThickness * 2.4))), .25, 1);
    thick.fill(value, n, n + 3);
  }
  geometry.setAttribute("aBary", new THREE.BufferAttribute(bary, 3)); geometry.setAttribute("aCrease", new THREE.BufferAttribute(crease, 3)); geometry.setAttribute("aThick", new THREE.BufferAttribute(thick, 1));
}

export interface BaikalHummocks { root: THREE.Group; setQuality(low: boolean): void; dispose(): void }
/** Four convex shards, instanced per variant, with a flattened snow mound around every grounded block. */
export function buildBaikalHummocks(parent: THREE.Object3D, shared: BaikalUniforms, mobile: boolean): BaikalHummocks {
  const root = new THREE.Group(); root.name = "baikal-hummocks"; parent.add(root);
  const material = createBaikalHummockMaterial(shared), geometries: THREE.BufferGeometry[] = [], meshes: THREE.InstancedMesh[] = [];
  const transform = new THREE.Object3D();
  for (let variant = 0; variant < 4; variant++) {
    const blocks = BAIKAL_BLOCKS.filter(block => block.variant === variant && (!mobile || block.solid || block.seed > .5));
    const geometry = hummockGeometry(variant); geometries.push(geometry);
    const inst = new Float32Array(blocks.length * 4);
    const mesh = new THREE.InstancedMesh(geometry, material, blocks.length); mesh.name = `baikal-hummocks-${variant}`;
    blocks.forEach((block, index) => {
      transform.position.set(block.x, baikalFloorHeight(block.x, block.z) - .04, block.z);
      transform.rotation.set(block.tilt * Math.sin(block.seed * 9), block.yaw, block.tilt * Math.cos(block.seed * 9));
      transform.scale.set(block.size, block.height, block.size * .8);
      transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
      inst.set([block.seed, .45 + block.seed * .55, (block.seed * 7) % 1, block.size], index * 4);
    });
    geometry.setAttribute("aInst", new THREE.InstancedBufferAttribute(inst, 4));
    mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false; root.add(mesh); meshes.push(mesh);
  }
  // Snow banks against the grounded hummocks share the ice shader, so the drift colour always matches the plain.
  const grounded = BAIKAL_BLOCKS.filter(block => block.solid);
  const dome = new THREE.SphereGeometry(1, mobile ? 16 : 26, 8, 0, Math.PI * 2, 0, Math.PI / 2); geometries.push(dome);
  // The bank thins out into bare ice instead of ending at its own outline.
  const domePosition = dome.getAttribute("position") as THREE.BufferAttribute, domeLift = new Float32Array(domePosition.count);
  for (let i = 0; i < domePosition.count; i++) domeLift[i] = 1 - THREE.MathUtils.smoothstep(Math.hypot(domePosition.getX(i), domePosition.getZ(i)), .55, .98);
  dome.setAttribute("aLift", new THREE.BufferAttribute(domeLift, 1));
  const mounds = new THREE.InstancedMesh(dome, createBaikalIceMaterial(shared, true), grounded.length); mounds.name = "baikal-snow-banks";
  grounded.forEach((block, index) => {
    transform.position.set(block.x + Math.cos(block.yaw) * .2, baikalFloorHeight(block.x, block.z) + .01, block.z + Math.sin(block.yaw) * .2);
    transform.rotation.set(0, block.yaw, 0);
    transform.scale.set(block.size * 1.8, block.size * .16 + .08, block.size * 1.5);
    transform.updateMatrix(); mounds.setMatrixAt(index, transform.matrix);
  });
  mounds.instanceMatrix.needsUpdate = true; mounds.frustumCulled = false; root.add(mounds);
  let disposed = false;
  return { root,
    setQuality(_low) { /* instance counts are fixed per device class */ },
    dispose() {
      if (disposed) return; disposed = true;
      root.removeFromParent(); root.clear();
      for (const mesh of meshes) mesh.dispose(); mounds.dispose();
      geometries.forEach(geometry => geometry.dispose()); material.dispose(); (mounds.material as THREE.Material).dispose();
    } };
}

/* ---------------- the shore bank and the mound under the cabin ---------------- */
function heightfield(minX: number, maxX: number, minZ: number, maxZ: number, cell: number): THREE.BufferGeometry {
  const columns = Math.ceil((maxX - minX) / cell), rows = Math.ceil((maxZ - minZ) / cell);
  const positions: number[] = [], lifts: number[] = [], indices: number[] = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= columns; c++) {
    const x = minX + (maxX - minX) * c / columns, z = minZ + (maxZ - minZ) * r / rows;
    // The snow bank continues beneath the timber deck, never over its finished floor.
    positions.push(x, Math.max(baikalTerraceHeight(x, z), baikalShoreHeight(x)) + .012, z); lifts.push(baikalSnowCover(x, z));
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const a = r * (columns + 1) + c, b = a + 1, d = a + columns + 1, e = d + 1;
    indices.push(a, d, b, b, d, e);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aLift", new THREE.Float32BufferAttribute(lifts, 1));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}
/** One tree in a unit tall volume. Rings alternate deep and shallow to make bough tips, and vertex colour lays snow on whatever faces the sky. */
function coniferGeometry(spokes: number, tiers: number): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [], index: number[] = [];
  let state = 40503;
  const random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
  const addRing = (y: number, radius: number, snow: number, tier: number, droop: number) => {
    const start = positions.length / 3;
    for (let s = 0; s <= spokes * 2; s++) {
      const a = s / (spokes * 2) * Math.PI * 2, tip = s % 2 === 0 ? 1 : .68, r = radius * tip * (.92 + random() * .16);
      const sag = droop * tip;
      positions.push(Math.cos(a) * r, y - sag, Math.sin(a) * r);
      const snowy = snow * (s % 2 === 0 ? .94 : .78) + (random() - .5) * .12;
      const green = .4 + tier * .02;
      colors.push(.05 + (.9 - .05) * snowy + .01, .075 * green / .4 + (.93 - .075) * snowy, .06 + (.97 - .06) * snowy);
    }
    return start;
  };
  for (let t = 0; t < tiers; t++) {
    const k = t / (tiers - 1), height = .16 + k * .78, radius = (1 - k * .93) * .95, length = .13 + (1 - k) * .05;
    const crown = addRing(height + length * .55, radius * .12, .92, t, 0), upper = addRing(height + length * .08, radius * .62, .86, t, 0), outer = addRing(height - length * .28, radius, .68, t, length * .4), under = addRing(height - length * .34, radius * .42, .06, t, 0);
    for (const [a, b] of [[crown, upper], [upper, outer], [outer, under]]) for (let s = 0; s < spokes * 2; s++) {
      const i = a + s, j = b + s; index.push(i, i + 1, j, i + 1, j + 1, j);
    }
  }
  const trunk = new THREE.CylinderGeometry(.03, .075, 1, 7); trunk.translate(0, .5, 0);
  const base = positions.length / 3, trunkPosition = trunk.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < trunkPosition.count; i++) { positions.push(trunkPosition.getX(i), trunkPosition.getY(i), trunkPosition.getZ(i)); colors.push(.11, .08, .06); }
  for (let i = 0; i < trunk.index!.count; i++) index.push(base + trunk.index!.getX(i));
  trunk.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index); geometry.computeVertexNormals();
  return geometry;
}
export interface BaikalShore { root: THREE.Group; dispose(): void }
/** Two height fields (a coarse bank, a fine mound) drawn with the ice shader, plus a stand of snowy larches on the bank. */
export function buildBaikalShore(parent: THREE.Object3D, shared: BaikalUniforms, textures: BaikalTextures, mobile: boolean): BaikalShore {
  const root = new THREE.Group(); root.name = "baikal-shore"; parent.add(root);
  const material = createBaikalIceMaterial(shared, true);
  const bank = heightfield(-126, BAIKAL_SHORE.startX + 3, BAIKAL_BOUNDS.minZ - 6, 76, mobile ? 3 : 2); bank.name = "baikal-shore-bank";
  const bankMesh = new THREE.Mesh(bank, material); bankMesh.name = "baikal-shore-bank"; root.add(bankMesh);
  const mounds = BAIKAL_TERRACES.map((terrace, i) => {
    const geometry = heightfield(terrace.x - terrace.radius - 6, terrace.x + terrace.radius + 6,
      terrace.z - terrace.radius - 6, terrace.z + terrace.radius + 6, mobile ? .9 : .6);
    const mesh = new THREE.Mesh(geometry, material); mesh.name = i === 0 ? "baikal-cabin-mound" : `baikal-${BAIKAL_CABINS[i].id}-mound`;
    root.add(mesh); return geometry;
  });
  // Snow-loaded conifers: a dark bole inside tiers of drooping, star-tipped boughs, the upper side of each bough carrying its own snow.
  const conifer = coniferGeometry(mobile ? 9 : 14, mobile ? 7 : 9);
  const needles = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .95, vertexColors: true }); needles.name = "baikal-larch";
  // Bright snow on dark boughs flickers once a tree is a few pixels wide, so distance settles both into one calm tone.
  needles.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.36, 0.42), smoothstep(16.0, 60.0, vViewPosition.z));");
  };
  const trees = new THREE.InstancedMesh(conifer, needles, BAIKAL_TREES.length);
  trees.name = "baikal-larches";
  const transform = new THREE.Object3D();
  BAIKAL_TREES.forEach((tree, index) => {
    transform.position.set(tree.x, baikalFloorHeight(tree.x, tree.z) - .1, tree.z);
    transform.rotation.set(0, tree.seed * 6.28, 0); transform.scale.set(.34 * tree.height, tree.height, .34 * tree.height);
    transform.updateMatrix(); trees.setMatrixAt(index, transform.matrix);
  });
  trees.instanceMatrix.needsUpdate = true; root.add(trees);
  let disposed = false;
  return { root, dispose() {
    if (disposed) return; disposed = true;
    root.removeFromParent(); root.clear(); bank.dispose(); mounds.forEach(mound => mound.dispose()); conifer.dispose(); trees.dispose(); material.dispose(); needles.dispose();
  } };
}

/* ---------------- the cabin ---------------- */
export interface BaikalCabin {
  root: THREE.Group;
  /** Warm light sources for the glow billboards: spots, pendants, sconces, bedside lamps, porch lanterns. */
  lamps: readonly THREE.Vector3[];
  /** Every flame in the candle house, in world space. */
  candles: readonly THREE.Vector3[];
  /** Tops of the flues, where wood smoke leaves. The candle house has none. */
  chimneys: readonly THREE.Vector3[];
  /** Where each house's main warmth sits. Only the first two are real stoves. */
  hearth: THREE.Vector3;
  hearths: readonly THREE.Vector3[];
  hearthFlames: readonly boolean[];
  cabinLights: readonly { position: THREE.Vector3; color: number; gain: number }[];
  /** Opaque geometry the top-down contact shadow bake looks at. */
  occluders: readonly THREE.Object3D[];
  /** Pieces left out of the room capture. */
  captureHidden: readonly THREE.Object3D[];
  setEnvironment(environment: THREE.Texture): void;
  applyNight(amount: number): void;
  dispose(): void;
}

/** Boards run along V (or U with `swap`); a board is `boardWidth` metres wide on the baked plank tile of eight boards. */
function boardBox(width: number, height: number, depth: number, boardWidth = .15, swap = false): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(width, height, depth), uv = box.getAttribute("uv") as THREE.BufferAttribute;
  const spans: [number, number][] = [[depth, height], [depth, height], [width, depth], [width, depth], [width, height], [width, height]];
  const across = boardWidth * 8, along = across * 4;
  for (let face = 0; face < 6; face++) for (let i = 0; i < 4; i++) {
    const index = face * 4 + i, u = uv.getX(index) * spans[face][0], v = uv.getY(index) * spans[face][1];
    uv.setXY(index, swap ? v / across : u / across, swap ? u / along : v / along);
  }
  return box;
}
/** Interleaved geometry needs the same attributes everywhere before merging. */
function normalizePiece(piece: THREE.BufferGeometry, tint?: THREE.Color): THREE.BufferGeometry {
  const count = piece.getAttribute("position").count;
  if (!piece.getAttribute("uv")) piece.setAttribute("uv", new THREE.Float32BufferAttribute(count * 2, 2));
  let colors = piece.getAttribute("color") as THREE.BufferAttribute | undefined;
  if (!colors) { colors = new THREE.Float32BufferAttribute(new Array(count * 3).fill(1), 3); piece.setAttribute("color", colors); }
  if (tint) for (let i = 0; i < count; i++) colors.setXYZ(i, colors.getX(i) * tint.r, colors.getY(i) * tint.g, colors.getZ(i) * tint.b);
  for (const name of Object.keys(piece.attributes)) if (!["position", "normal", "uv", "color"].includes(name)) piece.deleteAttribute(name);
  if (!piece.getAttribute("normal")) piece.computeVertexNormals();
  if (!piece.index) { const index = new Uint32Array(count); for (let i = 0; i < count; i++) index[i] = i; piece.setIndex(new THREE.BufferAttribute(index, 1)); }
  return piece;
}
const hex = (value: number) => new THREE.Color(value);

/**
 * Three shelters on one footprint and one seat plan, each its own place: a bright glass room of sofas and cushions,
 * a low snug room that is nearly all beds, and a dark room of candles and piled quilts. Only the outer shell is shared.
 */
export function buildBaikalCabin(parent: THREE.Object3D, textures: BaikalTextures, shared: BaikalUniforms, mobile: boolean, baked: BaikalBake | null = null): BaikalCabin {
  const root = new THREE.Group(); root.name = "baikal-cabin"; parent.add(root);
  const c = BAIKAL_CABIN, fy = c.floorY, owned: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const lightCount = mobile ? 8 : BAIKAL_COZY_PER_ROOM;
  const standard = (name: string, color: number, options: THREE.MeshStandardMaterialParameters = {}) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: .9, vertexColors: true, ...options }); material.name = name; materials.push(material); return material;
  };
  const indoor = (name: string, color: number, options: THREE.MeshStandardMaterialParameters = {}, cozy: CozyOptions = {}) => applyCozyLighting(standard(name, color, options), shared, { count: lightCount, ...cozy });
  const floor = indoor("baikal-floor", 0xa8947e, { map: baked?.planks, normalMap: baked?.planksNormal, normalScale: new THREE.Vector2(.5, .5), roughness: .25 }, { mirrorFloor: true });
  const oak = indoor("baikal-oak", 0xbcab94, { map: baked?.planks ?? textures.wood, normalMap: baked?.planksNormal, roughness: .62 });
  const plaster = indoor("baikal-plaster", 0xc9b6a0, { roughness: .96 });
  const walnut = indoor("baikal-walnut", 0xbda88a, { map: baked?.wood ?? textures.wood, roughness: .5 });
  const boucle = indoor("baikal-boucle", 0xffffff, { normalMap: baked?.boucle, normalScale: new THREE.Vector2(.9, .9), roughness: 1 }, baked ? { fabric: true, cavity: .62 } : { fabric: true });
  const knit = indoor("baikal-throws", 0xffffff, { normalMap: baked?.knit, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 1, side: THREE.DoubleSide }, baked ? { fabric: true, cavity: .45 } : { fabric: true });
  const quilted = indoor("baikal-quilt", 0xffffff, { roughness: 1, side: THREE.DoubleSide }, { fabric: true });
  const drape = indoor("baikal-linen-drape", 0xffffff, { map: textures.cotton, roughness: 1, side: THREE.DoubleSide }, { fabric: true });
  const iron = indoor("baikal-iron", 0x201e1d, { roughness: .42, metalness: .7 });
  const slate = indoor("baikal-slate", 0xc9bfb2, { map: baked?.stone, normalMap: baked?.stoneNormal, normalScale: new THREE.Vector2(1.1, 1.1), roughness: .92 });
  const wax = indoor("baikal-ceramic", 0xffffff, { roughness: .38 });
  const lampGlow = indoor("baikal-lamp-glass", 0xffefdc, { emissive: 0xffffff, emissiveIntensity: 2.2, roughness: .5 }, { glowVertex: true });
  const charred = standard("baikal-charred-timber", 0x4a3a2e, { map: baked?.planks ?? textures.wood, normalMap: baked?.planksNormal, roughness: .86 });
  const snow = standard("baikal-roof-snow", 0xf1f6fb, { roughness: 1 });
  const glass = createBaikalGlassMaterial(shared); materials.push(glass);
  const sage = indoor("baikal-refuge-ceramic", 0x859d86, { roughness: .45 });
  const brass = indoor("baikal-observatory-brass", 0xbca274, { roughness: .32, metalness: .85 });
  const roofSnow = createBaikalIceMaterial(shared, false); materials.push(roofSnow);
  const environmentTargets = [floor, oak, plaster, walnut, boucle, knit, quilted, drape, iron, slate, wax, sage, brass];
  environmentTargets.forEach(material => { material.envMapIntensity = material === floor ? .78 : material === iron || material === brass ? 1.1 : .5; });

  const common = new Map<THREE.Material, THREE.BufferGeometry[]>(), world = new Map<THREE.Material, THREE.BufferGeometry[]>();
  let batches = common;
  const box = new THREE.BoxGeometry(1, 1, 1), cylinder = new THREE.CylinderGeometry(1, 1, 1, 18), disc = new THREE.CircleGeometry(1, 18), sphere = new THREE.SphereGeometry(1, 16, 12);
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler(0, 0, 0, "YXZ");
  const scale = new THREE.Vector3(), position = new THREE.Vector3();
  let offsetX = 0, offsetZ = 0;
  /** Yaw is applied last, so a piece can be tilted in its own frame first. */
  const place = (material: THREE.Material, geometry: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, tint?: number | THREE.Color) => {
    const piece = normalizePiece(geometry.clone(), tint === undefined ? undefined : typeof tint === "number" ? hex(tint) : tint);
    matrix.compose(position.set(x + offsetX, y, z + offsetZ), quaternion.setFromEuler(euler.set(rx, ry, rz, "YXZ")), scale.set(sx, sy, sz));
    piece.applyMatrix4(matrix);
    if (!batches.has(material)) batches.set(material, []); batches.get(material)!.push(piece);
  };
  // Templates are copied into the merged batches and released as soon as those exist.
  const templates: THREE.BufferGeometry[] = [];
  const keep = (geometry: THREE.BufferGeometry) => { templates.push(geometry); return geometry; };
  const once = keep;
  const seeded = (seed: number) => { let state = seed; return () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; }; };

  const lamps: THREE.Vector3[] = [], lampHalos: number[] = [], candles: THREE.Vector3[] = [], chimneys: THREE.Vector3[] = [];
  const hearths: THREE.Vector3[] = [], hearthFlames: boolean[] = [], cabinLights: { position: THREE.Vector3; color: number; gain: number }[] = [];
  const point = (x: number, y: number, z: number) => new THREE.Vector3(x + offsetX, y, z + offsetZ);
  const lamp = (x: number, y: number, z: number, halo = .9) => { lamps.push(point(x, y, z)); lampHalos.push(halo); };

  const width = c.maxZ - c.minZ, centreZ = (c.minZ + c.maxZ) / 2;
  const slope = (baikalRoofHeight(c.maxX) - baikalRoofHeight(c.minX)) / (c.maxX - c.minX), pitch = Math.atan(slope);
  const roofY = (x: number) => baikalRoofHeight(x);
  const glassX = c.maxX, sideGlassX = -22;
  const tile = 1 / 0.3, knitTile = 1 / 0.42;
  const CREAM = 0xe0d6c4, OATMEAL = 0xc4b39b, RUST = 0x8f4f33, CAMEL = 0xa98250, MUSTARD = 0xb0924a, CHOCOLATE = 0x4f3a2c, FOREST = 0x4c5a44, IVORY = 0xefe8db, PLUM = 0x5e3a44, TERRACOTTA = 0xa8664a, SAGE = 0x8c9a7e;

  /* ---- the shell every house shares ---- */
  place(floor, once(boardBox(c.maxX - c.minX, .1, width, .17, true)), (c.minX + c.maxX) / 2, fy - .05, centreZ);
  place(charred, once(boardBox(c.maxX - c.minX + .5, .5, width + .5, .2)), (c.minX + c.maxX) / 2, fy - .35, centreZ, 1, 1, 1, 0, 0, 0, 0x7a6a5c);
  place(charred, once(boardBox(c.porchMaxX - c.maxX, .14, width + .4, .14, true)), (c.maxX + c.porchMaxX) / 2, fy - .07, centreZ, 1, 1, 1, 0, 0, 0, 0xd8b896);
  place(charred, once(boardBox(.7, .14, 2.8, .14)), c.porchMaxX + .3, fy - .28, 0, 1, 1, 1, 0, 0, 0, 0xc0a080);
  place(charred, once(boardBox(c.wall, c.lowEave + .3, width + c.wall, .2)), c.minX, fy + (c.lowEave + .3) / 2, centreZ);
  const roofStart = c.minX - .8, roofEnd = c.eaveMaxX + .4, roofRun = roofEnd - roofStart, roofMidX = (roofStart + roofEnd) / 2, roofLength = roofRun / Math.cos(pitch), roofMidY = baikalRoofHeight(roofMidX);
  place(charred, once(boardBox(roofLength, .24, width + 2 * c.sideEave, .2)), roofMidX, roofMidY + .12, centreZ, 1, 1, 1, 0, 0, pitch, 0x6b5a4c);
  // A thick, rounded quilt of snow on the roof, using the ground's own snow shader.
  {
    const rows = mobile ? 24 : 44, cols = mobile ? 30 : 60, positions: number[] = [], lifts: number[] = [], uvs: number[] = [], index: number[] = [];
    const span = width + 2 * c.sideEave + .24, length = roofLength + .3, thickness = .52;
    const edge = (d: number) => THREE.MathUtils.smoothstep(d, 0, .62);
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const s = i / cols * length, t = j / rows * span;
      const humps = Math.sin(s * .9 + 1.3) * Math.sin(t * .6 + 2) * .07 + Math.sin(s * 2.7 + t * 1.3) * .03;
      const fill = edge(s) * edge(length - s) * edge(t) * edge(span - t);
      const h = (thickness + humps) * Math.pow(fill, .6) + .02;
      const ls = s - length / 2, lt = t - span / 2;
      positions.push(roofMidX + Math.cos(pitch) * ls - Math.sin(pitch) * h, roofMidY + .235 + Math.sin(pitch) * ls + Math.cos(pitch) * h, centreZ + lt);
      lifts.push(1); uvs.push(s, t);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i, b = a + 1, d = a + cols + 1, e = d + 1;
      index.push(a, d, b, b, d, e);
    }
    const geometry = new THREE.BufferGeometry(); owned.push(geometry);
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("aLift", new THREE.Float32BufferAttribute(lifts, 1));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(index); geometry.computeVertexNormals();
    const quilt = new THREE.InstancedMesh(geometry, roofSnow, BAIKAL_CABINS.length); quilt.name = "baikal-roof-quilt";
    BAIKAL_CABINS.forEach((site, i) => quilt.setMatrixAt(i, matrix.makeTranslation(site.offsetX, 0, site.offsetZ)));
    quilt.instanceMatrix.needsUpdate = true; quilt.frustumCulled = false; root.add(quilt);
  }
  {
    const cone = once(new THREE.ConeGeometry(.045, 1, 6)), random = seeded(1571);
    const count = mobile ? 26 : 64, eave = c.eaveMaxX + .36, eaveY = roofY(eave) - .02;
    for (let i = 0; i < count; i++) {
      const z = c.minZ - c.sideEave + random() * (width + 2 * c.sideEave);
      const mid = 1 - Math.abs(z - centreZ) / (width / 2 + c.sideEave);
      const length = (.12 + random() * .55) * (.45 + mid * .75);
      place(snow, cone, eave - random() * .1, eaveY - length / 2, z, 1 + random() * .9, length, 1 + random() * .9, Math.PI, 0, 0, 0xd9ecf7);
    }
  }
  for (const z of [c.minZ + .4, c.maxZ - .4]) place(charred, cylinder, c.porchMaxX - .3, (fy + roofY(c.porchMaxX - .3)) / 2, z, .11, roofY(c.porchMaxX - .3) - fy, .11, 0, 0, 0, 0xa98a6c);
  place(charred, once(boardBox(.5, .08, 2.4, .12)), -14.6, fy + .45, 9.4, 1, 1, 1, 0, 0, 0, 0xc9a783);
  for (const dz of [-1.05, 1.05]) place(iron, box, -14.6, fy + .2, 9.4 + dz, .42, .4, .06);
  place(charred, once(boardBox(.06, .46, 2.4, .12)), -14.95, fy + .72, 9.4, 1, 1, 1, 0, 0, 0, 0xc9a783);
  place(knit, once(softBoxGeometry(.46, .08, 2.2, { radius: .035, crown: .015, seg: 6, tile: 1.2 })), -14.6, fy + .53, 9.4, 1, 1, 1, 0, 0, 0, RUST);
  for (const z of [c.minZ - .6, c.maxZ + .6]) {
    place(charred, box, c.porchMaxX + 1.4, fy - .3 + .6, z, .1, 1.2, .1, 0, 0, 0, 0x8d7054);
    place(lampGlow, sphere, c.porchMaxX + 1.4, fy + .95, z, .14, .18, .14, 0, 0, 0, 0xffa64d);
    place(iron, cylinder, c.porchMaxX + 1.4, fy + 1.15, z, .15, .05, .15);
  }
  {
    const random = seeded(8123), logs = [0, 1, 2].map(i => once(logGeometry(.07 + i * .012, .46, i * 2.1)));
    for (let row = 0; row < 7; row++) for (let i = 0; i < 16; i++) {
      if (row > 4 && i % 3 === 0) continue;
      place(walnut, logs[(i + row) % 3], -15.05 - random() * .06, fy + .09 + row * .135, 12.2 + i * .118 + (row % 2) * .05 - .6, 1, 1, 1, 0, 0, Math.PI / 2 + (random() - .5) * .05);
    }
  }

  /* ---- walls and glazing, which differ from house to house ---- */
  const panes: THREE.BufferGeometry[] = [];
  const paneQuad = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3, e: THREE.Vector3, normal: THREE.Vector3, w: number, h: number) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, e.x, e.y, e.z, a.x, a.y, a.z, e.x, e.y, e.z, d.x, d.y, d.z], 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(6).fill(0).flatMap(() => [normal.x, normal.y, normal.z]), 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    const sizes = new Float32Array(12); for (let i = 0; i < 12; i += 2) { sizes[i] = w; sizes[i + 1] = h; }
    geometry.setAttribute("aPane", new THREE.BufferAttribute(sizes, 2));
    panes.push(geometry);
  };
  const zPane = (x0: number, x1: number, y0: number, y1a: number, y1b: number, z: number, outward: number) => {
    const inset = .03, v = (x: number, y: number) => new THREE.Vector3(x + offsetX, y, z + offsetZ);
    const a = v(x0 + inset, y0 + inset), b = v(x1 - inset, y0 + inset), d = v(x0 + inset, y1a - inset), e = v(x1 - inset, y1b - inset);
    if (outward > 0) paneQuad(a, b, d, e, new THREE.Vector3(0, 0, 1), x1 - x0, (y1a + y1b) / 2 - y0);
    else paneQuad(b, a, e, d, new THREE.Vector3(0, 0, -1), x1 - x0, (y1a + y1b) / 2 - y0);
  };
  const xPane = (x: number, y0: number, y1: number, z0: number, z1: number) => {
    const inset = .03, v = (y: number, z: number) => new THREE.Vector3(x + offsetX, y, z + offsetZ);
    paneQuad(v(y0 + inset, z1 - inset), v(y0 + inset, z0 + inset), v(y1 - inset, z1 - inset), v(y1 - inset, z0 + inset), new THREE.Vector3(1, 0, 0), z1 - z0, y1 - y0);
  };
  const liner = (x0: number, x1: number, thickness: number, boardWidth: number) => {
    const shape = new THREE.Shape();
    shape.moveTo(x0, fy); shape.lineTo(x1, fy); shape.lineTo(x1, roofY(x1)); shape.lineTo(x0, roofY(x0)); shape.closePath();
    const geometry = keep(new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false }));
    const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / (boardWidth * 8), uv.getY(i) / (boardWidth * 32));
    return geometry;
  };
  const partShell = liner(c.minX, sideGlassX, c.wall, .2), partLiner = liner(c.minX, sideGlassX, .02, .13);
  const fullShell = liner(c.minX, c.maxX, c.wall, .2), fullLiner = liner(c.minX, c.maxX, .02, .13);
  const glassY0 = fy + .15, glassY1 = fy + c.highEave - .15, railY = 3.8, doorHead = fy + 2.3, sideRail = fy + 2.75;
  const bays: [number, number][] = [[c.minZ, c.doorMinZ], [c.doorMinZ, c.doorMaxZ]];
  for (let k = 0; k < 6; k++) bays.push([c.doorMaxZ + (c.maxZ - c.doorMaxZ) * k / 6, c.doorMaxZ + (c.maxZ - c.doorMaxZ) * (k + 1) / 6]);
  const openDoor = () => {
    xPane(glassX + .22, fy + .05, doorHead - .05, c.doorMaxZ + .05, c.doorMaxZ + 2.35);
    place(iron, box, glassX + .22, (fy + doorHead) / 2, c.doorMaxZ + 1.2, .04, doorHead - fy, .05);
    for (const dz of [.05, 2.35]) place(iron, box, glassX + .22, (fy + doorHead) / 2, c.doorMaxZ + dz, .05, doorHead - fy, .05);
    place(iron, box, glassX + .22, fy + .05, c.doorMaxZ + 1.2, .05, .05, 2.4); place(iron, box, glassX + .22, doorHead - .05, c.doorMaxZ + 1.2, .05, .05, 2.4);
  };
  const glassWall = () => {
    bays.forEach(([z0, z1], index) => {
      if (index === 1) { xPane(glassX, doorHead, glassY1, z0, z1); return; }
      xPane(glassX, glassY0, railY, z0, z1); xPane(glassX, railY, glassY1, z0, z1);
    });
    openDoor();
    for (const [z0] of bays) place(iron, box, glassX, fy + c.highEave / 2, z0, .1, c.highEave, .055);
    place(iron, box, glassX, fy + c.highEave / 2, c.maxZ, .1, c.highEave, .055);
    place(iron, box, glassX, railY, (c.doorMaxZ + c.maxZ) / 2, .1, .05, c.maxZ - c.doorMaxZ);
    place(iron, box, glassX, railY, (c.minZ + c.doorMinZ) / 2, .1, .05, c.doorMinZ - c.minZ);
    place(iron, box, glassX, glassY1, centreZ, .1, .06, width);
    place(iron, box, glassX, glassY0, (c.doorMaxZ + c.maxZ) / 2, .1, .06, c.maxZ - c.doorMaxZ);
    place(iron, box, glassX, glassY0, (c.minZ + c.doorMinZ) / 2, .1, .06, c.doorMinZ - c.minZ);
    place(iron, box, glassX, doorHead, (c.doorMinZ + c.doorMaxZ) / 2, .1, .08, c.doorMaxZ - c.doorMinZ);
    place(slate, box, glassX, fy + .07, (c.doorMaxZ + c.maxZ) / 2, .28, .14, c.maxZ - c.doorMaxZ, 0, 0, 0, 0x8f8880);
    place(slate, box, glassX, fy + .07, (c.minZ + c.doorMinZ) / 2, .28, .14, c.doorMinZ - c.minZ, 0, 0, 0, 0x8f8880);
  };
  const sideGlazing = () => {
    for (const [z, outward] of [[c.minZ - .02, -1], [c.maxZ + .02, 1]] as const) for (let k = 0; k < 3; k++) {
      const x0 = sideGlassX + k * 2, x1 = x0 + 2, top = (x: number) => roofY(x) - .2;
      zPane(x0, x1, fy + .15, sideRail, sideRail, z, outward);
      zPane(x0, x1, sideRail, top(x0), top(x1), z, outward);
    }
    for (const z of [c.minZ, c.maxZ]) {
      place(iron, box, (sideGlassX + glassX) / 2, sideRail, z, glassX - sideGlassX, .05, .1);
      place(iron, box, (sideGlassX + glassX) / 2, fy + .15, z, glassX - sideGlassX, .06, .1);
      for (let k = 0; k <= 3; k++) { const x = sideGlassX + k * 2; place(iron, box, x, (fy + roofY(x)) / 2, z, .055, roofY(x) - fy, .1); }
    }
  };
  /** The snug house looks out through three wide low windows in a solid wall. */
  const windowWall = () => {
    const windows: readonly [number, number][] = [[2, 4.8], [5.6, 8.4], [9.2, 12]], sill = fy + .75, head = fy + 2.5, top = roofY(glassX);
    const piece = (z0: number, z1: number, y0: number, y1: number) => {
      const w = z1 - z0, h = y1 - y0;
      place(charred, keep(boardBox(.14, h, w, .2)), glassX, (y0 + y1) / 2, (z0 + z1) / 2);
      place(plaster, box, glassX - .085, (y0 + y1) / 2, (z0 + z1) / 2, .02, h, w);
    };
    for (const [z0, z1] of [[c.minZ, c.doorMinZ], [c.doorMaxZ, windows[0][0]], [windows[0][1], windows[1][0]], [windows[1][1], windows[2][0]], [windows[2][1], c.maxZ]] as const) piece(z0, z1, fy, top);
    piece(c.doorMinZ, c.doorMaxZ, doorHead, top);
    for (const [z0, z1] of windows) {
      piece(z0, z1, fy, sill); piece(z0, z1, head, top);
      const mid = (z0 + z1) / 2;
      xPane(glassX, sill, head, z0, mid); xPane(glassX, sill, head, mid, z1);
      for (const z of [z0, mid, z1]) place(walnut, box, glassX - .06, (sill + head) / 2, z, .1, head - sill, .07, 0, 0, 0, 0x7e6a56);
      for (const y of [sill, head]) place(walnut, box, glassX - .06, y, mid, .12, .08, z1 - z0 + .07, 0, 0, 0, 0x7e6a56);
      place(walnut, box, glassX - .2, sill - .03, mid, .3, .05, z1 - z0 + .3, 0, 0, 0, 0x9b8669);
    }
    place(walnut, box, glassX - .06, doorHead, 0, .12, .1, c.doorMaxZ - c.doorMinZ + .14, 0, 0, 0, 0x7e6a56);
    for (const z of [c.doorMinZ, c.doorMaxZ]) place(walnut, box, glassX - .06, (fy + doorHead) / 2, z, .12, doorHead - fy, .1, 0, 0, 0, 0x7e6a56);
    openDoor();
  };
  const slopedCeiling = (tint: number, beamTint: number) => {
    const start = c.minX, end = c.eaveMaxX + .3, mid = (start + end) / 2, length = (end - start) / Math.cos(pitch);
    place(oak, once(boardBox(length, .03, width + 2 * c.sideEave - .1, .13, true)), mid, baikalRoofHeight(mid) - .018, centreZ, 1, 1, 1, 0, 0, pitch, tint);
    for (const x of [-27.6, -24.8, -22, -19.2, -16.5]) place(walnut, once(texturedBox(.16, .22, width - c.wall, .55)), x, roofY(x) - .12, centreZ, 1, 1, 1, 0, 0, pitch, beamTint);
    for (const z of [c.minZ + .35, centreZ, c.maxZ - .35]) place(walnut, once(texturedBox(length, .08, .1, .45)), mid, baikalRoofHeight(mid) - .07, z, 1, 1, 1, 0, 0, pitch, beamTint);
  };
  /** The bed house has a low flat ceiling on exposed joists, and a plain sloped soffit outside. */
  const lowCeiling = () => {
    const y = fy + BAIKAL_REFUGE_CEILING;
    place(oak, once(boardBox(c.maxX - c.minX, .05, width - c.wall, .13, true)), (c.minX + c.maxX) / 2, y + .025, centreZ, 1, 1, 1, 0, 0, 0, 0xf0e4d2);
    for (let x = -28.8; x < -16.4; x += 1.6) place(walnut, once(texturedBox(.1, .16, width - c.wall, .55)), x, y - .08, centreZ, 1, 1, 1, 0, 0, 0, 0xc7b295);
    const start = c.maxX, end = c.eaveMaxX + .3, mid = (start + end) / 2, length = (end - start) / Math.cos(pitch);
    place(oak, once(boardBox(length, .03, width + 2 * c.sideEave - .1, .13, true)), mid, baikalRoofHeight(mid) - .018, centreZ, 1, 1, 1, 0, 0, pitch, 0xe2c8a4);
  };

  /** A black drum stove on stone, with its flue, and optionally a tall split-stone wall behind it. */
  const stove = (wallWidth: number, wallHeight: number) => {
    const hearthPad = once(boardBox(2.6, .07, 1.9, .3));
    place(slate, hearthPad, -23.4, fy + .035, -.85, 1, 1, 1, 0, 0, 0, 0x8a8078);
    const stone = keep(new THREE.BoxGeometry(wallWidth, wallHeight, .18)), stoneUv = stone.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < stoneUv.count; i++) stoneUv.setXY(i, stoneUv.getX(i) * wallWidth / 1.7, stoneUv.getY(i) * wallHeight / 1.7);
    place(slate, stone, -23.5, fy + wallHeight / 2, -1.73);
    const stoveX = -23.4, stoveZ = -1.1, drum = .39, base = fy + .26, tall = .96;
    for (const [dx, dz] of [[-.24, -.24], [.24, -.24], [-.24, .24], [.24, .24]]) place(iron, cylinder, stoveX + dx, fy + .165, stoveZ + dz, .022, .2, .022);
    for (const [y0, y1] of [[base, fy + .52], [fy + .98, base + tall]] as const) place(iron, once(new THREE.CylinderGeometry(drum, drum, y1 - y0, 40, 1, false)), stoveX, (y0 + y1) / 2, stoveZ);
    const gap = 1.25;
    place(iron, once(new THREE.CylinderGeometry(drum, drum, .46, 40, 1, true, gap / 2, Math.PI * 2 - gap)), stoveX, fy + .75, stoveZ);
    const lining = once(new THREE.CylinderGeometry(drum - .02, drum - .02, .46, 24, 1, true, gap / 2 - .1, Math.PI * 2 - gap + .2));
    lining.scale(-1, 1, 1);
    place(iron, lining, stoveX, fy + .75, stoveZ, 1, 1, 1, 0, Math.PI, 0, 0x262220);
    place(iron, disc, stoveX, fy + .525, stoveZ, drum - .02, drum - .02, drum - .02, -Math.PI / 2, 0, 0, 0x2a1810);
    for (const x of [-.25, .25]) place(iron, box, stoveX + x, fy + .75, -.725, .034, .5, .02);
    place(iron, box, stoveX, fy + .515, -.725, .54, .03, .02); place(iron, box, stoveX, fy + .985, -.725, .54, .03, .02);
    place(iron, box, stoveX + .3, fy + .75, -.68, .016, .2, .03);
    place(iron, cylinder, stoveX, base + tall + .025, stoveZ, drum + .025, .05, drum + .025);
    const flueTop = baikalRoofHeight(stoveX) + .9, flueBase = base + tall + .05;
    place(iron, cylinder, stoveX, (flueBase + flueTop) / 2, stoveZ, .095, flueTop - flueBase, .095);
    place(iron, cylinder, stoveX, flueTop + .08, stoveZ, .15, .12, .15);
    zPane(stoveX - .22, stoveX + .22, fy + .52, fy + .98, fy + .98, -.72, 1);
    const log = once(logGeometry(.05, .42, 3.3));
    place(walnut, log, stoveX - .08, fy + .57, stoveZ + .02, 1, 1, 1, 0, .35, Math.PI / 2, 0x2c1a0f);
    place(walnut, log, stoveX + .09, fy + .57, stoveZ + .08, 1, 1, 1, 0, -.4, Math.PI / 2, 0x2c1a0f);
    chimneys.push(point(stoveX, flueTop + .2, stoveZ));
  };
  const pillow = (w: number, d: number, t: number, seed: number) => once(cushionGeometry(w, d, t, seed, mobile ? 10 : 16, knitTile));

  /* ---- first warmth: a bright glass room with sofas and cushions, and nothing else to look at ---- */
  const furnishWarm = () => {
    /** Laid out in its own frame: lx runs along the seat row, +lz is the back. */
    const sofa = (cx: number, cz: number, fx: number, fz: number, length: number, seats: number, depth = 1.12) => {
      const rx = -fz, rz = fx, theta = Math.atan2(-rz, rx);
      const put = (material: THREE.Material, geometry: THREE.BufferGeometry, lx: number, y: number, lz: number, tint?: number, tilt = 0, roll = 0) =>
        place(material, geometry, cx + lx * rx - lz * fx, y, cz + lx * rz - lz * fz, 1, 1, 1, tilt, theta, roll, tint);
      const arm = .3, inner = length - arm * 2, pitchSeat = inner / seats;
      put(walnut, once(softBoxGeometry(length - .1, .07, depth - .1, { radius: .02, seg: 2 })), 0, fy + .04, 0, 0x57493c);
      put(boucle, once(softBoxGeometry(length - .34, .28, depth - .1, { radius: .07, bulge: .012, seg: 6, tile })), 0, fy + .07 + .14, 0, OATMEAL);
      put(boucle, once(softBoxGeometry(length - .04, .56, .26, { radius: .1, bulge: .012, seg: 7, tile })), 0, fy + .35 + .22, depth / 2 - .15, OATMEAL);
      for (const end of [-1, 1]) put(boucle, once(softBoxGeometry(arm, .56, depth + .02, { radius: .13, bulge: .018, crown: .02, seg: 9, seed: end + 5, tile })), end * (length / 2 - arm / 2), fy + .07 + .28, 0, CREAM);
      for (let s = 0; s < seats; s++) {
        const lx = (s - (seats - 1) / 2) * pitchSeat, seed = s * 3.3 + cx;
        put(boucle, once(softBoxGeometry(pitchSeat - .012, .27, depth - .24, { radius: .1, crown: .05, bulge: .022, sag: .028 + (s % 2) * .012, wrinkle: .006, seed, seg: mobile ? 8 : 13, tile })), lx, fy + .35 + .115, -.085, CREAM);
        put(boucle, once(softBoxGeometry(pitchSeat - .02, .66, .27, { radius: .13, crown: .03, bulge: .06, wrinkle: .007, seed: seed + 11, seg: mobile ? 8 : 13, tile })), lx, fy + .6 + .28, depth / 2 - .36, CREAM, -.2);
      }
      return put;
    };
    const longSofa = sofa(-23.15, 6.05, 1, 0, 6.4, 4), sideSofa = sofa(-22, 11.32, 0, -1, 4.4, 3);
    const scatter = (put: typeof longSofa, material: THREE.Material, geometry: THREE.BufferGeometry, lx: number, lift: number, lz: number, tint: number, lean = -1.2, roll = 0) => put(material, geometry, lx, fy + lift, lz, tint, lean, roll);
    scatter(longSofa, knit, pillow(.56, .56, .2, 1.1), -2.72, .86, .12, RUST, -1.16, .12);
    scatter(longSofa, boucle, pillow(.5, .5, .2, 2.4), -2.42, .84, .02, IVORY, -1.28, -.2);
    scatter(longSofa, knit, pillow(.48, .48, .18, 3.1), -.96, .86, .12, MUSTARD, -1.2, .2);
    scatter(longSofa, boucle, pillow(.58, .4, .17, 4.7), .24, .82, .06, CAMEL, -1.22, -.08);
    scatter(longSofa, knit, pillow(.5, .5, .19, 5.2), 2.05, .85, .12, CHOCOLATE, -1.18, -.16);
    scatter(longSofa, boucle, pillow(.56, .56, .21, 6.9), 2.62, .87, .06, IVORY, -1.1, .18);
    scatter(sideSofa, knit, pillow(.56, .56, .2, 8.2), -1.72, .86, .12, FOREST, -1.2, .16);
    scatter(sideSofa, boucle, pillow(.5, .5, .2, 9.6), -1.34, .84, .04, IVORY, -1.26, -.14);
    scatter(sideSofa, knit, pillow(.52, .52, .19, 10.4), 1.42, .86, .1, CAMEL, -1.2, -.2);
    place(walnut, once(softBoxGeometry(.8, .08, .8, { radius: .02, seg: 2 })), -18.6, fy + .05, 12.2, 1, 1, 1, 0, 0, 0, 0x57493c);
    place(boucle, once(softBoxGeometry(1.0, .34, 1.0, { radius: .16, bulge: .025, seg: 9, tile })), -18.6, fy + .09 + .17, 12.2, 1, 1, 1, 0, 0, 0, OATMEAL);
    place(boucle, once(softBoxGeometry(.82, .24, .78, { radius: .1, crown: .05, bulge: .02, sag: .03, wrinkle: .006, seed: 1.7, seg: mobile ? 8 : 12, tile })), -18.52, fy + .43 + .1, 12.2, 1, 1, 1, 0, 0, 0, CREAM);
    place(boucle, once(softBoxGeometry(.3, .86, 1.04, { radius: .14, bulge: .04, seg: 10, seed: 2.2, tile })), -19.0, fy + .68, 12.2, 1, 1, 1, 0, 0, .14, CREAM);
    for (const dz of [-.47, .47]) place(boucle, once(softBoxGeometry(.98, .58, .22, { radius: .1, bulge: .03, seg: 9, seed: dz + 3, tile })), -18.62, fy + .5, 12.2 + dz, 1, 1, 1, 0, 0, 0, CREAM);
    place(knit, pillow(.5, .42, .18, 12.3), -18.86, fy + .95, 12.2, 1, 1, 1, -1.32, Math.PI / 2, .1, MUSTARD);
    for (const [x, tint] of [[-24.6, RUST], [-22.2, CAMEL]] as const) place(knit, once(poufGeometry(.5, .32, 12, mobile ? 28 : 48, mobile ? 12 : 22)), x, fy, 1.4, 1, 1, 1, 0, x * .3, 0, tint);
    stove(4.1, 3.7);
    // The iron rack of firewood beside the stove.
    {
      const random = seeded(2203), logs = [0, 1, 2, 3].map(i => once(logGeometry(.05 + i * .012, .46, i * 1.9 + .4)));
      const cx = -25.4, cz = -1.2, rackW = 1.08, rackH = 1.42;
      for (const dx of [-rackW / 2, rackW / 2]) { place(iron, box, cx + dx, fy + rackH / 2, cz - .2, .03, rackH, .03); place(iron, box, cx + dx, fy + rackH / 2, cz + .2, .03, rackH, .03); }
      place(iron, box, cx, fy + .03, cz, rackW + .03, .03, .44); place(iron, box, cx, fy + rackH, cz - .2, rackW + .03, .03, .03); place(iron, box, cx, fy + rackH, cz + .2, rackW + .03, .03, .03);
      for (let row = 0; row < 11; row++) for (let i = 0; i < 9; i++) {
        if (row > 8 && i % 2 === 0) continue;
        place(walnut, logs[(i * 3 + row) % 4], cx - rackW / 2 + .07 + i * .118 + (row % 2) * .05, fy + .1 + row * .118, cz + (random() - .5) * .02, 1, 1, 1, Math.PI / 2 + (random() - .5) * .04, 0, 0);
      }
    }
    for (const [z, y] of [[4.95, 3.36], [6, 3.18], [7.05, 3.5]] as const) {
      const roof = roofY(-20.4) - .1;
      place(iron, cylinder, -20.4, (roof + y) / 2, z, .007, roof - y, .007);
      place(iron, cylinder, -20.4, y + .15, z, .04, .05, .04);
      place(lampGlow, sphere, -20.4, y, z, .15, .15, .15, 0, 0, 0, 0xffbd7a); lamp(-20.4, y, z, 1.25);
    }
    for (const x of [-19.2, -24.8]) {
      const y = roofY(x) - .22 - .5;
      place(iron, box, x, y + .13, centreZ, .035, .03, 13.4);
      for (const z of [.3, 6.2, 12.2]) { const top = roofY(x) - .1; place(iron, cylinder, x, (top + y + .14) / 2, z, .006, top - y - .14, .006); }
      for (const z of [2.3, 6.2, 10.1]) {
        place(iron, cylinder, x, y, z, .055, .22, .055);
        place(lampGlow, disc, x, y - .112, z, .042, .042, .042, Math.PI / 2, 0, 0, 0xffc98a); lamp(x, y - .13, z, .5);
      }
    }
    place(iron, cylinder, -19.4, fy + .85, 13.3, .014, 1.7, .014); place(iron, once(new THREE.CylinderGeometry(.16, .18, .03, 22)), -19.4, fy + .02, 13.3);
    place(lampGlow, once(new THREE.CylinderGeometry(.2, .27, .32, 26, 1, true)), -19.4, fy + 1.78, 13.3, 1, 1, 1, 0, 0, 0, 0xffc78e); lamp(-19.4, fy + 1.72, 13.3, 1.5);
    for (const z of [3.5, 10.5]) {
      place(iron, box, -29.74, fy + 2.15, z, .1, .05, .16);
      place(lampGlow, once(new THREE.CylinderGeometry(.1, .13, .26, 20, 1, true)), -29.56, fy + 2.15, z, 1, 1, 1, 0, 0, 0, 0xffc78e); lamp(-29.42, fy + 2.15, z, 1.1);
    }
    const hang = glassY1 - fy - .12;
    place(drape, once(curtainGeometry(1.5, hang, 6, 2.1, mobile ? 40 : 72)), -16.34, fy + .04, 13.05, 1, 1, 1, 0, Math.PI / 2, 0, 0xc9b597);
    place(drape, once(curtainGeometry(1.1, hang, 4.5, 5.4, mobile ? 30 : 56)), -16.34, fy + .04, 1.82, 1, 1, 1, 0, Math.PI / 2, 0, 0xc9b597);
    place(iron, cylinder, -16.34, fy + hang + .08, 7.6, .012, 11.8, .012, Math.PI / 2);
  };

  /* ---- snow road refuge: a low, soft room that is nearly all beds ---- */
  /** Head at -lz, foot towards +lz, yaw turning that foot to world (sin, cos). */
  const yawPut = (cx: number, cz: number, yaw: number) => {
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    return (material: THREE.Material, geometry: THREE.BufferGeometry, lx: number, y: number, lz: number, tint?: number, tilt = 0, turn = 0, roll = 0) =>
      place(material, geometry, cx + lx * cos + lz * sin, y, cz - lx * sin + lz * cos, 1, 1, 1, tilt, yaw + turn, roll, tint);
  };
  const quiltStep = mobile ? .085 : .05;
  const bed = (cx: number, cz: number, yaw: number, w: number, len: number, duvet: number, accent: number, seed: number) => {
    const put = yawPut(cx, cz, yaw);
    put(walnut, once(softBoxGeometry(w + .12, .2, len + .1, { radius: .03, seg: 2 })), 0, fy + .1, 0, 0x6f5f50);
    put(boucle, once(softBoxGeometry(w + .16, 1.04, .17, { radius: .08, bulge: .018, seg: 7, tile })), 0, fy + .54, -len / 2 - .05, OATMEAL);
    put(boucle, once(softBoxGeometry(w, .28, len, { radius: .09, crown: .018, seg: 8, tile })), 0, fy + .33, 0, IVORY);
    put(quilted, once(softBoxGeometry(w - .06, .17, len * .72, { radius: .08, crown: .07, wrinkle: .006, seed: seed + 4, seg: 9 })), 0, fy + .55, len * .12, duvet);
    put(quilted, once(quiltGeometry(w, len * .76, { overhang: .3, ground: .34, puff: .085, cell: .46, seed, step: quiltStep, rumple: .022 })), 0, fy + .64, len * .12, duvet);
    put(quilted, once(softBoxGeometry(w + .04, .13, .4, { radius: .06, crown: .03, wrinkle: .005, seed: seed + 1, seg: 6 })), 0, fy + .66, -len * .25, accent);
    const count = Math.max(1, Math.floor(w / .8));
    for (let i = 0; i < count; i++) {
      const lx = (i - (count - 1) / 2) * (w / count);
      put(boucle, pillow(.8, .56, .3, seed + i * 2.1), lx, fy + .8, -len / 2 + .3, IVORY, -1.0, 0, (i % 2 ? .05 : -.04));
      put(knit, pillow(.54, .4, .22, seed + i * 3.3), lx + (i % 2 ? .08 : -.08), fy + .79, -len / 2 + .58, i % 2 ? accent : duvet, -.86, 0, (i % 2 ? -.08 : .1));
    }
  };
  const bedsideLamp = (x: number, z: number, top: number) => {
    place(sage, once(new THREE.LatheGeometry([[0, 0], [.085, 0], [.1, .04], [.05, .14], [.075, .25], [.03, .33], [0, .35]].map(([a, b]) => new THREE.Vector2(a, b)), 18)), x, top, z);
    place(lampGlow, once(new THREE.CylinderGeometry(.13, .19, .24, 22, 1, true)), x, top + .46, z, 1, 1, 1, 0, 0, 0, 0xffbf85); lamp(x, top + .42, z, 1.15);
  };
  const furnishBeds = () => {
    bed(-23.8, 4.4, Math.PI / 2, 3.1, 2.6, TERRACOTTA, CREAM, 1.3);
    bed(-23.8, 7.7, Math.PI / 2, 3.1, 2.6, SAGE, CREAM, 3.7);
    bed(-22, 12.08, Math.PI, 4.8, 3.05, OATMEAL, RUST, 6.1);
    bed(-18.72, 12.3, Math.PI / 2, 1.8, 1.35, CAMEL, IVORY, 8.4);
    bed(-18.8, 4.4, -Math.PI / 2, 2.9, 3.1, PLUM, OATMEAL, 21.3);
    bed(-18.8, 7.6, -Math.PI / 2, 2.9, 3.1, MUSTARD, CREAM, 23.9);
    [[1.7, MUSTARD], [5.3, PLUM], [8.9, FOREST], [12.4, TERRACOTTA]].forEach(([z, tint], i) => bed(-28.45, z, Math.PI / 2, 2.6, 2.6, tint, CREAM, 11 + i * 2.3));
    for (const z of [3.5, 7.1, 10.65]) { place(walnut, once(softBoxGeometry(.5, .56, .46, { radius: .03, seg: 2 })), -29.35, fy + .28, z, 1, 1, 1, 0, 0, 0, 0x8a7866); bedsideLamp(-29.35, z, fy + .56); }
    for (const z of [2.45, 9.65]) { place(walnut, once(softBoxGeometry(.5, .56, .5, { radius: .03, seg: 2 })), -24.6, fy + .28, z, 1, 1, 1, 0, 0, 0, 0x8a7866); bedsideLamp(-24.6, z, fy + .56); }
    for (const x of [-23.6, -20.4]) {
      place(iron, box, x, fy + 1.55, 13.76, .14, .05, .1);
      place(lampGlow, once(new THREE.CylinderGeometry(.09, .13, .22, 18, 1, true)), x, fy + 1.55, 13.56, 1, 1, 1, 0, 0, 0, 0xffbf85); lamp(x, fy + 1.55, 13.42, 1);
    }
    for (const [x, tint] of [[-24.6, TERRACOTTA], [-22.2, SAGE]] as const) place(knit, once(poufGeometry(.52, .32, 12, mobile ? 28 : 48, mobile ? 12 : 22)), x, fy, 1.4, 1, 1, 1, 0, x * .3, 0, tint);
    stove(2.6, 2.95);
    place(lampGlow, once(new THREE.CylinderGeometry(.55, .55, .05, 32)), -21.5, fy + BAIKAL_REFUGE_CEILING - .05, 6, 1, 1, 1, 0, 0, 0, 0xffc79a); lamp(-21.5, fy + BAIKAL_REFUGE_CEILING - .12, 6, 1.6);
    const hang = 2.48;
    for (const [z0, z1] of [[2, 4.8], [5.6, 8.4], [9.2, 12]] as const) for (const z of [z0 - .08, z1 + .08])
      place(drape, once(curtainGeometry(.7, hang, 3, z * 1.7, mobile ? 18 : 32)), -16.3, fy + .3, z, 1, 1, 1, 0, Math.PI / 2, 0, 0xcbb69a);
  };

  /* ---- aurora watch: dark walls, no lamps at all, candles and a landscape of quilts ---- */
  const candleCluster = (x: number, lift: number, z: number, count: number, seed: number) => {
    const random = seeded(Math.floor(seed * 7919) + 11), body = once(new THREE.CylinderGeometry(1, 1, 1, 12));
    const base = fy + lift;
    if (count > 3) place(walnut, once(new THREE.CylinderGeometry(.1 + count * .034, .12 + count * .034, .03, 24)), x, base + .015, z, 1, 1, 1, 0, 0, 0, 0x4f3e30);
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399963 + seed, radius = count > 1 ? .05 + Math.sqrt((i + .5) / count) * (.03 + count * .027) : 0, r = .026 + random() * .022, h = .1 + random() * .26;
      const cx = x + Math.cos(angle) * radius, cz = z + Math.sin(angle) * radius;
      place(wax, body, cx, base + .03 + h / 2, cz, r, h, r, 0, 0, 0, 0xf6e7cf);
      candles.push(point(cx, base + .03 + h + .05, cz));
    }
  };
  const nest = (cx: number, cz: number, yaw: number, w: number, len: number, seed: number, under: number, over: number, top: number) => {
    const put = yawPut(cx, cz, yaw), random = seeded(Math.floor(seed * 104729) + 7);
    put(boucle, once(softBoxGeometry(w, .3, len, { radius: .12, crown: .02, seg: 8, tile })), 0, fy + .17, 0, CHOCOLATE);
    put(quilted, once(quiltGeometry(w - .05, len - .05, { overhang: .24, ground: .3, puff: .05, cell: .42, seed, step: quiltStep * 1.25, rumple: .018 })), 0, fy + .34, 0, under);
    put(quilted, once(softBoxGeometry(w * .94, .11, len * .9, { radius: .05, crown: .05, wrinkle: .007, seed: seed + 1, seg: 9 })), 0, fy + .42, .06, over);
    put(quilted, once(quiltGeometry(w * .62, len * .5, { overhang: .32, ground: .24, puff: .04, cell: .34, seed: seed + 2, step: quiltStep, rumple: .03 })), -w * .14, fy + .52, len * .18, top, 0, .07);
    const pillows = Math.max(2, Math.round(w / .85));
    for (let i = 0; i < pillows; i++) {
      const lx = (i - (pillows - 1) / 2) * (w / pillows) + (random() - .5) * .12;
      put(quilted, pillow(.78, .56, .26, seed + i * 1.9), lx, fy + .76, -len / 2 + .3 + random() * .08, i % 2 ? top : over, -1.02, (random() - .5) * .2, (random() - .5) * .16);
    }
  };
  const furnishCandles = () => {
    nest(-23.8, 6.05, Math.PI / 2, 6.4, 2.6, 2.1, PLUM, TERRACOTTA, CAMEL);
    nest(-22, 12.08, Math.PI, 4.8, 3.05, 5.7, CAMEL, PLUM, RUST);
    nest(-18.72, 12.3, Math.PI / 2, 1.8, 1.35, 8.9, RUST, CAMEL, PLUM);
    for (const [x, tint] of [[-24.6, PLUM], [-22.2, CAMEL]] as const) place(quilted, once(poufGeometry(.55, .32, 10, mobile ? 28 : 48, mobile ? 12 : 22)), x, fy, 1.4, 1, 1, 1, 0, x * .3, 0, tint);
    // Quilts cover the rest of the floor, one over another.
    const mats: readonly (readonly [number, number, number, number, number, number])[] = [
      [-20.2, 6, 2.8, 2.2, .3, RUST], [-18.8, 2.9, 2.3, 1.7, -.5, CAMEL], [-18.6, 9, 2.5, 2, .7, PLUM], [-27, 6.2, 2.4, 3.3, .1, TERRACOTTA],
      [-27.2, 2, 2.1, 1.7, -.4, OATMEAL], [-27.4, 10.8, 2.3, 2, .5, FOREST], [-21.3, .4, 1.9, 1.3, .25, MUSTARD], [-26.8, -.4, 1.7, 1.2, -.2, RUST],
    ];
    mats.forEach(([x, z, w, d, yaw, tint], i) => place(quilted, once(quiltGeometry(w, d, { overhang: .12, ground: .06, puff: .03, cell: .38, seed: i * 1.7, step: quiltStep * 1.4, rumple: .02 })), x, fy + .07 + (i % 3) * .012, z, 1, 1, 1, 0, yaw, 0, tint));
    for (const [x, z, n, seed] of [[-29, -1, 6, 1.3], [-29, 13, 5, 2.9], [-26.6, 13.1, 4, 4.7]] as const) {
      const colors = [RUST, CAMEL, PLUM, OATMEAL, TERRACOTTA, FOREST];
      for (let i = 0; i < n; i++) place(quilted, once(softBoxGeometry(1.05 - i * .03, .17, .78, { radius: .08, crown: .03, wrinkle: .006, seed: seed + i, seg: 7 })), x, fy + .085 + i * .16, z, 1, 1, 1, 0, (i % 2 ? .08 : -.05) + seed, 0, colors[(i + Math.floor(seed)) % colors.length]);
    }
    place(walnut, once(texturedBox(.5, .4, 10.4, .55)), -29.35, fy + .2, 6.2, 1, 1, 1, 0, 0, 0, 0x4f4236);
    BAIKAL_CANDLE_GROUPS.forEach(([x, z, lift, count], i) => candleCluster(x, lift, z, count, i * 2.3 + .7));
    // Long swags of fabric make a low tent of the high roof.
    const swag = (z: number, tint: number, seed: number) => place(drape, once(drapeGeometry([new THREE.Vector3(-29.6, 4.0, z), new THREE.Vector3(-26, 4.25, z), new THREE.Vector3(-21, 5.0, z), new THREE.Vector3(-16.4, 6.0, z)], 2.9, { folds: 3, depth: .09, seed, tile: .8, columns: mobile ? 16 : 28, rows: mobile ? 16 : 26 })), 0, 0, 0, 1, 1, 1, 0, 0, 0, tint);
    swag(1.2, 0x7a3f33, 1.3); swag(4.2, 0x8a5a3a, 4.4); swag(7.2, 0x6c3a40, 7.1); swag(10.2, 0x8a5a3a, 9.6); swag(13, 0x7a3f33, 2.2);
    const hang = glassY1 - fy - .12;
    place(drape, once(curtainGeometry(1.5, hang, 6, 3.3, mobile ? 40 : 72)), -16.34, fy + .04, 13.05, 1, 1, 1, 0, Math.PI / 2, 0, 0x5a3232);
    place(drape, once(curtainGeometry(1.1, hang, 4.5, 6.7, mobile ? 30 : 56)), -16.34, fy + .04, 1.82, 1, 1, 1, 0, Math.PI / 2, 0, 0x5a3232);
    // Compact brass telescope aimed through the eastern glazing; the visitor's long view stays clear.
    for (let leg = 0; leg < 3; leg++) {
      const a = leg * Math.PI * 2 / 3;
      const start = new THREE.Vector3(-18.3 + Math.cos(a) * .42, fy + .03, 9.6 + Math.sin(a) * .42);
      const end = new THREE.Vector3(-18.3, fy + 1.2, 9.6), direction = end.clone().sub(start), middle = start.clone().add(end).multiplyScalar(.5);
      const legGeometry = keep(new THREE.CylinderGeometry(.022, .035, direction.length(), 8));
      legGeometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
      place(brass, legGeometry, middle.x, middle.y, middle.z);
    }
    place(brass, sphere, -18.3, fy + 1.23, 9.6, .13, .13, .13);
    place(brass, cylinder, -18.22, fy + 1.46, 9.6, .12, 1.02, .12, 0, 0, -.94);
    place(iron, cylinder, -17.79, fy + 1.77, 9.6, .108, .025, .108, 0, 0, -.94);
  };

  /* ---- build every house ---- */
  batches = world;
  BAIKAL_CABINS.forEach((site, cabinIndex) => {
    offsetX = site.offsetX; offsetZ = site.offsetZ;
    for (const z of [c.minZ - .6, c.maxZ + .6]) lamp(c.porchMaxX + 1.4, fy + .95, z);
    const glassy = site.id === "warm", dark = site.id === "aurora", snug = site.id === "refuge";
    const inner = snug ? plaster : oak, innerTint = dark ? 0x5e5044 : undefined;
    const shell = glassy ? partShell : fullShell, lining = glassy ? partLiner : fullLiner;
    place(charred, shell, 0, 0, c.minZ - c.wall / 2); place(charred, shell, 0, 0, c.maxZ - c.wall / 2);
    place(inner, lining, 0, 0, c.minZ + c.wall / 2, 1, 1, 1, 0, 0, 0, innerTint); place(inner, lining, 0, 0, c.maxZ - c.wall / 2 - .02, 1, 1, 1, 0, 0, 0, innerTint);
    place(inner, once(boardBox(.02, c.lowEave, width - c.wall, .13)), c.minX + c.wall / 2 + .01, fy + c.lowEave / 2, centreZ, 1, 1, 1, 0, 0, 0, innerTint);
    if (snug) { lowCeiling(); windowWall(); furnishBeds(); }
    else {
      slopedCeiling(dark ? 0x6a5a4c : 0xe2c8a4, dark ? 0x54463a : 0xe6d6bc);
      glassWall();
      if (glassy) { sideGlazing(); furnishWarm(); } else furnishCandles();
    }
    hearths.push(dark ? point(-23.4, fy + .3, -1.2) : point(-23.4, fy + .55, -.78)); hearthFlames.push(!dark);
    const colour = [0xffc27a, 0xffcf9a, 0xffa860][cabinIndex], gain = [1, .7, .22][cabinIndex];
    for (const [x, y, z] of [[-21.5, 3.3, 4.5], [-22.2, 3.4, 10], [-26.2, 2.9, 6]]) cabinLights.push({ position: point(x, Math.min(y, fy + BAIKAL_REFUGE_CEILING - .4), z), color: colour, gain });
  });
  offsetX = offsetZ = 0;
  // Low warm guide posts stand outside the protected corridor; the lake remains open and freely walkable.
  for (let segment = 1; segment < BAIKAL_JOURNEY_ROUTE.length; segment++) {
    const a = BAIKAL_JOURNEY_ROUTE[segment - 1], b = BAIKAL_JOURNEY_ROUTE[segment], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    const count = Math.max(1, Math.floor(length / 13));
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1), x = a[0] + dx * t - dz / length * 3.4, z = a[1] + dz * t + dx / length * 3.4, y = baikalFloorHeight(x, z);
      place(walnut, cylinder, x, y + .32, z, .045, .64, .045, 0, 0, 0, 0x6e5f50);
      place(iron, cylinder, x, y + .69, z, .13, .1, .13);
      place(lampGlow, sphere, x, y + .64, z, .11, .1, .11, 0, 0, 0, 0xffa64d);
      lamp(x, y + .66, z);
    }
  }

  /* ---- assemble ---- */
  const merged = (pieces: THREE.BufferGeometry[]) => {
    const geometry = mergeGeometries(pieces, false)!;
    for (const piece of new Set(pieces)) piece.dispose();
    owned.push(geometry);
    return geometry;
  };
  const tints = new Map<THREE.Material, readonly number[]>([[floor, [0xffffff, 0xfff1e0, 0x6a5c50]]]);
  const white = new THREE.Color(0xffffff), occluders: THREE.Object3D[] = [];
  for (const [material, pieces] of common) {
    const mesh = new THREE.InstancedMesh(merged(pieces), material, BAIKAL_CABINS.length); mesh.name = material.name;
    BAIKAL_CABINS.forEach((site, i) => {
      mesh.setMatrixAt(i, matrix.makeTranslation(site.offsetX, 0, site.offsetZ));
      const tint = tints.get(material);
      mesh.setColorAt(i, tint ? hex(tint[i]) : white);
    });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false; root.add(mesh); occluders.push(mesh);
  }
  for (const [material, pieces] of world) {
    const mesh = new THREE.Mesh(merged(pieces), material); mesh.name = common.has(material) ? `${material.name}-rooms` : material.name; mesh.frustumCulled = false; root.add(mesh); occluders.push(mesh);
  }
  const normalizedPanes = panes.map(p => p.index ? p.toNonIndexed() : p);
  const glassGeometry = mergeGeometries(normalizedPanes, false)!;
  new Set([...panes, ...normalizedPanes]).forEach(p => p.dispose()); owned.push(glassGeometry);
  const glassMesh = new THREE.Mesh(glassGeometry, glass); glassMesh.name = "baikal-glass-wall"; glassMesh.renderOrder = 6; root.add(glassMesh);
  for (const geometry of [box, cylinder, disc, sphere, ...new Set(templates)]) geometry.dispose();

  // Soft halos around every lamp and flame, and a broad warm glow in front of each stove.
  const glowCount = lamps.length + candles.length + hearths.length, glowData = new Float32Array(glowCount * 4), glowSeeds = new Float32Array(glowCount * 2);
  [...lamps.map((l, i) => [l, lampHalos[i]] as const), ...candles.map(l => [l, .4] as const), ...hearths.map((l, i) => [l, hearthFlames[i] ? 1.6 : .9] as const)].forEach(([spot, size], index) => {
    glowData.set([spot.x, spot.y, spot.z, size], index * 4); glowSeeds.set([index * .173 % 1, index * .377 % 1], index * 2);
  });
  const glowGeometry = new THREE.InstancedBufferGeometry(), quad = new THREE.PlaneGeometry(1, 1);
  glowGeometry.index = quad.index!.clone(); for (const name of ["position", "normal", "uv"]) glowGeometry.setAttribute(name, quad.getAttribute(name).clone()); quad.dispose();
  glowGeometry.setAttribute("aGlow", new THREE.InstancedBufferAttribute(glowData, 4)); glowGeometry.setAttribute("aGlowSeed", new THREE.InstancedBufferAttribute(glowSeeds, 2));
  glowGeometry.instanceCount = glowCount; owned.push(glowGeometry);
  const glowMaterial = new THREE.ShaderMaterial({ uniforms: { uTime: shared.uTime, uNight: { value: 1 }, uGlowColor: { value: new THREE.Color(0xffb866) } },
    vertexShader: BAMBOO_GLOW_VERT, fragmentShader: BAMBOO_GLOW_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  glowMaterial.name = "baikal-lamp-glow"; materials.push(glowMaterial);
  const glows = new THREE.Mesh(glowGeometry, glowMaterial); glows.name = "baikal-lamp-glow"; glows.frustumCulled = false; glows.renderOrder = 7; root.add(glows);
  let disposed = false;
  return { root, lamps, candles, chimneys, hearth: hearths[0], hearths, hearthFlames, cabinLights, occluders, captureHidden: [glassMesh, glows],
    setEnvironment(environment) {
      if (disposed) return;
      for (const material of environmentTargets) { material.envMap = environment; material.needsUpdate = true; }
    },
    applyNight(amount) {
      if (disposed) return;
      const value = THREE.MathUtils.clamp(amount, 0, 1);
      lampGlow.emissiveIntensity = .9 + value * 2.6;
      glowMaterial.uniforms.uNight.value = .35 + value * .65;
    },
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); root.clear(); owned.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
