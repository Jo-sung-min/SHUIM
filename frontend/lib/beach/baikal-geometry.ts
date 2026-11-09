import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { createShelterPillowGeometry } from "./shelter-textiles";
import { BAMBOO_GLOW_FRAG, BAMBOO_GLOW_VERT } from "./bamboo-shader";
import { BAIKAL_BLOCKS, BAIKAL_CABIN, BAIKAL_SHORE, BAIKAL_TERRACE, BAIKAL_TREES, baikalFloorHeight, baikalRoofHeight, baikalSnowCover } from "./baikal-layout";
import { type BaikalUniforms, createBaikalGlassMaterial, createBaikalHummockMaterial, createBaikalIceMaterial } from "./baikal-materials";

export interface BaikalTextures { wood: THREE.Texture; cotton: THREE.Texture }

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
function hummockGeometry(variant: number): THREE.BufferGeometry {
  let state = 7919 + variant * 104729;
  const random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
  const points: THREE.Vector3[] = [];
  const count = 12 + variant * 2, flat = variant % 2 === 0;
  for (let i = 0; i < count; i++) {
    const x = (random() * 2 - 1) * (flat ? 1 : .8), y = Math.pow(random(), flat ? 1.6 : .9), z = (random() * 2 - 1) * (flat ? .55 : .85);
    points.push(new THREE.Vector3(x, y, z));
  }
  // A flat base so every block sits on the ice, and a few spikes so the silhouette breaks.
  points.push(new THREE.Vector3(-1, 0, -.6), new THREE.Vector3(1, 0, -.6), new THREE.Vector3(1, 0, .6), new THREE.Vector3(-1, 0, .6));
  points.push(new THREE.Vector3(random() * .6 - .3, 1, random() * .4 - .2));
  const geometry = new ConvexGeometry(points);
  geometry.computeVertexNormals();
  const position = geometry.getAttribute("position"), normal = geometry.getAttribute("normal"), thick = new Float32Array(position.count);
  const centre = new THREE.Vector3(0, .45, 0), p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).sub(centre); n.fromBufferAttribute(normal, i);
    const radial = p.length() || 1;
    thick[i] = THREE.MathUtils.clamp(n.dot(p) / radial, 0, 1) * Math.min(1, radial / .9);
  }
  geometry.setAttribute("aThick", new THREE.BufferAttribute(thick, 1));
  return geometry;
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
  const dome = new THREE.SphereGeometry(1, mobile ? 10 : 14, 5, 0, Math.PI * 2, 0, Math.PI / 2); geometries.push(dome);
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
    positions.push(x, baikalFloorHeight(x, z) + .012, z); lifts.push(baikalSnowCover(x, z));
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
export interface BaikalShore { root: THREE.Group; dispose(): void }
/** Two height fields (a coarse bank, a fine mound) drawn with the ice shader, plus a stand of snowy larches on the bank. */
export function buildBaikalShore(parent: THREE.Object3D, shared: BaikalUniforms, textures: BaikalTextures, mobile: boolean): BaikalShore {
  const root = new THREE.Group(); root.name = "baikal-shore"; parent.add(root);
  const material = createBaikalIceMaterial(shared, true);
  const bank = heightfield(-126, BAIKAL_SHORE.startX + 3, -146, 76, mobile ? 3 : 2); bank.name = "baikal-shore-bank";
  const mound = heightfield(BAIKAL_TERRACE.x - BAIKAL_TERRACE.radius - 6, BAIKAL_TERRACE.x + BAIKAL_TERRACE.radius + 6,
    BAIKAL_TERRACE.z - BAIKAL_TERRACE.radius - 6, BAIKAL_TERRACE.z + BAIKAL_TERRACE.radius + 6, mobile ? .9 : .6); mound.name = "baikal-cabin-mound";
  const bankMesh = new THREE.Mesh(bank, material), moundMesh = new THREE.Mesh(mound, material);
  bankMesh.name = "baikal-shore-bank"; moundMesh.name = "baikal-cabin-mound"; root.add(bankMesh, moundMesh);
  // Larches: a trunk and three tiers of boughs in one geometry, snow caps in the ice shader so they match the ground.
  const trunk = new THREE.CylinderGeometry(.12, .22, 1, 7); trunk.translate(0, .5, 0);
  const tiers = [0.28, 0.52, 0.76].map((level, index) => { const cone = new THREE.ConeGeometry(1 - index * .26, .42, 9); cone.translate(0, level + .21, 0); return cone; });
  const larch = mergeGeometries([trunk, ...tiers].map(piece => piece.toNonIndexed()), false)!;
  [trunk, ...tiers].forEach(piece => piece.dispose());
  const caps = mergeGeometries([0.28, 0.52, 0.76].map((level, index) => { const cap = new THREE.ConeGeometry((1 - index * .26) * .92, .14, 9); cap.translate(0, level + .40, 0); return cap.toNonIndexed(); }), false)!;
  const bark = new THREE.MeshStandardMaterial({ color: 0x2f3b36, roughness: .95, map: textures.wood }); bark.name = "baikal-larch";
  const trees = new THREE.InstancedMesh(larch, bark, BAIKAL_TREES.length), snowCaps = new THREE.InstancedMesh(caps, material, BAIKAL_TREES.length);
  trees.name = "baikal-larches"; snowCaps.name = "baikal-larch-snow";
  const transform = new THREE.Object3D();
  BAIKAL_TREES.forEach((tree, index) => {
    transform.position.set(tree.x, baikalFloorHeight(tree.x, tree.z) - .1, tree.z);
    transform.rotation.set(0, tree.seed * 6.28, 0); transform.scale.set(.42 * tree.height, tree.height, .42 * tree.height);
    transform.updateMatrix(); trees.setMatrixAt(index, transform.matrix); snowCaps.setMatrixAt(index, transform.matrix);
  });
  trees.instanceMatrix.needsUpdate = snowCaps.instanceMatrix.needsUpdate = true; root.add(trees, snowCaps);
  let disposed = false;
  return { root, dispose() {
    if (disposed) return; disposed = true;
    root.removeFromParent(); root.clear(); bank.dispose(); mound.dispose(); larch.dispose(); caps.dispose(); trees.dispose(); snowCaps.dispose(); material.dispose(); bark.dispose();
  } };
}

