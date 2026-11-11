import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GARDEN_PHOTO_ZONE, GARDEN_WALK_RADIUS, GROUND_Y, LAKE, insideHall, lakeSigned } from "./garden-layout";

export interface GardenFestivalSite {
  angle: number; x: number; z: number; theme: "heart" | "moon" | "flower" | "orbit";
}

/** One circle runs through the original SOROW arch and every photo platform. */
export const GARDEN_FESTIVAL_RADIUS = Math.hypot(GARDEN_PHOTO_ZONE.x - LAKE.x, GARDEN_PHOTO_ZONE.z - 1.75 - LAKE.z);

/** The lake and the walkable circle share a centre. Keep the castle and the
 * original south court as the two anchors of a continuous perimeter exhibition. */
export function gardenFestivalSites(): GardenFestivalSite[] {
  const themes = ["heart", "moon", "flower", "orbit"] as const;
  const radius = GARDEN_FESTIVAL_RADIUS;
  const sites: GardenFestivalSite[] = [];
  for (let i = 0; i < 20; i++) {
    const angle = i / 20 * Math.PI * 2;
    const x = LAKE.x + Math.cos(angle) * radius, z = LAKE.z + Math.sin(angle) * radius;
    if (insideHall(x, z, 6) || (z < LAKE.z && Math.abs(x) < GARDEN_PHOTO_ZONE.rx)) continue;
    if (lakeSigned(x, z) < 5) continue;
    sites.push({ angle, x, z, theme: themes[sites.length % themes.length] });
  }
  return sites;
}

/** An open-air light exhibition. Seven merged meshes and one light-point batch;
 * light spills are flat, translucent shapes rather than extra realtime lights. */
