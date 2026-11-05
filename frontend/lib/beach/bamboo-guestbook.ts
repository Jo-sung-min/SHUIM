import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { BAMBOO_BOARD_CAPACITY, BAMBOO_BOARD_COLUMNS, BAMBOO_BOARD_ROWS, bambooNoteColor, bambooNoteDate, type BambooNote } from "./bamboo-notes";
import { BAMBOO_GUESTBOOK, bambooFloorHeight } from "./bamboo-trail";
export { BAMBOO_GUESTBOOK, BAMBOO_GUESTBOOK_OBSTACLES, isNearBambooGuestbook } from "./bamboo-trail";

function makeCanvas(width: number, height: number) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { ctx, texture };
}

function drawTitle(ctx: CanvasRenderingContext2D) {
  const wood = ctx.createLinearGradient(0, 0, 0, 256);
  wood.addColorStop(0, "#8b4a2b");
  wood.addColorStop(0.52, "#67311f");
  wood.addColorStop(1, "#49251a");
  ctx.beginPath();
  ctx.moveTo(34, 226);
  ctx.quadraticCurveTo(10, 226, 13, 202);
  ctx.quadraticCurveTo(17, 144, 70, 144);
  ctx.bezierCurveTo(119, 54, 230, 17, 384, 17);
  ctx.bezierCurveTo(538, 17, 649, 54, 698, 144);
  ctx.quadraticCurveTo(751, 144, 755, 202);
  ctx.quadraticCurveTo(758, 226, 734, 226);
  ctx.closePath();
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.lineWidth = 9;
  ctx.strokeStyle = "#c79350";
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#f3cf81";
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = 'bold 82px "Batang", "Noto Serif KR", serif';
  ctx.fillStyle = "#381c17";
  ctx.fillText("축제 게시판", 386, 144);
  ctx.fillStyle = "#ffe3ad";
  ctx.fillText("축제 게시판", 384, 140);
  for (const x of [78, 690]) {
    ctx.save();
    ctx.translate(x, 182);
    ctx.fillStyle = "#eac98c";
    for (let i = 0; i < 5; i++) {
      ctx.rotate(Math.PI * 2 / 5);
      ctx.beginPath();
      ctx.ellipse(0, -7, 4, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function storyLines(ctx: CanvasRenderingContext2D, text: string, width: number, limit: number) {
  const lines: string[] = [];
  let line = "";
  for (const letter of text.trim()) {
    if (letter === "\n" || (line && ctx.measureText(line + letter).width > width)) {
      lines.push(line.trimEnd());
      if (lines.length === limit) {
        let last = lines[limit - 1];
        while (last && ctx.measureText(last + "…").width > width) last = last.slice(0, -1);
        lines[limit - 1] = last + "…";
        return lines;
      }
      line = "";
    }
    if (letter !== "\n") line += letter;
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}

function drawNotes(ctx: CanvasRenderingContext2D, notes: readonly BambooNote[]) {
  const { width, height } = ctx.canvas;
  const backing = ctx.createLinearGradient(0, 0, width, height);
  backing.addColorStop(0, "#354e43");
  backing.addColorStop(0.48, "#283f35");
  backing.addColorStop(1, "#20372e");
  ctx.fillStyle = backing;
  ctx.fillRect(0, 0, width, height);
  // A small fretwork corner marks each edge even when the community board is empty.
  for (const [x, y] of [[0, 0], [width, 0], [0, height], [width, height]]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(x ? -1 : 1, y ? -1 : 1);
    ctx.strokeStyle = "#caa66a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(16, 58); ctx.lineTo(16, 16); ctx.lineTo(58, 16);
    ctx.moveTo(27, 43); ctx.lineTo(27, 27); ctx.lineTo(43, 27); ctx.lineTo(43, 37); ctx.lineTo(19, 37);
    ctx.stroke();
    ctx.restore();
  }
  const cellW = (width - 84) / BAMBOO_BOARD_COLUMNS;
  const cellH = (height - 50) / BAMBOO_BOARD_ROWS;
  for (const [index, note] of notes.entries()) {
    const w = cellW - 16, h = cellH - 12;
    ctx.save();
    const column = index % BAMBOO_BOARD_COLUMNS, row = Math.floor(index / BAMBOO_BOARD_COLUMNS);
    ctx.translate(42 + (column + 0.5) * cellW, 25 + (row + 0.5) * cellH);
    ctx.rotate(((note.id.charCodeAt(0) || 0) % 5 - 2) * 0.009);
    ctx.translate(-w / 2, -h / 2);
    ctx.fillStyle = "#142b24";
    ctx.fillRect(3, 6, w, h);
    ctx.fillStyle = bambooNoteColor(note.id);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#bda37f";
    ctx.beginPath();
    ctx.arc(w / 2, 9, 4.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "#3a352f";
    ctx.font = 'bold 25px "Malgun Gothic", sans-serif';
    ctx.fillText(storyLines(ctx, note.name, w - 28, 1)[0] ?? "", 14, 35);
    ctx.font = '21px "Malgun Gothic", sans-serif';
    storyLines(ctx, note.story, w - 28, 3).forEach((line, i) => ctx.fillText(line, 14, 61 + 25 * i));
    ctx.font = '16px "Malgun Gothic", sans-serif';
    ctx.textAlign = "right";
    ctx.fillStyle = "#655a50";
    ctx.fillText(bambooNoteDate(note.createdAt), w - 12, h - 11);
    ctx.restore();
  }
}

export function buildBambooGuestbook(parent: THREE.Object3D) {
  const board = new THREE.Group();
  board.name = "bamboo-summit-guestbook";
  board.position.set(BAMBOO_GUESTBOOK.x, bambooFloorHeight(BAMBOO_GUESTBOOK.x, BAMBOO_GUESTBOOK.z), BAMBOO_GUESTBOOK.z);
  board.rotation.y = BAMBOO_GUESTBOOK.yaw;
  board.scale.setScalar(BAMBOO_GUESTBOOK.scale);
  parent.add(board);
  board.updateWorldMatrix(true, false);
  // The roof overhangs the thinner notice panel. Leave space beneath the eaves
  // for close-up views, while keeping the camera on the visitor's side of both.
  const cameraBlockers = [
    new THREE.Box3(new THREE.Vector3(-1.91, 0, -0.14), new THREE.Vector3(1.91, 2.25, 0.14)),
    new THREE.Box3(new THREE.Vector3(-2.08, 2.23, -0.47), new THREE.Vector3(2.08, 2.90, 0.50)),
  ].map(box => box.applyMatrix4(board.matrixWorld).expandByScalar(0.12));
  const orbitRay = new THREE.Ray(), hit = new THREE.Vector3();

  const frameParts: THREE.BufferGeometry[] = [];
  const tint = new THREE.Color();
  function part(geometry: THREE.BufferGeometry, color: number) {
    // Normalize indexed geometry so the frame, rafters and roof tiles share a draw call.
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    const colors = new Float32Array(flat.getAttribute("position").count * 3);
    tint.setHex(color);
    for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
    flat.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    frameParts.push(flat);
  }
  function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number) {
    part(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
  }
  function tube(points: THREE.Vector3[], radius: number, color: number) {
    part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.max(4, points.length - 1), radius, 7, false), color);
  }
  const red = 0xb9462b, gold = 0xc08e52, darkWood = 0x5d2b20;
  for (const x of [-1.75, 1.75]) {
    // Seat each stone footing into the slope while keeping the timber frame level.
    let ground = Infinity;
    for (const dx of [-0.18, 0.18]) for (const dz of [-0.16, 0.16]) {
      ground = Math.min(ground, bambooFloorHeight(
        board.position.x + dx * board.scale.x, board.position.z + (x + dz) * board.scale.z));
    }
    const bottom = (ground - 0.10 - board.position.y) / board.scale.y;
    box(0.32, 0.22 - bottom, 0.36, x, (0.22 + bottom) / 2, 0, 0x807773);
    box(0.26, 0.10, 0.28, x, 0.26, 0, red);
    box(0.19, 2.01, 0.22, x, 1.25, 0, red);
    box(0.32, 0.095, 0.29, x, 2.20, 0, darkWood);
    box(0.43, 0.12, 0.35, x, 2.30, 0, red);
    box(0.14, 0.36, 0.014, x, 1.37, 0.122, 0xe7c089);
    box(0.16, 0.014, 0.019, x, 1.56, 0.126, gold);
    for (let petal = 0; petal < 5; petal++) {
      const angle = petal * 2 * Math.PI / 5;
      part(new THREE.CircleGeometry(0.021, 9).scale(0.7, 1, 1).rotateZ(-angle)
        .translate(x + Math.sin(angle) * 0.022, 1.38 + Math.cos(angle) * 0.022, 0.131), 0xaa452c);
    }
  }
  box(3.40, 1.56, 0.14, 0, 1.38, 0, darkWood);
  box(3.27, 1.46, 0.15, 0, 1.38, 0.02, gold);
  for (const y of [0.60, 2.16]) box(3.54, 0.13, 0.20, 0, y, 0, red);
  box(3.83, 0.12, 0.59, 0, 2.28, 0, 0x863c24);
  for (let i = -5; i <= 5; i++) box(0.09, 0.075, 0.64, i * 0.33, 2.26, 0, 0xaf5432);

  const roofHeight = (x: number, z: number) => 2.32 + 0.30 * (1 - Math.abs(z) / 0.46) ** 1.6
    + 0.20 * (Math.abs(x) / 2.04) ** 8;
  const roof = new THREE.PlaneGeometry(1, 1, 48, 10);
  const pos = roof.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * 4.08, z = -pos.getY(i) * 0.92;
    pos.setXYZ(i, x, roofHeight(x, z), z);
  }
  roof.computeVertexNormals();
  part(roof, 0x494850);
  for (let i = -13; i <= 13; i++) {
    const x = i * 2.03 / 13;
    for (const side of [-1, 1]) {
      const points = [0, 0.12, 0.23, 0.35, 0.46].map(depth =>
        new THREE.Vector3(x, roofHeight(x, depth) + 0.018, side * depth));
      tube(points, 0.041, i % 3 ? 0x585761 : 0x4d4b54);
      part(new THREE.CylinderGeometry(0.043, 0.043, 0.018, 10).rotateX(Math.PI / 2)
        .translate(x, roofHeight(x, 0.46) + 0.018, side * 0.458), 0x66616a);
    }
  }
  tube(Array.from({ length: 19 }, (_, i) => {
    const x = (i - 9) * 2.04 / 9;
    return new THREE.Vector3(x, roofHeight(x, 0) + 0.025, 0);
  }), 0.068, 0x504954);
  const lamps: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const x = side * 2.02;
    part(new THREE.SphereGeometry(0.060, 12, 8).scale(1, 1.3, 1).translate(x, roofHeight(x, 0) + 0.135, 0), gold);
    box(0.39, 0.028, 0.038, side * 1.93, 1.96, 0.03, gold);
    box(0.016, 0.16, 0.016, side * 2.11, 1.89, 0.03, gold);
    const lx = side * 2.11, ly = 1.62;
    lamps.push(new THREE.SphereGeometry(1, 16, 12).scale(0.105, 0.171, 0.105).translate(lx, ly, 0.03));
    for (const t of [-0.75, -0.36, 0, 0.36, 0.75]) {
      part(new THREE.TorusGeometry(0.105 * Math.sqrt(1 - t * t), 0.003, 4, 16)
        .rotateX(Math.PI / 2).translate(lx, ly + t * 0.171, 0.03), 0xd39448);
    }
    for (const offset of [-0.166, 0.166]) {
      part(new THREE.CylinderGeometry(0.052, 0.052, 0.027, 12).translate(lx, ly + offset, 0.03), gold);
    }
    part(new THREE.ConeGeometry(0.025, 0.135, 8).rotateX(Math.PI).translate(lx, ly - 0.253, 0.03), red);
  }

  const frameGeometry = mergeGeometries(frameParts)!;
  frameParts.forEach(piece => piece.dispose());
  const frame = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.80, side: THREE.DoubleSide });
  const lampStrength = { value: 0 };
  frame.onBeforeCompile = shader => {
    shader.uniforms.uBoardLamp = lampStrength;
    shader.vertexShader = "varying vec3 vWood;\n" + shader.vertexShader.replace("#include <begin_vertex>",
      "#include <begin_vertex>\n vWood = position;");
    // Fine lacquer grain and a little lantern fill also read on a moonless night.
    shader.fragmentShader = "varying vec3 vWood; uniform float uBoardLamp;\n" + shader.fragmentShader.replace("#include <color_fragment>", `
      #include <color_fragment>
      float upright = step(1.60, abs(vWood.x)) * (1.0 - step(2.20, vWood.y));
      float across = mix(vWood.y, vWood.x, upright);
      float along = mix(vWood.x, vWood.y, upright);
      float grain = sin(across * 155.0 + 1.6 * sin(along * 5.0)) + 0.42 * sin(across * 63.0 + along * 4.0);
      diffuseColor.rgb *= 1.0 + 0.06 * grain * smoothstep(0.05, 0.20, diffuseColor.r - diffuseColor.b);
    `).replace("#include <emissivemap_fragment>", `
      #include <emissivemap_fragment>
      vec3 lampOffset = vec3(abs(vWood.x) - 2.11, vWood.y - 1.62, vWood.z - 0.03);
      float lamplight = uBoardLamp / (0.65 + 3.0 * dot(lampOffset, lampOffset));
      totalEmissiveRadiance += diffuseColor.rgb * (vec3(0.26) + lamplight * vec3(1.05, 0.63, 0.26));
    `);
  };
  const lampGeometry = mergeGeometries(lamps)!;
  lamps.forEach(piece => piece.dispose());
  const dayPaper = new THREE.Color(0xd8b67d), litPaper = new THREE.Color(0xffe7a4);
  const lanterns = new THREE.MeshBasicMaterial({ color: dayPaper, toneMapped: false });
  board.add(new THREE.Mesh(frameGeometry, frame), new THREE.Mesh(lampGeometry, lanterns));

  const glowGeometry = new THREE.PlaneGeometry(1, 1);
  const glowMaterial = new THREE.ShaderMaterial({
    uniforms: { uBoardLamp: lampStrength },
    vertexShader: `varying vec2 vHalo;
      void main() {
        vHalo = uv * 2.0 - 1.0;
        vec4 lamp = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        lamp.xy += position.xy * vec2(1.15, 1.35) * length(modelMatrix[0].xyz);
        gl_Position = projectionMatrix * lamp;
      }`,
    fragmentShader: `varying vec2 vHalo;
      uniform float uBoardLamp;
      void main() {
        float r = dot(vHalo, vHalo);
        float halo = (0.28 * exp(-4.5 * r) + 0.17 * exp(-15.0 * r)) * (1.0 - smoothstep(0.55, 1.0, r));
        gl_FragColor = vec4(vec3(1.0, 0.38, 0.07), halo * uBoardLamp);
        #include <colorspace_fragment>
      }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false,
  });
  const glow = new THREE.InstancedMesh(glowGeometry, glowMaterial, 2);
  for (const [index, x] of [-2.11, 2.11].entries())
    glow.setMatrixAt(index, new THREE.Matrix4().makeTranslation(x, 1.62, 0.10));
  glow.name = "bamboo-board-lantern-glow";
  glow.renderOrder = 2;
  glow.visible = false;
  board.add(glow);

  const title = makeCanvas(768, 256);
  if (title) drawTitle(title.ctx);
  const signGeometry = new THREE.PlaneGeometry(1.64, 0.55);
  const signMaterial = new THREE.MeshBasicMaterial({ map: title?.texture ?? null, color: title ? 0xffffff : 0x905130,
    alphaTest: 0.15, toneMapped: false });
  const sign = new THREE.Mesh(signGeometry, signMaterial);
  sign.position.set(0, 2.40, 0.485);
  board.add(sign);

  const panel = makeCanvas(1920, 840);
  const noteGeometry = new THREE.PlaneGeometry(3.22, 1.40);
  const noteMaterial = new THREE.MeshStandardMaterial({ map: panel?.texture ?? null, emissiveMap: panel?.texture ?? null,
    emissive: 0xffffff, emissiveIntensity: panel ? 0.61 : 0, color: panel ? 0xffffff : 0x304437, roughness: 1 });
  noteMaterial.onBeforeCompile = shader => {
    shader.uniforms.uBoardLamp = lampStrength;
    shader.vertexShader = "varying vec2 vPage;\n" + shader.vertexShader.replace("#include <begin_vertex>",
      "#include <begin_vertex>\n vPage = position.xy;");
    shader.fragmentShader = "varying vec2 vPage; uniform float uBoardLamp;\n" + shader.fragmentShader.replace(
      "#include <emissivemap_fragment>", `
      #include <emissivemap_fragment>
      vec2 fromLamp = vec2(abs(vPage.x) - 2.11, vPage.y - 0.24);
      float warmEdge = uBoardLamp / (0.86 + 4.0 * dot(fromLamp, fromLamp));
      totalEmissiveRadiance += diffuseColor.rgb * warmEdge * vec3(0.64, 0.37, 0.16);
    `);
  };
  const notes = new THREE.Mesh(noteGeometry, noteMaterial);
  notes.name = "bamboo-festival-notices";
  notes.position.set(0, 1.38, 0.104);
  board.add(notes);
  let signature: string | null = null;
  function setEntries(entries: readonly BambooNote[]) {
    if (!panel) return;
    const shown = entries.slice(0, BAMBOO_BOARD_CAPACITY);
    const next = JSON.stringify(shown.map(note => [note.id, note.name, note.story, note.createdAt]));
    if (next === signature) return;
    drawNotes(panel.ctx, shown);
    panel.texture.needsUpdate = true;
    signature = next;
  }
  setEntries([]);
  return {
    setEntries,
    clipCamera(x: number, y: number, z: number, target: THREE.Vector3) {
      orbitRay.origin.set(x, y, z);
      orbitRay.direction.subVectors(target, orbitRay.origin);
      const reach = orbitRay.direction.length();
      if (reach === 0) return;
      orbitRay.direction.divideScalar(reach);
      let clearReach = reach;
      for (const box of cameraBlockers) {
        if (orbitRay.intersectBox(box, hit)) clearReach = Math.min(clearReach, hit.distanceTo(orbitRay.origin));
      }
      if (clearReach < reach) orbitRay.at(Math.max(0, clearReach - 0.02), target);
    },
    setLanternAmount(amount: number) {
      lampStrength.value = THREE.MathUtils.clamp(amount, 0, 1);
      lanterns.color.copy(dayPaper).lerp(litPaper, lampStrength.value);
      noteMaterial.emissiveIntensity = panel ? 0.30 + 0.24 * lampStrength.value : 0;
      glow.visible = lampStrength.value > 0.01;
    },
    dispose() {
      board.removeFromParent();
      glow.dispose();
      for (const geometry of [frameGeometry, lampGeometry, signGeometry, noteGeometry, glowGeometry]) geometry.dispose();
      for (const material of [frame, lanterns, signMaterial, noteMaterial, glowMaterial]) material.dispose();
      panel?.texture.dispose();
      title?.texture.dispose();
    },
  };
}
