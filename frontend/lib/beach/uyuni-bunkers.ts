import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createShelterPillowGeometry } from "./shelter-textiles";
import { BUNKER_CEILING_Y, BUNKER_FLOOR_Y, BUNKER_LADDER_LOCAL, BUNKER_SOFA_LOCAL, UYUNI_BUNKERS, type UyuniBunkerId } from "./uyuni-bunker-layout";

export interface UyuniBunkers {
  root: THREE.Group;
  setActive(id: UyuniBunkerId | null): void;
  dispose(): void;
}

/** Small deterministic limestone grain, generated once rather than downloaded per room. */
function limestoneTexture(): THREE.DataTexture {
  const size = 128, data = new Uint8Array(size * size * 4);
  let seed = 709;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = (seed / 4294967296 - .5) * 9;
    const vein = Math.sin(x * .072 + Math.sin(y * .05) * 2) * 2.2;
    const index = (y * size + x) * 4;
    data[index] = 224 + grain + vein; data[index + 1] = 217 + grain + vein; data[index + 2] = 204 + grain + vein; data[index + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = "uyuni-bunker-limestone-grain"; texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true;
  texture.needsUpdate = true; return texture;
}

/** A static contact shade gives furniture weight without any shadow map or additional light. */
function contactTexture(): THREE.DataTexture {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const index = (y * size + x) * 4, distance = Math.hypot((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1);
    data[index] = 50; data[index + 1] = 40; data[index + 2] = 29;
    data[index + 3] = Math.round(Math.pow(Math.max(0, 1 - distance), 1.5) * 150);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = "uyuni-bunker-contact-shade"; texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.needsUpdate = true; return texture;
}

function leafGeometry(): THREE.BufferGeometry {
  const points: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let row = 0; row <= 8; row++) for (let side = -1; side <= 1; side++) {
    const t = row / 8, width = Math.pow(Math.sin(t * Math.PI), .85) * .25;
    points.push(side * width, t, Math.sin(t * Math.PI) * .17 - Math.abs(side) * .06);
    uv.push((side + 1) * .5, t);
  }
  for (let row = 0; row < 8; row++) for (let column = 0; column < 2; column++) {
    const a = row * 3 + column; indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

/** Two closed underground libraries share all geometry and materials; only the visited room renders. */
export function buildUyuniBunkers(parent: THREE.Object3D, textures: { wood: THREE.Texture; cotton: THREE.Texture }): UyuniBunkers {
  const root = new THREE.Group(); root.name = "uyuni-bunkers"; parent.add(root);
  const rooms = new Map<UyuniBunkerId, THREE.Group>();
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  const stoneTexture = limestoneTexture(), shadowTexture = contactTexture();
  const standard = (name: string, options: THREE.MeshStandardMaterialParameters) => {
    const material = new THREE.MeshStandardMaterial({ roughness: .88, ...options, fog: false });
    material.name = `uyuni-bunker-${name}`; materials.add(material); return material;
  };
  const wall = standard("limestone-walls", { map: stoneTexture, bumpMap: stoneTexture, bumpScale: .035, color: 0xe9e2d6 });
  const floor = standard("limestone-floor", { map: stoneTexture, bumpMap: stoneTexture, bumpScale: .018, color: 0xcfc5b5, roughness: .76 });
  const plaster = standard("ceiling-plaster", { color: 0xe9e3d8 });
  const oak = standard("warm-oak", { map: textures.wood, color: 0xc5a77f });
  const walnut = standard("walnut", { map: textures.wood, color: 0x705542 });
  const ivory = standard("ivory-linen", { map: textures.cotton, bumpMap: textures.cotton, bumpScale: .003, color: 0xf0e9dc, roughness: .98 });
  const sage = standard("sage-linen", { map: textures.cotton, bumpMap: textures.cotton, bumpScale: .002, color: 0x919a82, roughness: .98 });
  const rug = standard("woven-rug", { map: textures.cotton, color: 0xc6bba6, roughness: 1 });
  const ceramic = standard("ceramics", { color: 0xd8c7ac, roughness: .65 });
  const brass = standard("brushed-brass", { color: 0xb69b65, metalness: .65, roughness: .48 });
  const foliage = standard("foliage", { color: 0x6d8462, roughness: .93, side: THREE.DoubleSide });
  const books = standard("book-cloths", { color: 0xffffff, vertexColors: true });
  const paper = standard("lamp-paper", { map: textures.cotton, color: 0xffe8ba, emissive: 0xffc984, emissiveIntensity: .6, roughness: .98 });
  const strip = standard("indirect-light", { color: 0xffe7bf, emissive: 0xffd49a, emissiveIntensity: 1.25 });
  const shadow = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: .48, depthWrite: false, toneMapped: false, fog: false });
  shadow.name = "uyuni-bunker-contact-shadows"; materials.add(shadow);

  const box = new THREE.BoxGeometry(1, 1, 1), sphere = new THREE.SphereGeometry(1, 18, 12);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 20), plane = new THREE.PlaneGeometry(1, 1), leaf = leafGeometry();
  const pillow = createShelterPillowGeometry(); pillow.deleteAttribute("color");
  const pot = new THREE.LatheGeometry([[0, 0], [.43, 0], [.56, .1], [.62, .58], [.58, .75], [.52, .77], [.5, .65]].map(([x, y]) => new THREE.Vector2(x, y)), 20);
  const vase = new THREE.LatheGeometry([[0, 0], [.14, 0], [.23, .16], [.19, .34], [.08, .46], [.07, .5], [.055, .5], [.055, .44]].map(([x, y]) => new THREE.Vector2(x, y)), 18);
  const cup = new THREE.LatheGeometry([[0, 0], [.06, 0], [.085, .10], [.08, .13], [.066, .13], [.06, .03], [0, .03]].map(([x, y]) => new THREE.Vector2(x, y)), 14);
  const shade = new THREE.LatheGeometry([[.28, -.27], [.71, -.23], [.92, -.08], [.95, .06], [.77, .21], [.29, .28]].map(([x, y]) => new THREE.Vector2(x, y)), 28);
  const torus = new THREE.TorusGeometry(.09, .014, 5, 16);
  const sources = new Set([box, sphere, cylinder, plane, leaf, pillow, pot, vase, cup, shade, torus]);
  const rounded = new Map<string, THREE.BufferGeometry>();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const transform = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler();
  const place = (material: THREE.Material, geometry: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, color?: number) => {
    const piece = geometry.clone();
    transform.compose(new THREE.Vector3(x, y, z), quaternion.setFromEuler(euler.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    piece.applyMatrix4(transform);
    if (material === wall || material === floor || material === oak || material === walnut) {
      const position = piece.getAttribute("position"), normal = piece.getAttribute("normal"), uv = piece.getAttribute("uv");
      const scale = material === wall || material === floor ? .32 : .6;
      for (let i = 0; i < position.count; i++) {
        const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
        uv.setXY(i, (nx > ny && nx > nz ? position.getZ(i) : position.getX(i)) * scale,
          (ny > nx && ny > nz ? position.getZ(i) : position.getY(i)) * scale);
      }
    }
    if (material === books) {
      const tint = new THREE.Color(color ?? 0xffffff), values = new Float32Array(piece.getAttribute("position").count * 3);
      for (let i = 0; i < values.length; i += 3) { values[i] = tint.r; values[i + 1] = tint.g; values[i + 2] = tint.b; }
      piece.setAttribute("color", new THREE.BufferAttribute(values, 3));
    }
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material)!.push(piece);
  };
  const softBox = (material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number, radius = .12, ry = 0) => {
    const key = `${width},${height},${depth},${radius}`;
    if (!rounded.has(key)) rounded.set(key, new RoundedBoxGeometry(width, height, depth, 2, Math.min(radius, Math.min(width, height, depth) * .48)));
    place(material, rounded.get(key)!, x, y, z, 1, 1, 1, 0, ry);
  };
  const h = BUNKER_CEILING_Y - BUNKER_FLOOR_Y;

  // Solid slabs enclose the entire room. The wooden ceiling lid is a closed surface beneath the slab.
  place(floor, box, 0, -.16, 0, 20.64, .32, 18.64);
  place(plaster, box, 0, h + .16, 0, 20.64, .32, 18.64);
  for (const x of [-10.16, 10.16]) place(wall, box, x, h / 2, 0, .32, h, 18.64);
  for (const z of [-9.16, 9.16]) place(wall, box, 0, h / 2, z, 20, h, .32);
  for (const x of [-9.97, 9.97]) place(oak, box, x, .12, 0, .05, .24, 18);
  for (const z of [-8.97, 8.97]) place(oak, box, 0, .12, z, 19.9, .24, .05);
  // A modest perimeter cove emphasizes the generous rectangular ceiling, without an opening to the sky.
  for (const x of [-9.65, 9.65]) {
    place(oak, box, x, h - .3, 0, .7, .15, 18);
    place(strip, box, x - Math.sign(x) * .31, h - .25, 0, .055, .03, 17.8);
  }
  for (const z of [-8.65, 8.65]) {
    place(oak, box, 0, h - .3, z, 18.6, .15, .7);
    place(strip, box, 0, h - .25, z - Math.sign(z) * .31, 18.6, .03, .055);
  }

  softBox(rug, 0, .024, .1, 12.9, .04, 7.5, .018);
  for (const side of [-1, 1]) {
    const x = side * 5.4;
    softBox(walnut, x, .14, 0, 1.91, .24, 5.8, .1);
    softBox(ivory, side * 6.13, .76, 0, .42, 1.24, 5.88, .19);
    for (const z of [-2.78, 2.78]) softBox(ivory, x, .55, z, 1.95, .68, .38, .18);
    for (const z of [-1.8, 0, 1.8]) softBox(ivory, side * 5.3, .4, z, 1.52, .24, 1.73, .115);
    for (const z of [-1.8, 1.8]) place(z * side > 0 ? sage : ivory, pillow, side * 5.92, .94, z, .76, .27, .66, 0, 0, side * Math.PI / 2);
    place(shadow, plane, x, .046, 0, 3.2, 7.1, 1, -Math.PI / 2);
  }
  // Every authoritative seat lands at the centre of an individual soft cushion.
  root.userData.seatLocal = BUNKER_SOFA_LOCAL;
  for (const x of [-.82, .82]) place(walnut, cylinder, x, .24, .25, .32, .48, .32);
  softBox(floor, 0, .53, .25, 3.3, .1, 2.2, .049);
  place(shadow, plane, 0, .046, .25, 4.7, 3.3, 1, -Math.PI / 2);
  for (let i = 0; i < 3; i++) softBox(i === 1 ? sage : ivory, -.65, .605 + i * .055, .35, .69 - i * .05, .045, .48, .018, .12);
  for (const x of [.55, .92]) {
    place(ceramic, cylinder, x, .593, -.23, .13, .015, .13); place(ceramic, cup, x, .605, -.23);
  }
  place(ceramic, vase, .2, .58, .8, .65, .65, .65);
  place(foliage, cylinder, .2, 1.02, .8, .008, .5, .008);
  for (let i = 0; i < 4; i++) place(foliage, leaf, .2, .93 + i * .055, .8, .42, .4, .45, .5, i * 2.4, .6);

  // A walnut library wall: airy shelves, muted cloth spines and quiet ceramic pieces.
  place(oak, box, 0, 1.97, 8.58, 13.2, 3.9, .12);
  softBox(walnut, 0, .18, 8.2, 13.2, .36, .9, .08);
  for (const y of [.4, 1.22, 2.04, 2.86, 3.74]) place(oak, box, 0, y, 8.2, 13.2, .09, .9);
  for (let column = 0; column <= 6; column++) place(oak, box, -6.55 + column * 13.1 / 6, 2.02, 8.2, .09, 3.5, .9);
  const palette = [0xb3b59d, 0xc4ad91, 0xa88670, 0x8a9694, 0xd3cbb9, 0x7c7569];
  for (let column = 0; column < 6; column++) for (let row = 0; row < 4; row++) {
    const start = -6.32 + column * 13.1 / 6, shelfY = .445 + row * .82;
    for (let book = 0; book < 7; book++) {
      if ((column + row) % 4 === 0 && book > 3) continue;
      const width = .12 + ((column + book * 3 + row) % 4) * .025, height = .38 + ((book * 3 + row * 2 + column) % 5) * .055;
      const x = start + book * .215;
      place(books, box, x, shelfY + height / 2, 8.13, width, height, .44, 0, 0, book === 6 ? .08 : 0, palette[(column + row + book) % palette.length]);
      for (const offset of [.09, height - .08]) place(books, box, x, shelfY + offset, 7.903, width * .78, .012, .008, 0, 0, 0, 0xe8dfcc);
    }
    if ((column + row) % 4 === 0) place(ceramic, vase, start + 1.42, shelfY, 8.11, .7, .72, .7);
  }
  softBox(walnut, 0, 4.82, 8.93, 4.7, 1.28, .08, .035);
  softBox(ivory, 0, 4.82, 8.874, 4.5, 1.08, .035, .015);
  for (let i = 0; i < 5; i++) place(books, sphere, -.94 + i * .47, 4.8 + Math.sin(i) * .16, 8.84, .31, .3 + i % 2 * .08, .018, 0, 0, i * .17, palette[(i + 1) % palette.length]);

  // Sculptural planting stays beside the shelves, leaving a broad central route from the ladder.
  for (const x of [-8.1, 8.1]) {
    place(ceramic, pot, x, 0, 6.5);
    place(walnut, cylinder, x, .655, 6.5, .49, .035, .49);
    place(shadow, plane, x, .009, 6.5, 2, 2, 1, -Math.PI / 2);
    for (let branch = 0; branch < 9; branch++) {
      const angle = branch * 2.399, dx = Math.sin(angle) * .32, dz = Math.cos(angle) * .32, height = 1.05 + branch % 3 * .29;
      place(foliage, cylinder, x + dx * .6, .68 + height * .34, 6.5 + dz * .6, .013, height * .7, .013, Math.cos(angle) * .22, 0, -Math.sin(angle) * .22);
      place(foliage, leaf, x + dx, .82 + height * .35, 6.5 + dz, .85, height, 1, .55, angle, .16);
    }
  }
  for (const [x, z] of [[-5.3, -3.85], [5.3, 3.85]]) {
    place(walnut, cylinder, x, .28, z, .22, .56, .22);
    place(oak, cylinder, x, .6, z, .51, .09, .51);
    place(brass, cylinder, x, .91, z, .035, .54, .035);
    place(paper, shade, x, 1.21, z, .45, .6, .45);
  }
  for (const x of [-9.93, 9.93]) for (const z of [-3.7, 3.7]) {
    softBox(brass, x, 2.8, z, .08, .7, .25, .035);
    place(paper, sphere, x - Math.sign(x) * .17, 2.8, z, .16, .25, .16);
  }
  for (const z of [-2.6, 2.6]) {
    place(brass, cylinder, 0, 5.37, z, .018, 1.25, .018);
    place(paper, shade, 0, 4.59, z, 1, .9, 1);
    place(strip, cylinder, 0, 4.37, z, .45, .02, .45);
  }

  // Steep timber ladder ends at an opaque wooden hatch below the intact ceiling.
  const ladderZ = BUNKER_LADDER_LOCAL.z;
  for (const x of [-.52, .52]) place(walnut, cylinder, x, 2.94, ladderZ, .045, 5.55, .045, -.09);
  for (let rung = 0; rung < 15; rung++) {
    const y = .35 + rung * .36, z = ladderZ - (y - 2.94) * .09;
    place(oak, cylinder, 0, y, z, .045, 1.12, .045, 0, 0, Math.PI / 2);
  }
  softBox(oak, 0, h - .032, ladderZ - .25, 1.55, .045, 1.5, .02);
  place(brass, torus, 0, h - .067, ladderZ - .25, 1, 1, 1, Math.PI / 2);
  place(paper, sphere, 0, 2.8, -8.93, .17, .26, .1);

  const shared: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];
  for (const [material, pieces] of batches) {
    const nonIndexed = pieces.map(piece => piece.index ? piece.toNonIndexed() : piece);
    const geometry = mergeGeometries(nonIndexed, false)!;
    geometry.name = `${material.name}-geometry`; geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    for (const piece of new Set([...pieces, ...nonIndexed])) piece.dispose();
    geometries.add(geometry); shared.push({ geometry, material });
  }
  for (const geometry of new Set([...sources, ...rounded.values()])) geometry.dispose();

  const hatchWood = new RoundedBoxGeometry(1.3, .016, 1.4, 2, .007);
  const hatchFrame = new RoundedBoxGeometry(1.36, .006, 1.46, 1, .002);
  const handle = new THREE.TorusGeometry(.09, .014, 5, 16); handle.rotateX(-Math.PI / 2);
  geometries.add(hatchWood); geometries.add(hatchFrame); geometries.add(handle);
  for (const bunker of UYUNI_BUNKERS) {
    const entry = new THREE.Group(); entry.name = `uyuni-bunker-hatch-${bunker.id}`; entry.position.set(bunker.entry.x, bunker.entry.y, bunker.entry.z); root.add(entry);
    for (const [name, geometry, material, y] of [
      ["frame", hatchFrame, walnut, .004], ["wood", hatchWood, oak, .009], ["handle", handle, brass, .033],
    ] as const) {
      const mesh = new THREE.Mesh(geometry, material); mesh.name = `uyuni-bunker-hatch-${name}-${bunker.id}`; mesh.position.y = y; mesh.layers.enable(2); entry.add(mesh);
    }
    const room = new THREE.Group(); room.name = `uyuni-bunker-room-${bunker.id}`; room.position.set(bunker.x, bunker.floorY, bunker.z); room.visible = false;
    root.add(room); rooms.set(bunker.id, room);
    for (const batch of shared) {
      const mesh = new THREE.Mesh(batch.geometry, batch.material); mesh.name = `${batch.material.name}-${bunker.id}`;
      if (batch.material === shadow) mesh.renderOrder = 1;
      room.add(mesh);
    }
    const ambient = new THREE.AmbientLight(0xffead0, .85); ambient.name = `uyuni-bunker-ambient-${bunker.id}`; room.add(ambient);
    for (const [index, x] of [-3.8, 3.8].entries()) {
      const light = new THREE.PointLight(0xffdfb4, 95, 23, 2); light.name = `uyuni-bunker-light-${bunker.id}-${index}`;
      light.position.set(x, 4.15, index ? 2.6 : -2.6); light.castShadow = false; room.add(light);
    }
  }
  let disposed = false;
  return {
    root,
    setActive(id) {
      if (disposed) return;
      for (const [roomId, room] of rooms) room.visible = roomId === id;
    },
    dispose() {
      if (disposed) return;
      disposed = true; root.removeFromParent(); root.clear(); rooms.clear();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      stoneTexture.dispose(); shadowTexture.dispose();
    },
  };
}
