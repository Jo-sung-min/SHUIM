import * as THREE from "three";

/** Unit, centred cloth volumes: instance scale supplies width/thickness/depth in metres. */
function clothVolume(kind: "duvet" | "pillow"): THREE.BufferGeometry {
  const nx = kind === "duvet" ? 24 : 20, nz = kind === "duvet" ? 18 : 14;
  const stride = nx + 1, faceVertices = stride * (nz + 1);
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [];
  const smooth = (a: number, b: number, value: number) => {
    const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const section = (u: number, v: number) => {
    const corner = kind === "duvet" ? 0.055 : 0.16;
    const x = u * 0.5 * (1 - corner * Math.pow(Math.abs(v), 8));
    const z = v * 0.5 * (1 - corner * Math.pow(Math.abs(u), 8));
    if (kind === "pillow") {
      const crown = Math.pow(Math.max(0, (1 - Math.pow(Math.abs(u), 2.8)) * (1 - Math.pow(Math.abs(v), 2.8))), 0.7);
      // Small gathered creases stay at the edges, away from the soft central loft.
      const crease = Math.abs(Math.sin(u * 12 + v * 2) * Math.sin(v * 9 - u)) * crown * (1 - crown) * 0.055;
      return { x, z, top: 0.055 + crown * 0.445 - crease, bottom: -0.055 - crown * 0.445 + crease * 0.5, shade: 0.98 + crown * 0.02 };
    }
    const edge = Math.pow(Math.max(Math.abs(u), Math.abs(v)), 8);
    const folds = (0.5 + 0.5 * Math.sin(v * 12 + u * 2.6)) * smooth(0.35, 0.95, Math.abs(u)) * 0.055;
    const foldLine = Math.exp(-Math.pow((v - 0.82) / 0.11, 2)) * 0.025;
    // A high central panel keeps the existing lying body safely under the quilt.
    return { x, z, top: 0.5 - edge * 0.35 - folds - foldLine, bottom: -0.5 + edge * 0.35, shade: 1 - edge * 0.025 - folds * 0.1 };
  };
  const add = (x: number, y: number, z: number, u: number, v: number, shade: number) => {
    positions.push(x, y, z); uvs.push(u, v); colors.push(shade, shade, shade);
    return positions.length / 3 - 1;
  };
  const tileX = kind === "duvet" ? 7.8 : 4.5, tileZ = kind === "duvet" ? 6 : 2.25;
  for (let face = 0; face < 2; face++) {
    for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
      const u = ix / nx * 2 - 1, v = iz / nz * 2 - 1, p = section(u, v);
      // The perimeter's thin welt extends the final 0.5% beyond either cloth face.
      add(p.x * 0.995, face ? p.bottom : p.top, p.z * 0.995,
        ix / nx * tileX, iz / nz * tileZ, face ? p.shade * 0.97 : p.shade);
    }
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const a = face * faceVertices + iz * stride + ix, b = a + 1, c = a + stride, d = c + 1;
      if (face) indices.push(a, b, c, b, d, c);
      else indices.push(a, c, b, b, c, d);
    }
  }
  const edge: { ix: number; iz: number }[] = [];
  for (let ix = 0; ix < nx; ix++) edge.push({ ix, iz: 0 });
  for (let iz = 0; iz < nz; iz++) edge.push({ ix: nx, iz });
  for (let ix = nx; ix > 0; ix--) edge.push({ ix, iz: nz });
  for (let iz = nz; iz > 0; iz--) edge.push({ ix: 0, iz });
  const welt = edge.map(({ ix, iz }) => {
    const p = section(ix / nx * 2 - 1, iz / nz * 2 - 1);
    return add(p.x, (p.top + p.bottom) * 0.5, p.z, ix / nx * tileX, iz / nz * tileZ, 0.965);
  });
  for (let i = 0; i < edge.length; i++) {
    const next = (i + 1) % edge.length;
    const a = edge[i].iz * stride + edge[i].ix, b = edge[next].iz * stride + edge[next].ix;
    const c = welt[next], d = welt[i];
    indices.push(a, b, c, a, c, d, d, c, b + faceVertices, d, b + faceVertices, a + faceVertices);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = `shelter-soft-${kind}`;
  return geometry;
}

/** At centre y=.97 and thickness .20, the highest quilt point remains exactly y=1.07. */
export function createShelterDuvetGeometry(): THREE.BufferGeometry { return clothVolume("duvet"); }

/** Pinched sewn edges and a gently rounded filling, with the same unit bounds as the quilt. */
export function createShelterPillowGeometry(): THREE.BufferGeometry { return clothVolume("pillow"); }

/** Reuse the existing cotton image; no additional texture downloads or instance attributes. */
export function createShelterTextileMaterial(map: THREE.Texture | null = null): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff, map, bumpMap: map, bumpScale: 0.0015,
    roughness: 0.98, metalness: 0, vertexColors: true,
  });
}
