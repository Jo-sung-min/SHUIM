import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Daylight } from "./daylight";
import { UYUNI_HOTELS } from "./uyuni-hotel-layout";
import { createShelterDuvetGeometry, createShelterPillowGeometry, createShelterTextileMaterial } from "./shelter-textiles";

type Placement = { x: number; y: number; z: number; sx: number; sy: number; sz: number; rx?: number; ry?: number; color?: number };
type Batch = { geometry: THREE.BufferGeometry; material: THREE.Material; placements: Placement[] };

function roundedOutline(width: number, depth: number, radius: number) {
  const shape = new THREE.Shape(), x = -width / 2, z = -depth / 2;
  shape.moveTo(x + radius, z);
  shape.lineTo(x + width - radius, z); shape.quadraticCurveTo(x + width, z, x + width, z + radius);
  shape.lineTo(x + width, z + depth - radius); shape.quadraticCurveTo(x + width, z + depth, x + width - radius, z + depth);
  shape.lineTo(x + radius, z + depth); shape.quadraticCurveTo(x, z + depth, x, z + depth - radius);
  shape.lineTo(x, z + radius); shape.quadraticCurveTo(x, z, x + radius, z);
  return shape;
}

/** Both faces and four rims form a closed shell; inner normals face the open room. */
function cocoonRoof() {
  const nx = 32, nz = 12, stride = nx + 1, face = stride * (nz + 1);
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let shell = 0; shell < 2; shell++) {
    const thickness = shell ? 0.13 : 0;
    for (let iz = 0; iz <= nz; iz++) {
      const t = iz / nz, height = 4.55 + 0.25 * Math.sin(Math.PI * t) + thickness;
      for (let ix = 0; ix <= nx; ix++) {
        const angle = -Math.PI / 2 + ix / nx * Math.PI;
        positions.push(Math.sin(angle) * (4.8 + thickness), Math.cos(angle) * height, -4.9 + t * 9.8);
        uv.push(ix / nx * 8.4, t * 5.45);
      }
    }
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const a = shell * face + iz * stride + ix, b = a + 1, c = a + stride, d = c + 1;
      if (shell) indices.push(a, c, b, b, c, d);
      else indices.push(a, b, c, b, d, c);
    }
  }
  // Separate rim vertices retain sharp thickness edges and smooth curved surfaces.
  const rim = (a: number, b: number, reverse: boolean) => {
    const first = positions.length / 3;
    for (const source of [a, b, b + face, a + face]) {
      positions.push(...positions.slice(source * 3, source * 3 + 3));
      uv.push(uv[source * 2], uv[source * 2 + 1]);
    }
    if (reverse) indices.push(first, first + 2, first + 1, first, first + 3, first + 2);
    else indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  };
  for (let i = 0; i < nx; i++) { rim(i, i + 1, false); rim(nz * stride + i, nz * stride + i + 1, true); }
  for (let i = 0; i < nz; i++) { rim(i * stride, (i + 1) * stride, true); rim(i * stride + nx, (i + 1) * stride + nx, false); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox();
  geometry.name = "uyuni-cocoon-shell";
  return geometry;
}

function gatheredCurtain() {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  const nx = 12, ny = 16;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const u = i / nx, v = j / ny;
    const gather = 0.4 + 0.6 * Math.pow(Math.abs(v - 0.48) * 2, 0.8);
    const x = 4.02 + (u - 0.5) * 0.7 * gather;
    const top = 4.55 * Math.sqrt(1 - (x / 4.8) ** 2) - 0.09;
    positions.push(x, 0.05 + v * (top - 0.05), Math.sin(u * Math.PI * 10) * 0.065 * (0.5 + gather) + Math.sin(v * Math.PI) * 0.1);
    uv.push(u * 2.2, v * 5);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

/** Curved chaise cushion: low at the feet, gently elevated behind the shoulders. */
function chaiseGeometry() {
  const geometry = new RoundedBoxGeometry(1, 1, 1, 1, 0.12);
  const p = geometry.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i), lift = Math.max(0, z + 0.06);
    p.setY(i, p.getY(i) * 0.17 + lift * lift * 1.7);
  }
  geometry.computeVertexNormals(); geometry.computeBoundingBox();
  return geometry;
}

