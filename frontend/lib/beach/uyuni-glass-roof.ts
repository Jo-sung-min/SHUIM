import * as THREE from "three";
import { BUNKER_GLASS_ROOF_Y, BUNKER_HALL } from "./uyuni-bunker-layout";

const VERTEX = `
varying vec2 vPane;
void main() {
  vPane = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAME_FRAGMENT = `
varying vec2 vPane;
void main() {
  float distanceToFrame = abs(vPane.y);
  float core = 1.0 - smoothstep(0.008, 0.025, distanceToFrame);
  float halo = exp(-distanceToFrame * distanceToFrame / 0.004);
  float light = core * 0.64 + halo * 0.2;
  if (light < 0.004) discard;
  gl_FragColor = vec4(mix(vec3(1.0, 0.6, 0.3), vec3(1.0, 0.87, 0.64), core) * light, 1.0);
}`;

export const UYUNI_GLASS_HATCH = { minX: -.84, maxX: .84, minZ: -7.45, maxZ: -5.95 } as const;
/** Large rectangular panes and a clear ladder opening, without radial spokes or a central ring. */
export const UYUNI_GLASS_FRAME_LINES = (() => {
  const H = BUNKER_HALL, hole = UYUNI_GLASS_HATCH;
  const lines: { ax: number; az: number; bx: number; bz: number }[] = [];
  for (const x of [-7.5, 7.5]) {
    const span = H.b * Math.sqrt(1 - (x / H.a) ** 2);
    lines.push({ ax: x, az: H.cz - span, bx: x, bz: H.cz + span });
  }
  lines.push({ ax: 0, az: H.cz - H.b, bx: 0, bz: hole.minZ }, { ax: 0, az: hole.maxZ, bx: 0, bz: H.cz + H.b });
  for (const dz of [-6, 6]) {
    const span = H.a * Math.sqrt(1 - (dz / H.b) ** 2);
    lines.push({ ax: -span, az: H.cz + dz, bx: span, bz: H.cz + dz });
  }
  lines.push({ ax: hole.minX, az: hole.minZ, bx: hole.maxX, bz: hole.minZ },
    { ax: hole.maxX, az: hole.minZ, bx: hole.maxX, bz: hole.maxZ },
    { ax: hole.maxX, az: hole.maxZ, bx: hole.minX, bz: hole.maxZ },
    { ax: hole.minX, az: hole.maxZ, bx: hole.minX, bz: hole.minZ });
  return lines;
})();

/** Clear, static glazing and warm frames shared between both rooms. */
export function createUyuniGlassRoof(mobile = false) {
  const H = BUNKER_HALL, segments = mobile ? 48 : 64, roofY = BUNKER_GLASS_ROOF_Y;
  const shape = new THREE.Shape(); shape.absellipse(0, H.cz, H.a, H.b, 0, Math.PI * 2, false, 0);
  const hole = UYUNI_GLASS_HATCH, opening = new THREE.Path();
  opening.moveTo(hole.minX, hole.minZ); opening.lineTo(hole.minX, hole.maxZ);
  opening.lineTo(hole.maxX, hole.maxZ); opening.lineTo(hole.maxX, hole.minZ); opening.closePath(); shape.holes.push(opening);
  const geometry = new THREE.ShapeGeometry(shape, segments), position = geometry.getAttribute("position"), uv = geometry.getAttribute("uv");
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getY(i);
    position.setXYZ(i, x, roofY, z); uv.setXY(i, x, z);
  }
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); geometry.name = "uyuni-flat-glass-roof";
  const framePosition: number[] = [], frameUv: number[] = [], frameIndex: number[] = [];
  const strip = (ax: number, az: number, bx: number, bz: number) => {
    const start = framePosition.length / 3, length = Math.hypot(bx - ax, bz - az), sx = -(bz - az) / length, sz = (bx - ax) / length, width = .2;
    for (const p of [[ax,az],[bx,bz]]) for (const side of [-1,1]) {
      framePosition.push(p[0] + sx * width * side, roofY - .11, p[1] + sz * width * side); frameUv.push(0, width * side);
    }
    frameIndex.push(start,start+1,start+3,start,start+3,start+2);
  };
  for (const line of UYUNI_GLASS_FRAME_LINES) strip(line.ax,line.az,line.bx,line.bz);
  for (let i = 0; i < segments; i++) {
    const a = i / segments * Math.PI * 2, b = (i + 1) / segments * Math.PI * 2;
    strip(H.a * Math.sin(a),H.cz + H.b * Math.cos(a),H.a * Math.sin(b),H.cz + H.b * Math.cos(b));
  }
  const frameGeometry = new THREE.BufferGeometry(); frameGeometry.name = "uyuni-flat-window-frame-strips";
  frameGeometry.setAttribute("position",new THREE.Float32BufferAttribute(framePosition,3)); frameGeometry.setAttribute("uv",new THREE.Float32BufferAttribute(frameUv,2));
  frameGeometry.setIndex(frameIndex); frameGeometry.computeVertexNormals(); frameGeometry.computeBoundingBox(); frameGeometry.computeBoundingSphere();
  const glass = new THREE.MeshBasicMaterial({ color: 0xf5faff, opacity: .025,
    transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, fog: false });
  glass.name = "uyuni-clear-roof-glass"; glass.forceSinglePass = true;
  const glow = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAME_FRAGMENT,
    transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
  glow.name = "uyuni-warm-roof-frame"; glow.forceSinglePass = true;
  let disposed = false;
  return {
    create(id: string): THREE.Group {
      const group = new THREE.Group(); group.name = `uyuni-bunker-glass-roof-${id}`;
      const panes = new THREE.Mesh(geometry, glass); panes.name = `uyuni-bunker-roof-glass-${id}`; panes.renderOrder = 1;
      const strips = new THREE.Mesh(frameGeometry, glow); strips.name = `uyuni-bunker-roof-frame-glow-${id}`; strips.renderOrder = 2;
      group.add(panes, strips); return group;
    },
    dispose() { if (disposed) return; disposed = true; geometry.dispose(); frameGeometry.dispose(); glass.dispose(); glow.dispose(); },
  };
}