export function buildGardenPhotoZone(parent: THREE.Object3D, mobile: boolean) {
  const root = new THREE.Group();
  root.name = "garden-photo-zone";
  parent.add(root);
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const tubes: THREE.BufferGeometry[] = [], halos: THREE.BufferGeometry[] = [];
  const bases: THREE.BufferGeometry[] = [], frames: THREE.BufferGeometry[] = [], spills: THREE.BufferGeometry[] = [];
  const evergreens: THREE.BufferGeometry[] = [];
  const letteringPieces: THREE.BufferGeometry[] = [];
  const lightPositions: number[] = [], lightColors: number[] = [], lightSizes: number[] = [];
  const christmasTrees: { x: number; z: number; height: number }[] = [];
  const cream = 0xffe7b3, pink = 0xff94bd, lavender = 0xb8a5ff, teal = 0x8ee4d8;
  const rearZ = GARDEN_PHOTO_ZONE.z - 1.75;
  const colorize = (geometry: THREE.BufferGeometry, hex: number) => {
    const color = new THREE.Color(hex), count = geometry.getAttribute("position").count;
    const data = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) color.toArray(data, i * 3);
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(data, 3));
    return geometry;
  };
  const push = (list: THREE.BufferGeometry[], geometry: THREE.BufferGeometry, x: number, y: number, z: number) => {
    geometry.translate(x, GROUND_Y + y, z); list.push(geometry);
  };
  const tube = (points: THREE.Vector3[], hex: number, radius = 0.035, closed = false, detail?: number, withHalo = true) => {
    const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal");
    const segments = detail ?? Math.max(12, Math.min(mobile ? 72 : 100, points.length * 2));
    for (const [list, r] of (withHalo ? [[tubes, radius], [halos, radius * 3.5]] : [[tubes, radius]]) as [THREE.BufferGeometry[], number][]) {
      list.push(colorize(new THREE.TubeGeometry(curve, segments, r, detail ? (list === halos ? 3 : 4) : 5, closed), hex));
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
  const lightPoint = (x: number, y: number, z: number, hex: number, size = 1) => {
    lightPositions.push(x, GROUND_Y + y, z);
    new THREE.Color(hex).toArray(lightColors, lightColors.length); lightSizes.push(size);
  };
  const signPiece = (width: number, height: number, x: number, y: number, z: number, yaw: number, row: number) => {
    const geometry = new THREE.PlaneGeometry(width, height), uv = geometry.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setY(i, row === 0 ? 0.5 + uv.getY(i) * 0.5 : 0.5 - row * 0.125 + uv.getY(i) * 0.125);
    geometry.rotateY(yaw); geometry.translate(x, GROUND_Y + y, z); letteringPieces.push(geometry);
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
  const entranceZ = (x: number) => LAKE.z - Math.sqrt(GARDEN_FESTIVAL_RADIUS * GARDEN_FESTIVAL_RADIUS - (x - LAKE.x) * (x - LAKE.x));
  const moonZ = entranceZ(-7.55), heartZ = entranceZ(7.35);
  plinth(-7.55, moonZ, 1.55);
  const moon: number[][] = [];
  for (let i = 0; i <= 42; i++) {
    const a = 0.8 + i / 42 * (Math.PI * 2 - 1.6);
    moon.push([-7.7 + Math.cos(a) * 1.65, 2.15 + Math.sin(a) * 1.65, moonZ]);
  }
  const tipX = Math.cos(0.8) * 1.65, tipY = Math.sin(0.8) * 1.65;
  for (let i = 1; i < 25; i++) {
    const t = i / 25;
    moon.push([-7.7 + tipX - Math.sin(t * Math.PI) * 1.32, 2.15 - tipY + 2 * tipY * t, moonZ]);
  }
  line(moon, cream, 0.055, true);
  star(-6.45, 3.65, moonZ, 0.3, lavender);
  star(-6.15, 2.7, moonZ, 0.2, teal);
  star(-8.85, 4.25, moonZ, 0.23, pink);
  spill(-7.55, moonZ, 5.8, cream);

  plinth(7.35, heartZ, 1.55);
  loop(7.35, 2.22, heartZ, 1.55, pink, a => [Math.pow(Math.sin(a), 3), (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16]);
  star(9.12, 3.4, heartZ, 0.32, cream);
  star(5.75, 3.7, heartZ, 0.21, lavender);
  spill(7.35, heartZ, 5.7, pink);

  for (const [x, height, hex] of [[-10.3, 1.6, lavender], [10.35, 1.8, teal], [11.4, 1.1, pink]]) {
    const z = entranceZ(x);
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

  // Each little scene faces the lawn. A generous gap between scenes leaves room
  // for portraits, lake views and the existing path/bench approaches.
  const sites = gardenFestivalSites();
  const themeColors = { heart: pink, moon: cream, flower: teal, orbit: lavender };
  const themeRows = { heart: 1, moon: 2, flower: 3, orbit: 4 };
  for (const [index, site] of sites.entries()) {
    const c = Math.cos(site.angle), s = Math.sin(site.angle), accent = themeColors[site.theme];
    const at = (u: number, y: number, v = 0) => new THREE.Vector3(site.x + s * u - c * v, GROUND_Y + y, site.z - c * u - s * v);
    const stroke = (points: number[][], hex: number, radius = .035, closed = false, detail = 28, withHalo = true) =>
      tube(points.map(([u, y, v = 0]) => at(u, y, v)), hex, radius, closed, detail, withHalo);
    const shape = (u: number, y: number, radius: number, hex: number, form: (a: number) => [number, number], count = 40) =>
      stroke(Array.from({ length: count }, (_, i) => { const [x, z] = form(i / count * Math.PI * 2); return [u + x * radius, y + z * radius, 0]; }), hex, .042, true, radius < .3 ? 16 : 32);
    const sparkle = (u: number, y: number, radius: number, hex: number) => {
      const points = Array.from({ length: 8 }, (_, i) => {
        const a = Math.PI / 2 + i * Math.PI / 4, r = radius * (i % 2 ? .24 : 1);
        return [u + Math.cos(a) * r, y + Math.sin(a) * r, -.02];
      });
      stroke(points, hex, .027, true, 12);
    };
    const ground = at(0, 0, 0);
    push(bases, new THREE.CylinderGeometry(1.7, 1.8, .12, 24), ground.x, -.048, ground.z);
    spill(ground.x, ground.z, 5.6, accent);

    if (site.theme === "heart") {
      shape(0, 2.2, 1.65, pink, a => [Math.pow(Math.sin(a), 3), (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16]);
      sparkle(-1.9, 3.4, .24, cream); sparkle(1.82, 2.9, .34, lavender);
      stroke([[-1.55, .18], [-1.55, .5], [-1.25, .76]], cream, .025, false, 8);
      stroke([[1.55, .18], [1.55, .5], [1.25, .76]], cream, .025, false, 8);
    } else if (site.theme === "moon") {
      const points: number[][] = [];
      for (let i = 0; i <= 32; i++) {
        const a = .75 + i / 32 * (Math.PI * 2 - 1.5);
        points.push([Math.cos(a) * 1.55 - .2, 2.08 + Math.sin(a) * 1.55]);
      }
      const tipX = Math.cos(.75) * 1.55 - .2, tipY = Math.sin(.75) * 1.55;
      for (let i = 1; i < 20; i++) {
        const t = i / 20; points.push([tipX - Math.sin(t * Math.PI) * 1.28, 2.08 - tipY + 2 * tipY * t]);
      }
      stroke(points, cream, .056, true, 48);
      sparkle(1.45, 3.25, .4, lavender); sparkle(1.95, 2.35, .23, teal); sparkle(-1.72, 3.92, .23, pink);
    } else if (site.theme === "flower") {
      for (const [u, height, radius, hex] of [[-.95, 1.55, .65, pink], [.25, 2.8, .83, teal], [1.2, 1.98, .6, lavender]]) {
        stroke([[u, .12], [u - .1, height * .55], [u, height]], teal, .027, false, 8);
        shape(u, height, radius, hex, a => { const r = .8 + .22 * Math.cos(a * 5); return [r * Math.sin(a), r * Math.cos(a)]; });
        shape(u, height, .17, cream, a => [Math.cos(a), Math.sin(a)], 20);
        stroke([[u, height * .4], [u - .48, height * .48], [u - .45, height * .65], [u, height * .4]], teal, .024, true, 10);
      }
    } else {
      shape(0, 2.15, 1.62, lavender, a => [Math.cos(a), Math.sin(a)]);
      stroke(Array.from({ length: 40 }, (_, i) => {
        const a = i / 40 * Math.PI * 2; return [Math.cos(a) * 2.05, 2.15 + Math.sin(a) * .65 + Math.cos(a) * .45, Math.sin(a) * .28];
      }), teal, .027, true, 32);
      sparkle(-1.62, 2.95, .26, cream); sparkle(.72, 3.58, .34, pink); sparkle(1.48, 1.45, .2, cream);
    }
    const signPosition = at(0, 4.45, 0);
    signPiece(3.7, .46, signPosition.x, signPosition.y - GROUND_Y, signPosition.z, -Math.PI / 2 - site.angle, themeRows[site.theme]);

    // Full evergreen silhouettes, layered boughs and a Christmas star replace
    // the former bare light rods. Lights wrap the foliage rather than dangling
    // from angular branches; every tree remains in the shared material batches.
    const tree = at(3.65, 0, .12);
    if (!insideHall(tree.x, tree.z, 6) && Math.hypot(tree.x - LAKE.x, tree.z - LAKE.z) < GARDEN_WALK_RADIUS - .25) {
      const scale = .96 + (index % 3) * .07;
      const height = 4.04 * scale;
      christmasTrees.push({ x: tree.x, z: tree.z, height });
      const treePoint = (x: number, y: number, z: number) => new THREE.Vector3(tree.x + x, GROUND_Y + y, tree.z + z);
      push(evergreens, colorize(new THREE.CylinderGeometry(.12, .19, .8 * scale, 8), 0x70513b), tree.x, .4 * scale, tree.z);
      for (let layer = 0; layer < 5; layer++) {
        const radius = (1.65 - layer * .29) * scale;
        const layerHeight = (1.6 - layer * .16) * scale;
        const bough = evergreenBoughGeometry(radius, layerHeight, index * .63 + layer * .4);
        push(evergreens, bough, tree.x, (.4 + layer * .67) * scale, tree.z);
      }
      const foliageRadius = (y: number) => {
        let radius = 0;
        for (let layer = 0; layer < 5; layer++) {
          const bottom = (.4 + layer * .67) * scale, h = (1.6 - layer * .16) * scale;
          const t = (y - bottom) / h;
          if (t >= 0 && t <= 1) radius = Math.max(radius, (1.65 - layer * .29) * scale * Math.pow(1 - t, .74));
        }
        return radius * 1.055 + .035;
      };
      const holiday = [cream, cream, cream, 0xffb54d, 0xff6f78, 0x92d5ff];
      for (let bulb = 0; bulb < 144; bulb++) {
        const t = bulb / 143, y = .66 * scale + t * (height - .84 * scale);
        const a = t * Math.PI * 10 + index * .63, radius = foliageRadius(y);
        lightPoint(tree.x + Math.cos(a) * radius, y, tree.z + Math.sin(a) * radius, holiday[bulb % holiday.length], .83);
      }
      const holidayStar = (x: number, y: number, z: number, radius: number) => {
        const shape = new THREE.Shape();
        for (let point = 0; point < 10; point++) {
          const a = Math.PI / 2 + point * Math.PI / 5, r = radius * (point % 2 ? .43 : 1);
          if (point === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        shape.closePath();
        const geometry = colorize(new THREE.ExtrudeGeometry(shape, { depth: .045, bevelEnabled: false, steps: 1 }), 0xffe6a0);
        geometry.translate(0, 0, -.0225); geometry.rotateY(-Math.PI / 2 - site.angle);
        push(tubes, geometry, x, y, z);
        lightPoint(x, y, z, cream, radius > .3 ? 2.2 : 1.1);
      };
      holidayStar(tree.x, height + .27, tree.z, .4);
      for (let ornament = 0; ornament < 12; ornament++) {
        const y = (.95 + ornament % 4 * .62) * scale;
        const a = ornament * 2.39996 + index, radius = foliageRadius(y);
        const p = treePoint(Math.cos(a) * radius, y, Math.sin(a) * radius);
        push(evergreens, colorize(new THREE.IcosahedronGeometry(.095 + (ornament % 3) * .012, 0), [0xe9b956, 0xb93640, 0xd9d4b5][ornament % 3]), p.x, y, p.z);
      }
      for (const [u, y, size] of [[-1.2, 1.52, .2], [.94, 2.08, .18], [-.47, 3.05, .16]]) {
        const p = treePoint(s * u * scale - c * .43, y * scale, -c * u * scale - s * .43);
        holidayStar(p.x, y * scale, p.z, size);
        const cord = new THREE.CylinderGeometry(.006, .006, .24, 4);
        push(frames, cord, p.x, y * scale + size + .12, p.z);
      }
      spill(tree.x, tree.z, 4.4, cream);
    }
  }
  root.userData.festivalSites = sites;
  root.userData.christmasTrees = christmasTrees;

  const core = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  core.name = "photo-neon-core";
  const halo = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  halo.name = "photo-neon-halo";
  const stone = new THREE.MeshStandardMaterial({ color: 0xc8c4be, roughness: 0.68, metalness: 0.08 });
  stone.name = "photo-limestone";
  const brass = new THREE.MeshStandardMaterial({ color: 0xa39677, roughness: 0.4, metalness: 0.5 });
  brass.name = "photo-champagne-metal";
  const fir = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .83, metalness: .03, emissive: 0x173e26, emissiveIntensity: .12 });
  fir.name = "photo-christmas-evergreens";
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
  merge(bases, stone); merge(frames, brass); merge(tubes, core); merge(halos, halo); merge(spills, wash); merge(evergreens, fir);

  const texture = photoSignTexture(mobile);
  const sign = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.02, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  sign.name = "photo-neon-lettering"; materials.push(sign);
  signPiece(9.6, 2.4, 0, 4.4, rearZ + .03, 0, 0);
  const signGeometry = mergeGeometries(letteringPieces, false)!; geometries.push(signGeometry);
  for (const piece of letteringPieces) piece.dispose();
  const lettering = new THREE.Mesh(signGeometry, sign);
  lettering.name = "garden-photo-sign"; lettering.layers.enable(2); root.add(lettering);
  const pointsGeometry = new THREE.BufferGeometry();
  pointsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(lightPositions, 3));
  pointsGeometry.setAttribute("color", new THREE.Float32BufferAttribute(lightColors, 3));
  pointsGeometry.setAttribute("aSize", new THREE.Float32BufferAttribute(lightSizes, 1));
  pointsGeometry.computeBoundingSphere(); geometries.push(pointsGeometry);
  const pointsMaterial = new THREE.ShaderMaterial({
    uniforms: { uNight: { value: 0 } }, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    vertexShader: "attribute float aSize; varying vec3 vColor; void main(){vColor=color;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(aSize*110./max(1.,-p.z),1.5,14.);}",
    fragmentShader: "uniform float uNight; varying vec3 vColor; void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;float core=1.-smoothstep(.12,.45,r);float halo=pow(max(0.,1.-r),2.);gl_FragColor=vec4(mix(vColor,vec3(1.),core*.65),(core*.9+halo*.7)*(.18+uNight*.82));}",
  });
  pointsMaterial.name = "photo-tree-fairy-lights"; materials.push(pointsMaterial);
  const points = new THREE.Points(pointsGeometry, pointsMaterial);
  points.name = "garden-festival-fairy-lights"; points.layers.enable(2); points.renderOrder = 5; root.add(points);
  let disposed = false;
  return {
    root,
    applyDaylight(lanterns: number) {
      const night = THREE.MathUtils.clamp(Number.isFinite(lanterns) ? lanterns : 0, 0, 1);
      core.color.setScalar(0.58 + night * 0.42);
      halo.opacity = night * 0.14;
      wash.uniforms.uNight.value = night;
      pointsMaterial.uniforms.uNight.value = night;
      sign.color.setScalar(0.66 + night * 0.34);
      fir.emissiveIntensity = .12 + night * .35;
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

/** Rounded, scalloped bough skirts give the firs a dense evergreen silhouette
 * instead of a stack of perfectly straight cones or exposed wire branches. */
function evergreenBoughGeometry(radius: number, height: number, phase: number): THREE.BufferGeometry {
  const segments = 32, rows = 4;
  const positions: number[] = [], colors: number[] = [], uv: number[] = [], indices: number[] = [];
  const color = new THREE.Color();
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    for (let segment = 0; segment <= segments; segment++) {
      const a = segment / segments * Math.PI * 2;
      const fringe = 1 + (.035 * Math.sin(a * 7 + phase) + .028 * Math.sin(a * 13 - phase)) * t * t;
      const r = radius * Math.pow(Math.max(.008, t), .74) * fringe;
      const y = height * (1 - t) + Math.sin(a * 11 + phase) * height * .045 * Math.pow(t, 5);
      positions.push(Math.cos(a) * r, y, Math.sin(a) * r); uv.push(segment / segments, 1 - t);
      color.setHSL(.405 + Math.sin(a * 3 + phase) * .012, .4, .14 + (1 - t) * .09 + Math.sin(a * 5 + phase) * .017);
      color.toArray(colors, colors.length);
      if (row < rows && segment < segments) {
        const current = row * (segments + 1) + segment, next = current + segments + 1;
        indices.push(current, current + 1, next + 1, current, next + 1, next);
      }
    }
  }
  const centre = positions.length / 3;
  positions.push(0, 0, 0); colors.push(.022, .055, .032); uv.push(.5, .5);
  for (let segment = 0; segment < segments; segment++) indices.push(centre, rows * (segments + 1) + segment, rows * (segments + 1) + segment + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function photoSignTexture(mobile: boolean): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  const canvas = document.createElement("canvas");
  canvas.width = mobile ? 1024 : 1536; canvas.height = canvas.width / 2;
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
  ctx.font = "500 27px Arial, sans-serif"; ctx.shadowBlur = 8;
  for (const [index, label] of ["L O V E   I N   B L O O M", "M O O N L I T   W I S H E S", "F L O W E R   D R E A M S", "U N D E R   T H E   S T A R S"].entries()) {
    ctx.fillStyle = ["#ffc4dc", "#ffedc3", "#b2f8e8", "#dacdff"][index];
    ctx.fillText(label, 512, 288 + index * 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}
