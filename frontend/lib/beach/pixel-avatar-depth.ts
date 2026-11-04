import * as THREE from "three";
import { CHAR_ANIM, CHAR_ATLAS, CHAR_VIEW } from "./atlas";

export const PIXEL_AVATAR_DEPTH = 0.075;
const FRONT_LIFT = 0.03; // The bottom rests on the mat instead of burying the added thickness.
interface PixelFrame { width: number; height: number; data: ArrayLike<number> }

/** A thick, lightly bevelled outline keeps the exact front artwork and its cutouts. */
export function pixelAvatarDepthGeometry(frame: PixelFrame, avatarHeight: number): THREE.BufferGeometry {
  const { width, height, data } = frame;
  const pixel = avatarHeight / height;
  const bevel = Math.min(pixel * 0.3, 0.005), shoulderZ = FRONT_LIFT - 0.01;
  const bottomZ = FRONT_LIFT - PIXEL_AVATAR_DEPTH;
  const positions: number[] = [], uv: number[] = [], colors: number[] = [], indices: number[] = [];
  const opaque = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height && data[(y * width + x) * 4 + 3] >= 26;
  const quad = (points: number[][], texture: number[][], shades: number[]) => {
    const start = positions.length / 3;
    for (let i = 0; i < 4; i++) { positions.push(...points[i]); uv.push(...texture[i]); colors.push(shades[i], shades[i], shades[i]); }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!opaque(x, y)) continue;
    const left = (x - width / 2) * pixel, right = left + pixel;
    const top = (height - y) * pixel, bottom = top - pixel;
    // Sampling the centre of the edge pixel carries its exact colour onto the side.
    const texel = [(x + 0.5) / width, 1 - (y + 0.5) / height];
    const shadeFor = (nx: number, ny: number) => ny > 0 ? 0.93 : nx < 0 ? 0.86 : 0.78;
    const edge = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number) => {
      const a = [ax + nx * bevel, ay + ny * bevel], b = [bx + nx * bevel, by + ny * bevel];
      const shade = shadeFor(nx, ny), sample = [texel, texel, texel, texel];
      quad([[ax, ay, FRONT_LIFT], [bx, by, FRONT_LIFT], [...b, shoulderZ], [...a, shoulderZ]], sample, [1, 1, shade, shade]);
      quad([[...a, shoulderZ], [...b, shoulderZ], [...b, bottomZ], [...a, bottomZ]], sample, [shade, shade, shade * 0.72, shade * 0.72]);
    };
    const leftEdge = !opaque(x - 1, y), rightEdge = !opaque(x + 1, y);
    const topEdge = !opaque(x, y - 1), bottomEdge = !opaque(x, y + 1);
    if (leftEdge) edge(left, top, left, bottom, -1, 0);
    if (rightEdge) edge(right, bottom, right, top, 1, 0);
    if (topEdge) edge(right, top, left, top, 0, 1);
    if (bottomEdge) edge(left, bottom, right, bottom, 0, -1);
    const corner = (cx: number, cy: number, nx: number, ny: number) => {
      const a = [cx + nx * bevel, cy], b = [cx, cy + ny * bevel];
      const shade = (shadeFor(nx, 0) + shadeFor(0, ny)) / 2, sample = [texel, texel, texel, texel];
      quad([[cx, cy, FRONT_LIFT], [...a, shoulderZ], [...b, shoulderZ], [cx, cy, FRONT_LIFT]], sample, [1, shade, shade, 1]);
      quad([[...a, shoulderZ], [...b, shoulderZ], [...b, bottomZ], [...a, bottomZ]], sample, [shade, shade, shade * 0.72, shade * 0.72]);
    };
    if (leftEdge && topEdge) corner(left, top, -1, 1);
    if (leftEdge && bottomEdge) corner(left, bottom, -1, -1);
    if (rightEdge && topEdge) corner(right, top, 1, 1);
    if (rightEdge && bottomEdge) corner(right, bottom, 1, -1);
  }
  // The existing sprite is the front; this alpha-tested quad closes the underside.
  const halfWidth = width * pixel / 2;
  quad([[-halfWidth, 0, bottomZ], [halfWidth, 0, bottomZ], [halfWidth, avatarHeight, bottomZ], [-halfWidth, avatarHeight, bottomZ]],
    [[0, 0], [1, 0], [1, 1], [0, 1]], [0.6, 0.6, 0.6, 0.6]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

type PixelSprite = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

/** A room shares two tiny silhouette meshes; each actor keeps its own tinted atlas material. */
export class PixelAvatarDepth {
  private geometries = new Map<number, THREE.BufferGeometry>();
  private actors = new Map<PixelSprite, { row: number; mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> }>();
  private disposed = false;

  constructor(atlas: THREE.Texture, avatarHeight: number) {
    if (typeof document === "undefined" || !atlas.image) return;
    const canvas = document.createElement("canvas");
    canvas.width = CHAR_ATLAS.cellW; canvas.height = CHAR_ATLAS.cellH;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    try {
      for (let row = 0; row < CHAR_ATLAS.rows; row++) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(atlas.image as CanvasImageSource,
          (CHAR_VIEW.front + CHAR_ANIM.idle.from) * CHAR_ATLAS.cellW, row * CHAR_ATLAS.cellH,
          CHAR_ATLAS.cellW, CHAR_ATLAS.cellH, 0, 0, canvas.width, canvas.height);
        const frame = context.getImageData(0, 0, canvas.width, canvas.height);
        this.geometries.set(row, pixelAvatarDepthGeometry(frame, avatarHeight));
      }
    } catch {
      // Texture readback is optional; the normal sprite still renders if a browser blocks it.
      for (const geometry of this.geometries.values()) geometry.dispose();
      this.geometries.clear();
    }
  }

  update(sprite: PixelSprite, skin: number, lying: boolean) {
    if (this.disposed) return;
    let actor = this.actors.get(sprite);
    if (!lying) { if (actor) actor.mesh.visible = false; this.liftFront(sprite, 0); return; }
    const row = ((Math.trunc(skin) % CHAR_ATLAS.rows) + CHAR_ATLAS.rows) % CHAR_ATLAS.rows;
    const geometry = this.geometries.get(row);
    if (!geometry) return;
    if (actor && actor.row !== row) { this.remove(sprite); actor = undefined; }
    if (!actor) {
      const material = sprite.material.clone();
      material.vertexColors = true;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = "lying-pixel-depth";
      mesh.renderOrder = sprite.renderOrder;
      sprite.add(mesh);
      actor = { row, mesh };
      this.actors.set(sprite, actor);
    }
    actor.mesh.material.color.copy(sprite.material.color);
    this.liftFront(sprite, FRONT_LIFT);
    actor.mesh.visible = true;
  }

  private liftFront(sprite: PixelSprite, lift: number) {
    const position = sprite.geometry.getAttribute("position");
    if (!position || Math.abs(position.getZ(0) - lift) < 1e-7) return;
    for (let i = 0; i < position.count; i++) position.setZ(i, lift);
    position.needsUpdate = true;
    sprite.geometry.computeBoundingBox();
    sprite.geometry.computeBoundingSphere();
  }

  remove(sprite: PixelSprite) {
    const actor = this.actors.get(sprite);
    actor?.mesh.removeFromParent();
    actor?.mesh.material.dispose();
    this.liftFront(sprite, 0);
    this.actors.delete(sprite);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const sprite of [...this.actors.keys()]) this.remove(sprite);
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.geometries.clear();
  }
}