/* ---------------- the cabin ---------------- */
export interface BaikalCabin {
  root: THREE.Group;
  /** Warm light sources for the pooled point lights and the glow billboards: pendants, sconces, the floor lamp, porch lanterns. */
  lamps: readonly THREE.Vector3[];
  candles: readonly THREE.Vector3[];
  /** Where the stove's flames rise from, and where its glow is drawn. */
  hearth: THREE.Vector3;
  applyNight(amount: number): void;
  dispose(): void;
}
/** A mono-pitch timber cabin: one glass wall towards the lake, a stove against the south wall, cream sofas around a low table. */
export function buildBaikalCabin(parent: THREE.Object3D, textures: BaikalTextures, shared: BaikalUniforms, mobile: boolean): BaikalCabin {
  const root = new THREE.Group(); root.name = "baikal-cabin"; parent.add(root);
  const c = BAIKAL_CABIN, fy = c.floorY, owned: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const lamps: THREE.Vector3[] = [], candles: THREE.Vector3[] = [];
  const standard = (name: string, color: number, options: THREE.MeshStandardMaterialParameters = {}) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: .9, ...options }); material.name = name; materials.push(material); return material;
  };
  const oak = standard("baikal-oak", 0xcaa87c, { map: textures.wood, roughness: .72 });
  const walnut = standard("baikal-walnut", 0x5b4231, { map: textures.wood, roughness: .8 });
  const plaster = standard("baikal-plaster", 0xe2d3bf, { bumpMap: textures.cotton, bumpScale: .002 });
  const cream = standard("baikal-boucle", 0xf1e9db, { map: textures.cotton, bumpMap: textures.cotton, bumpScale: .004 });
  const ochre = standard("baikal-throws", 0xd49a5c, { map: textures.cotton, bumpMap: textures.cotton, bumpScale: .003 });
  const rug = standard("baikal-rug", 0xe3d6bf, { map: textures.cotton, roughness: 1 });
  const iron = standard("baikal-iron", 0x1b1a1a, { roughness: .55, metalness: .45 });
  const bronze = standard("baikal-bronze-frame", 0x3a3330, { roughness: .5, metalness: .35 });
  const slate = standard("baikal-slate", 0x474b51, { roughness: .85 });
  const darkGlass = standard("baikal-table-glass", 0x0d1012, { roughness: .18, metalness: .55 });
  const wax = standard("baikal-candle-wax", 0xfff1dc, { emissive: 0xffc98a, emissiveIntensity: .35, roughness: .6 });
  const amber = standard("baikal-lamp-glass", 0xffe2b0, { emissive: 0xffb45c, emissiveIntensity: 1.2, roughness: .5 });
  const linen = standard("baikal-lamp-shade", 0xfff0dc, { emissive: 0xffc98a, emissiveIntensity: .8, roughness: .95 });
  const snow = standard("baikal-roof-snow", 0xf4f7fb, { roughness: 1 });
  const glass = createBaikalGlassMaterial(shared); materials.push(glass);

  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const box = new THREE.BoxGeometry(1, 1, 1), soft = new RoundedBoxGeometry(1, 1, 1, 2, .1), cylinder = new THREE.CylinderGeometry(1, 1, 1, 14);
  const disc = new THREE.CircleGeometry(1, 14), sphere = new THREE.SphereGeometry(1, 12, 8);
  const pillow = createShelterPillowGeometry(); pillow.deleteAttribute("color");
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler();
  const place = (material: THREE.Material, geometry: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
    const piece = geometry.clone(); matrix.compose(new THREE.Vector3(x, y, z), quaternion.setFromEuler(euler.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    piece.applyMatrix4(matrix);
    if (!batches.has(material)) batches.set(material, []); batches.get(material)!.push(piece);
  };
  const keep = (geometry: THREE.BufferGeometry) => { owned.push(geometry); return geometry; };

  // Deck, walls and roof. The side walls are trapezoids following the single roof slope.
  const width = c.maxZ - c.minZ, centreZ = (c.minZ + c.maxZ) / 2, depth = c.porchMaxX - c.minX;
  place(oak, keep(texturedBox(depth + .4, .6, width + .4, .55)), (c.minX + c.porchMaxX) / 2, fy - .3, centreZ);
  place(plaster, keep(texturedBox(c.wall, c.lowEave, width, .4)), c.minX + c.wall / 2, fy + c.lowEave / 2, centreZ);
  place(walnut, keep(texturedBox(.14, c.lowEave + .3, width + .5, .45)), c.minX - .07, fy + c.lowEave / 2, centreZ);
  const wallShape = new THREE.Shape();
  wallShape.moveTo(c.minX, fy); wallShape.lineTo(c.maxX, fy); wallShape.lineTo(c.maxX, fy + c.highEave); wallShape.lineTo(c.minX, fy + c.lowEave); wallShape.closePath();
  const sideWall = keep(new THREE.ExtrudeGeometry(wallShape, { depth: c.wall, bevelEnabled: false }));
  const uv = sideWall.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * .45, uv.getY(i) * .45);
  for (const z of [c.minZ - c.wall / 2, c.maxZ - c.wall / 2]) place(walnut, sideWall, 0, 0, z);
  const roofRun = c.eaveMaxX + .4 - (c.minX - .8), roofMidX = (c.minX - .8 + c.eaveMaxX + .4) / 2;
  const slope = (baikalRoofHeight(c.maxX) - baikalRoofHeight(c.minX)) / (c.maxX - c.minX), pitch = Math.atan(slope), roofLength = roofRun / Math.cos(pitch);
  const roofMidY = baikalRoofHeight(roofMidX);
  place(walnut, keep(texturedBox(roofLength, .24, width + 2 * c.sideEave, .45)), roofMidX, roofMidY + .12, centreZ, 1, 1, 1, 0, 0, pitch);
  place(snow, keep(texturedBox(roofLength + .1, .32, width + 2 * c.sideEave + .1, .3)), roofMidX, roofMidY + .42, centreZ, 1, 1, 1, 0, 0, pitch);
  for (let k = 0; k < 7; k++) place(oak, box, roofMidX, roofMidY - .11, c.minZ + .7 + k * (width - 1.4) / 6, roofLength - .5, .22, .14, 0, 0, pitch);
  for (const dx of [-.6, 2.4, 5.4, 8.4, 11.4]) place(oak, box, c.minX + dx + .9, baikalRoofHeight(c.minX + dx + .9) - .22, centreZ, .12, .14, width - .5);

  // The glass wall: a stub pane south of the door, a transom over the door, six tall bays, dark mullions, a stone sill.
  const panes: THREE.BufferGeometry[] = [];
  /** A pane facing +x spans z0..z1; a pane facing +z spans x0..x1 at the given z (the stove window). */
  const paneAt = (centre: THREE.Vector3, w: number, h: number, facing: "x" | "z") => {
    const geometry = new THREE.PlaneGeometry(Math.max(.1, w - .06), Math.max(.1, h - .06));
    if (facing === "x") geometry.rotateY(Math.PI / 2);
    geometry.translate(centre.x, centre.y, centre.z);
    const sizes = new Float32Array(geometry.getAttribute("position").count * 2);
    for (let i = 0; i < sizes.length; i += 2) { sizes[i] = w; sizes[i + 1] = h; }
    geometry.setAttribute("aPane", new THREE.BufferAttribute(sizes, 2)); panes.push(geometry);
  };
  const pane = (x: number, y0: number, y1: number, z0: number, z1: number) => paneAt(new THREE.Vector3(x, (y0 + y1) / 2, (z0 + z1) / 2), z1 - z0, y1 - y0, "x");
  const glassX = c.maxX, glassY0 = fy + .15, glassY1 = fy + c.highEave - .15, rowH = (glassY1 - glassY0) / 3, doorHead = fy + 2.3;
  const bays: [number, number][] = [[c.minZ, c.doorMinZ], [c.doorMinZ, c.doorMaxZ]];
  for (let k = 0; k < 6; k++) bays.push([c.doorMaxZ + (c.maxZ - c.doorMaxZ) * k / 6, c.doorMaxZ + (c.maxZ - c.doorMaxZ) * (k + 1) / 6]);
  bays.forEach(([z0, z1], index) => {
    if (index === 1) { pane(glassX, doorHead, glassY1, z0, z1); return; }
    for (let r = 0; r < 3; r++) pane(glassX, glassY0 + rowH * r, glassY0 + rowH * (r + 1), z0, z1);
  });
  // The door stands open, folded flat against the outside of the glass wall; the stove's little window is glass too.
  pane(glassX + .22, fy + .05, doorHead - .05, c.doorMaxZ + .05, c.doorMaxZ + 2.35);
  place(bronze, box, glassX + .22, (fy + doorHead) / 2, c.doorMaxZ + 1.2, .05, doorHead - fy, 2.4);
  place(bronze, box, glassX + .22, (fy + doorHead) / 2, c.doorMaxZ + 1.2, .08, doorHead - fy - .1, .06);
  for (const [z0] of bays) place(bronze, box, glassX, fy + c.highEave / 2, z0, .12, c.highEave, .08);
  place(bronze, box, glassX, fy + c.highEave / 2, c.maxZ, .12, c.highEave, .08);
  for (let r = 0; r <= 3; r++) place(bronze, box, glassX, glassY0 + rowH * r, centreZ, .12, .07, width);
  place(bronze, box, glassX, doorHead, (c.doorMinZ + c.doorMaxZ) / 2, .12, .1, c.doorMaxZ - c.doorMinZ);
  place(slate, box, glassX, fy + .08, (c.doorMaxZ + c.maxZ) / 2, .3, .16, c.maxZ - c.doorMaxZ);
  place(slate, box, glassX, fy + .08, (c.minZ + c.doorMinZ) / 2, .3, .16, c.doorMinZ - c.minZ);
  // Porch posts and bench.
  for (const z of [c.minZ + .4, c.maxZ - .4]) place(walnut, cylinder, c.porchMaxX - .3, (fy + baikalRoofHeight(c.porchMaxX - .3)) / 2, z, .12, baikalRoofHeight(c.porchMaxX - .3) - fy, .12);
  place(oak, box, -14.6, fy + .45, 9.4, .5, .08, 2.4);
  for (const dz of [-1.05, 1.05]) place(oak, box, -14.6, fy + .2, 9.4 + dz, .42, .4, .08);
  place(oak, box, -14.95, fy + .72, 9.4, .06, .46, 2.4);
  for (const z of [c.minZ - .6, c.maxZ + .6]) {
    place(walnut, box, c.porchMaxX + 1.4, fy - .3 + .6, z, .1, 1.2, .1);
    place(amber, sphere, c.porchMaxX + 1.4, fy + .95, z, .14, .18, .14); lamps.push(new THREE.Vector3(c.porchMaxX + 1.4, fy + .95, z));
  }

  // Inside: rug, the long sofa facing the glass, the side sofa facing the stove, the armchair, cushions by the fire.
  place(rug, keep(texturedBox(7.2, .02, 5.8, .6)), -21.9, fy + .01, 6.3);
  // A sofa is laid out in its own frame: lx runs along the seat row, +lz is the back (away from the facing direction fx, fz).
  const sofa = (cx: number, cz: number, fx: number, fz: number, length: number, seats: number) => {
    const rx = -fz, rz = fx, theta = Math.atan2(-rz, rx);
    const put = (lx: number, y: number, lz: number, sx: number, sy: number, sz: number) =>
      place(cream, soft, cx + lx * rx - lz * fx, y, cz + lx * rz - lz * fz, sx, sy, sz, 0, theta);
    put(0, fy + .21, 0, length, .42, 1.0);
    const pitch = (length - .3) / seats;
    for (let s = 0; s < seats; s++) put((s - (seats - 1) / 2) * pitch, fy + .5, -.06, pitch - .05, .2, .95);
    put(0, fy + .82, .36, length - .1, .62, .3);
    for (const end of [-1, 1]) put(end * (length / 2 - .11), fy + .6, 0, .22, .5, 1.0);
  };
  sofa(-23.1, 6.05, 1, 0, 6.4, 4);
  sofa(-22, 11.45, 0, -1, 4.4, 3);
  for (const [x, z, ry] of [[-23.35, 4.2, 1.3], [-23.35, 7.9, 1.9], [-20.6, 11.75, .3]] as const) place(ochre, pillow, x, fy + .78, z, .5, .5, .5, 0, ry);
  place(ochre, soft, -22.9, fy + .62, 8.3, .9, .05, 1.3, 0, Math.PI / 2 + .2);
  place(cream, soft, -18.6, fy + .21, 12.2, .9, .42, .9); place(cream, soft, -18.5, fy + .5, 12.2, .8, .18, .8);
  place(cream, soft, -18.95, fy + .85, 12.2, .28, .7, .9); for (const dz of [-.42, .42]) place(cream, soft, -18.6, fy + .55, 12.2 + dz, .9, .45, .18);
  for (const x of [-24.6, -22.2]) place(ochre, soft, x, fy + .11, 1.4, .9, .22, .9, 0, x * .3);
  // Low table with candles and a tray.
  place(darkGlass, box, -20.4, fy + .35, 6, 2.2, .04, .9);
  for (const [dx, dz] of [[-1.05, -.4], [1.05, -.4], [-1.05, .4], [1.05, .4]]) place(iron, box, -20.4 + dx, fy + .17, 6 + dz, .05, .33, .05);
  place(walnut, box, -20.75, fy + .38, 6.1, .5, .02, .36);
  for (const dz of [-.22, 0, .22]) { place(wax, cylinder, -20.05, fy + .43, 6 + dz, .035, .12, .035); candles.push(new THREE.Vector3(-20.05, fy + .52, 6 + dz)); }
  place(walnut, box, -20.9, fy + .4, 5.6, .25, .03, .18); place(ochre, box, -20.9, fy + .43, 5.6, .22, .03, .16);
  // The stove on its slate hearth, a chimney through the roof, firewood beside it.
  const hearth = new THREE.Vector3(-23.4, fy + .3, -.78);
  place(slate, box, -23.4, fy + .03, -1.0, 1.7, .06, 1.1);
  for (const [dx, dz] of [[-.28, -.28], [.28, -.28], [-.28, .28], [.28, .28]]) place(iron, box, -23.4 + dx, fy + .12, -1.1 + dz, .06, .12, .06);
  place(iron, box, -23.4, fy + .18 + .52, -1.1, .72, 1.04, .72);
  place(iron, box, -23.4, fy + .18 + .52, -.73, .54, .42, .03);
  paneAt(new THREE.Vector3(-23.4, fy + .7, -.71), .48, .4, "z");
  place(iron, box, -23.4, fy + 1.25, -1.1, .82, .06, .82);
  const chimneyTop = baikalRoofHeight(-23.4) + .55;
  place(iron, cylinder, -23.4, (fy + 1.28 + chimneyTop) / 2, -1.1, .1, chimneyTop - fy - 1.28, .1);
  const logs: [number, number][] = [[-.27, .09], [0, .09], [.27, .09], [-.135, .25], [.135, .25], [0, .41]];
  for (const [dx, dy] of logs) place(walnut, cylinder, -25.4 + dx, fy + dy, -1.2, .085, .55, .085, Math.PI / 2);
  // Sideboard, books and a vase against the back wall; two sconces above it.
  place(walnut, keep(texturedBox(.8, .9, 6, .6)), -29.3, fy + .45, 7);
  for (const [dz, h] of [[-2.2, .22], [-1.9, .26], [-1.65, .2], [2.0, .18]]) place(ochre, box, -29.3, fy + .9 + h / 2, 7 + dz, .5, h, .2);
  place(slate, cylinder, -29.3, fy + 1.1, 8.6, .13, .4, .13); place(slate, sphere, -29.3, fy + 1.32, 8.6, .16, .1, .16);
  for (const z of [3.5, 10.5]) {
    place(iron, box, -29.7, fy + 2.3, z, .14, .05, .24);
    place(amber, cylinder, -29.55, fy + 2.2, z, .14, .22, .14); lamps.push(new THREE.Vector3(-29.4, fy + 2.2, z));
  }
  // Pendants on cords from the roof and one floor lamp by the armchair.
  for (const [x, z] of [[-21, 1.5], [-21, 4.5], [-21, 7.5], [-21, 10.5], [-26, 6]]) {
    const roofY = baikalRoofHeight(x) - .24, canY = roofY - .55;
    place(iron, cylinder, x, (roofY + canY) / 2, z, .012, roofY - canY, .012);
    place(iron, cylinder, x, canY - .08, z, .08, .16, .08);
    place(amber, disc, x, canY - .165, z, .06, .06, .06, -Math.PI / 2); lamps.push(new THREE.Vector3(x, canY - .2, z));
  }
  place(iron, cylinder, -19.4, fy + .7, 13.3, .02, 1.4, .02); place(iron, cylinder, -19.4, fy + .02, 13.3, .16, .03, .16);
  place(linen, cylinder, -19.4, fy + 1.5, 13.3, .22, .3, .22); lamps.push(new THREE.Vector3(-19.4, fy + 1.45, 13.3));

  const glassGeometry = mergeGeometries(panes.map(p => p.index ? p.toNonIndexed() : p), false)!; panes.forEach(p => p.dispose()); owned.push(glassGeometry);
  const glassMesh = new THREE.Mesh(glassGeometry, glass); glassMesh.name = "baikal-glass-wall"; glassMesh.renderOrder = 6; root.add(glassMesh);
  for (const [material, pieces] of batches) {
    const normalized = pieces.map(piece => piece.index ? piece.toNonIndexed() : piece), geometry = mergeGeometries(normalized, false)!;
    for (const piece of new Set([...pieces, ...normalized])) piece.dispose();
    owned.push(geometry); const mesh = new THREE.Mesh(geometry, material); mesh.name = material.name; root.add(mesh);
  }
  for (const geometry of [box, soft, cylinder, disc, sphere, pillow]) geometry.dispose();

  // Soft halos around every lamp and candle, and a broad warm glow in front of the stove.
  const glowCount = lamps.length + candles.length + 1, glowData = new Float32Array(glowCount * 4), glowSeeds = new Float32Array(glowCount * 2);
  [...lamps.map(l => [l, .9] as const), ...candles.map(l => [l, .3] as const), [hearth, 1.8] as const].forEach(([point, size], index) => {
    glowData.set([point.x, point.y, point.z, size], index * 4); glowSeeds.set([index * .173 % 1, index * .377 % 1], index * 2);
  });
  const glowGeometry = new THREE.InstancedBufferGeometry(), quad = new THREE.PlaneGeometry(1, 1);
  glowGeometry.index = quad.index!.clone(); for (const name of ["position", "normal", "uv"]) glowGeometry.setAttribute(name, quad.getAttribute(name).clone()); quad.dispose();
  glowGeometry.setAttribute("aGlow", new THREE.InstancedBufferAttribute(glowData, 4)); glowGeometry.setAttribute("aGlowSeed", new THREE.InstancedBufferAttribute(glowSeeds, 2));
  glowGeometry.instanceCount = glowCount; owned.push(glowGeometry);
  const glowMaterial = new THREE.ShaderMaterial({ uniforms: { uTime: shared.uTime, uNight: { value: 1 }, uGlowColor: { value: new THREE.Color(0xffb866) } },
    vertexShader: BAMBOO_GLOW_VERT, fragmentShader: BAMBOO_GLOW_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  glowMaterial.name = "baikal-lamp-glow"; materials.push(glowMaterial);
  const glows = new THREE.Mesh(glowGeometry, glowMaterial); glows.name = "baikal-lamp-glow"; glows.frustumCulled = false; glows.renderOrder = 7; root.add(glows);
  void mobile;
  let disposed = false;
  return { root, lamps, candles, hearth,
    applyNight(amount) {
      if (disposed) return;
      const value = THREE.MathUtils.clamp(amount, 0, 1);
      amber.emissiveIntensity = .5 + value * 1.1; linen.emissiveIntensity = .35 + value * .7; wax.emissiveIntensity = .2 + value * .4;
      glowMaterial.uniforms.uNight.value = .35 + value * .65;
    },
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); root.clear(); owned.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