/** Loft covers the resting body while the thin perimeter settles onto the mattress. */
function hotelDuvetGeometry() {
  const geometry = createShelterDuvetGeometry(), p = geometry.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const edge = Math.pow(Math.max(Math.abs(p.getX(i)), Math.abs(p.getZ(i))) * 2, 8);
    const y = p.getY(i), drop = y > 0.01 ? 0.6 : y < -0.01 ? 0.35 : 0.475;
    p.setY(i, y - drop * edge);
  }
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Textures are injected once by the engine; all owned meshes/materials remain in the scene. */
export function buildUyuniHotels(scene: THREE.Scene, textures: { wood: THREE.Texture; cotton: THREE.Texture }): { root: THREE.Group; applyDaylight(d: Daylight): void; dispose(): void } {
  const root = new THREE.Group(); root.name = "uyuni-hotels"; scene.add(root);
  let disposed = false;
  const wood = new THREE.MeshStandardMaterial({ map: textures.wood, color: 0xd9c3a4, roughness: 0.88 });
  const paleWood = new THREE.MeshStandardMaterial({ map: textures.wood, color: 0xe8d8bd, roughness: 0.9 });
  const roofMaterial = new THREE.MeshStandardMaterial({ map: textures.cotton, bumpMap: textures.cotton, bumpScale: 0.025, color: 0xe4c99c, roughness: 1 });
  const textile = createShelterTextileMaterial(textures.cotton);
  const upholstery = new THREE.MeshStandardMaterial({ map: textures.cotton, color: 0xe8e1d1, bumpMap: textures.cotton, bumpScale: 0.002, roughness: 0.98 });
  const curtainMaterial = upholstery.clone(); curtainMaterial.side = THREE.DoubleSide; curtainMaterial.color.setHex(0xfff3da);
  const woven = new THREE.MeshStandardMaterial({ map: textures.cotton, color: 0xbfa98d, roughness: 1 });
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xd6c6ae, roughness: 0.85 });
  const foliage = new THREE.MeshStandardMaterial({ color: 0x76896f, roughness: 0.95 });
  const lamps = new THREE.MeshStandardMaterial({ color: 0xffedc8, map: textures.cotton, roughness: 0.9, emissive: 0xffc57b, emissiveIntensity: 0.25 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffd390, transparent: true, opacity: 0.12, depthWrite: false });
  const box = new RoundedBoxGeometry(1, 1, 1, 1, 0.13);
  const railBox = new THREE.BoxGeometry(1, 1, 1);
  const sphere = new THREE.SphereGeometry(1, 12, 8);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 20, 1);
  const rug = new THREE.CylinderGeometry(1, 1, 1, 32, 1);
  const cone = new THREE.CylinderGeometry(0.56, 1, 1, 18, 1);
  const duvet = hotelDuvetGeometry(), pillow = createShelterPillowGeometry(), chaise = chaiseGeometry();
  const batches = new Map<string, Batch>();
  const add = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, placement: Placement) => {
    if (!batches.has(name)) batches.set(name, { geometry, material, placements: [] });
    batches.get(name)!.placements.push(placement);
  };
  const roof = cocoonRoof();
  const deck = new THREE.ExtrudeGeometry(roundedOutline(11.6, 13.4, 0.62), { depth: 0.2, bevelEnabled: false, curveSegments: 8 });
  deck.rotateX(-Math.PI / 2);
  const deckUV = deck.getAttribute("uv"), deckP = deck.getAttribute("position");
  for (let i = 0; i < deckUV.count; i++) deckUV.setXY(i, deckP.getZ(i) / 1.8, deckP.getX(i) / 1.8);
  const backShape = new THREE.Shape(); backShape.moveTo(-4.8, 0);
  for (let i = 1; i <= 40; i++) { const a = -Math.PI / 2 + i / 40 * Math.PI; backShape.lineTo(Math.sin(a) * 4.8, Math.cos(a) * 4.55); }
  backShape.closePath();
  const back = new THREE.ExtrudeGeometry(backShape, { depth: 0.14, bevelEnabled: false });
  const backUV = back.getAttribute("uv"); for (let i = 0; i < backUV.count; i++) backUV.setXY(i, backUV.getX(i) / 1.8, backUV.getY(i) / 1.8);
  const curtain = gatheredCurtain();
  const ribPoints = Array.from({ length: 33 }, (_, i) => { const a = -Math.PI / 2 + i / 32 * Math.PI; return new THREE.Vector3(Math.sin(a) * 4.76, Math.cos(a) * 4.51, 0); });
  const rib = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ribPoints), 32, 0.045, 5, false);
  const ramp = new THREE.BufferGeometry();
  ramp.setAttribute("position", new THREE.Float32BufferAttribute([-1.3, 0, -11.5, 1.3, 0, -11.5, -1.3, 0.48, -8.5, 1.3, 0.48, -8.5], 3));
  ramp.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1.44, 0, 0, 1.67, 1.44, 1.67], 2));
  ramp.setIndex([0, 2, 1, 1, 2, 3]); ramp.computeVertexNormals();

  for (const hotel of UYUNI_HOTELS) {
    const group = new THREE.Group(); group.name = `uyuni-hotel-${hotel.id}`; group.position.set(hotel.x, 0, hotel.z); root.add(group);
    const mesh = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      const object = new THREE.Mesh(geometry, material); object.name = name; object.position.set(x, y, z); group.add(object); return object;
    };
    mesh(`uyuni-hotel-deck-${hotel.id}`, deck, wood, 0, hotel.floorY - 0.2, -1.8);
    mesh(`uyuni-hotel-roof-${hotel.id}`, roof, roofMaterial, 0, hotel.floorY, 0);
    mesh(`uyuni-hotel-back-${hotel.id}`, back, paleWood, 0, hotel.floorY, 4.76);
    mesh(`uyuni-hotel-ramp-${hotel.id}`, ramp, wood, 0, 0, 0);
    const part = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, color?: number) =>
      add(name, geometry, material, { x: hotel.x + x, y, z: hotel.z + z, sx, sy, sz, rx, ry, color });
    for (let i = 0; i < 7; i++) {
      const z = -4.87 + i * 9.7 / 6, t = (z + 4.9) / 9.8;
      part("uyuni-hotel-arch-ribs", rib, paleWood, 0, hotel.floorY, z, 1, (4.55 + 0.25 * Math.sin(Math.PI * t)) / 4.55, 1);
    }
    // Short pilings retain an overwater silhouette without obscuring the mirror horizon.
    for (const x of [-4.6, 4.6]) for (const z of [-7.3, -1.4, 3.8]) part("uyuni-hotel-pilings", cylinder, wood, x, 0.12, z, 0.12, 0.44, 0.12);
    for (const side of [-1, 1]) {
      part("uyuni-hotel-side-rails", railBox, wood, side * 5.7, 1.12, -1.8, 0.07, 0.07, 13.4);
      for (const z of [-7.9, -3.8, 0.4, 4.3]) part("uyuni-hotel-rail-posts", railBox, wood, side * 5.7, 0.8, z, 0.07, 0.64, 0.07);
      // Rotate the opposite curtain around Y, preserving outward geometry normals.
      part("uyuni-hotel-curtains", curtain, curtainMaterial, 0, hotel.floorY, -4.72, 1, 1, 1, 0, side < 0 ? Math.PI : 0);
      part("uyuni-hotel-curtain-ties", sphere, woven, side * 4.02, 1.68, -4.65, 0.13, 0.07, 0.13);
      const bx = side * 1.5;
      part("uyuni-hotel-bed-bases", box, paleWood, bx, 0.6, 2.45, 2.1, 0.24, 2.7);
      part("uyuni-hotel-mattresses", box, upholstery, bx, 0.89, 2.45, 2.04, 0.34, 2.6);
      part("uyuni-hotel-headboards", box, upholstery, bx, 1.26, 3.75, 2.1, 0.92, 0.2);
      part("uyuni-hotel-duvets", duvet, textile, bx, 1.22, 2.02, 2.02, 0.34, 1.72);
      part("uyuni-hotel-pillows", pillow, textile, bx, 1.16, 3.29, 1.3, 0.25, 0.62, -0.12);
      part("uyuni-hotel-bedside-tables", cylinder, paleWood, side * 3.18, 0.77, 2.95, 0.37, 0.58, 0.37);
      part("uyuni-hotel-lamp-stems", cylinder, paleWood, side * 3.18, 1.19, 2.95, 0.055, 0.3, 0.055);
      part("uyuni-hotel-lamps", cone, lamps, side * 3.18, 1.48, 2.95, 0.32, 0.38, 0.32);
      part("uyuni-hotel-lamp-pools", cylinder, glow, side * 3.18, 1.065, 2.95, 0.32, 0.005, 0.32);
      part("uyuni-hotel-chaise-bases", chaise, wood, side * 3.3, 0.73, -6.6, 1.35, 1, 2.5);
      for (const z of [-7.35, -5.85]) part("uyuni-hotel-chaise-supports", box, wood, side * 3.3, 0.6, z, 1.1, 0.24, 0.13);
      part("uyuni-hotel-chaise-cushions", chaise, upholstery, side * 3.3, 0.83, -6.6, 1.25, 1, 2.4);
      part("uyuni-hotel-chaise-pillows", pillow, textile, side * 3.3, 1.2, -5.71, 0.85, 0.18, 0.42, -0.32);
    }
    part("uyuni-hotel-sofa-bases", box, paleWood, -3.3, 0.69, -1.3, 1.6, 0.42, 2.4);
    part("uyuni-hotel-sofa-seats", box, upholstery, -3.18, 0.96, -1.3, 1.25, 0.18, 2.1);
    part("uyuni-hotel-sofa-backs", box, upholstery, -3.96, 1.27, -1.3, 0.28, 1.15, 2.4);
    for (const z of [-2.38, -0.22]) part("uyuni-hotel-sofa-arms", box, upholstery, -3.3, 1.1, z, 1.6, 0.5, 0.25);
    part("uyuni-hotel-rugs", rug, woven, -0.3, 0.498, -1.7, 2.45, 0.024, 2.25);
    part("uyuni-hotel-coffee-table-bases", cylinder, paleWood, 0, 0.73, -2, 0.28, 0.5, 0.28);
    part("uyuni-hotel-coffee-table-tops", cylinder, paleWood, 0, 1.01, -2, 0.65, 0.08, 0.65);
    part("uyuni-hotel-vases", sphere, ceramic, 0.13, 1.17, -2, 0.13, 0.14, 0.13);
    // One rounded planter and a small sculptural spray, kept on the room's right edge.
    part("uyuni-hotel-planters", sphere, ceramic, 3.7, 0.83, -2.5, 0.4, 0.38, 0.4);
    for (let i = 0; i < 5; i++) {
      const angle = i / 5 * Math.PI * 2;
      part("uyuni-hotel-leaves", sphere, foliage, 3.7 + Math.sin(angle) * 0.22, 1.25 + i % 2 * 0.16, -2.5 + Math.cos(angle) * 0.22, 0.1, 0.46, 0.19, 0.4, angle);
    }
  }
  const transform = new THREE.Object3D();
  for (const [name, batch] of batches) {
    const instances = new THREE.InstancedMesh(batch.geometry, batch.material, batch.placements.length); instances.name = name;
    batch.placements.forEach((p, index) => {
      transform.position.set(p.x, p.y, p.z); transform.scale.set(p.sx, p.sy, p.sz); transform.rotation.set(p.rx ?? 0, p.ry ?? 0, 0);
      transform.updateMatrix(); instances.setMatrixAt(index, transform.matrix);
      if (p.color !== undefined) instances.setColorAt(index, new THREE.Color(p.color));
    });
    instances.instanceMatrix.needsUpdate = true; root.add(instances);
  }
  return { root, applyDaylight(d) {
    if (disposed) return;
    const night = THREE.MathUtils.clamp(d.stars, 0, 1);
    lamps.emissiveIntensity = 0.12 + night * 0.78;
    glow.opacity = 0.04 + night * 0.24;
  }, dispose() {
    if (disposed) return;
    disposed = true;
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    root.removeFromParent(); root.clear();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  } };
}
