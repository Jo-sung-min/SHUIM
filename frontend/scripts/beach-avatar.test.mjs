import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { inflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

async function load(file, dependencies, names) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed).replace(/^import\s+[^\n]+\n/gm, "")
    .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
  const context = { ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${names.join(",")} };`, context);
  return context.api;
}
const atlas = await load("../lib/beach/atlas.ts", {}, ["CHAR_ATLAS", "CHAR_VIEW", "CHAR_ANIM"]);
const { CHAR_ATLAS, CHAR_VIEW, CHAR_ANIM } = atlas;
const { cellW: CELL_W, cellH: CELL_H } = CHAR_ATLAS;
/** 승인된 남녀 정면 원본의 턱 위치. 머리 높이는 전체 키의 약 1/3이다. */
const CHINS = [40, 38];
const frameColumn = (node) => Math.round(node.tex.offset.x * CHAR_ATLAS.cols);
const { BeachEngine } = await load("../lib/beach/engine.ts", {
  THREE, ...atlas, CAMPFIRE: { x: 0, z: 12 }, performance,
  document: { createElement: () => ({ width: 0, height: 0, getContext: () => null }) },
}, ["BeachEngine"]);

/** 8비트 RGBA PNG 를 푼다 (Aseprite 는 행 필터를 쓰므로 Sub·Up·Average·Paeth 를 되돌린다) */
function decodePng(png) {
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), depth = png[24], type = png[25], compressed = [];
  assert.deepEqual([depth, type], [8, 6], "sheet is 8-bit RGBA");
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") compressed.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(compressed));
  const stride = width * 4, out = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? cur[i - 4] : 0, b = prev[i], c = i >= 4 ? prev[i - 4] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    prev = cur;
  }
  return { width, height, rgba: out };
}
const { width, height, rgba } = decodePng(await readFile(new URL("../public/beach/chars-v2.png", import.meta.url)));
const pixel = (col, row, x, y) => {
  const index = ((row * CHAR_ATLAS.cellH + y) * width + col * CHAR_ATLAS.cellW + x) * 4;
  return [...rgba.subarray(index, index + 4)];
};
const digest = (col, row) => {
  const hash = createHash("sha256");
  for (let y = 0; y < CHAR_ATLAS.cellH; y++) for (let x = 0; x < CHAR_ATLAS.cellW; x++) hash.update(Buffer.from(pixel(col, row, x, y)));
  return hash.digest("hex");
};

function fixture(yaw = 0) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 100);
  camera.position.set(0, 0.9, -5);
  camera.lookAt(0, 0.9, 0);
  camera.updateMatrixWorld();
  const selected = [];
  const engine = Object.assign(Object.create(BeachEngine.prototype), {
    scene, camera, charTex: new THREE.Texture(), daylight: { tint: [1, 1, 1] },
    shadowGeo: new THREE.PlaneGeometry(1, 1), shadowMat: new THREE.MeshBasicMaterial(),
    players: new Map(), selected: null, time: 0,
    ring: new THREE.Mesh(), ringMat: new THREE.MeshBasicMaterial(),
    canvas: { getBoundingClientRect: () => ({ width: 800, height: 600 }) },
    handlers: { onSelect: (value) => selected.push(value) },
    deckHeight: () => 0,
  });
  const node = engine.createPlayer({ pid: "player", nick: "파도", x: 0, z: 0, yaw, moving: false, skin: 4 });
  engine.players.set("player", node);
  return { engine, node, camera, scene, selected };
}

test("the Aseprite sheet has 80 native 72×104 frames, male/female bases and crisp transparent edges", () => {
  assert.deepEqual([width, height, CELL_W, CELL_H, CHAR_ATLAS.cols, CHAR_ATLAS.rows], [2880, 208, 72, 104, 40, 2]);
  // 다른 vm 컨텍스트에서 온 객체라 프로토타입이 달라서, 값만 비교한다
  assert.deepEqual(JSON.parse(JSON.stringify(CHAR_VIEW)), { front: 0, back: 10, left: 20, right: 30 });
  assert.deepEqual(JSON.parse(JSON.stringify(CHAR_ANIM)), { idle: { from: 0, length: 4 }, walk: { from: 4, length: 6 } });
  assert.equal(rgba.length, height * width * 4);
  assert.equal(new Set(Array.from({ length: 2 }, (_, row) => digest(0, row))).size, 2);
  for (let row = 0; row < CHAR_ATLAS.rows; row++) for (let col = 0; col < CHAR_ATLAS.cols; col++) {
    const colors = new Set();
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
      const p = pixel(col, row, x, y);
      assert.ok(p[3] === 0 || p[3] === 255, "no soft antialias pixels");
      if (x === 0 || x === CELL_W - 1 || y === 0 || y === CELL_H - 1) assert.equal(p[3], 0, "frame gutters prevent atlas bleeding");
      if (p[3]) colors.add(p.join(","));
    }
    assert.ok(colors.size >= 16, "hair strands, eye highlights and cloth shading survive even in back views");
  }
});

test("front idle artwork is pixel-identical to the approved editable male/female sources", async () => {
  for (const [row, name] of ["male", "female"].entries()) {
    const approved = decodePng(await readFile(new URL(`./aseprite/base-characters/${name}/front.png`, import.meta.url)));
    assert.deepEqual([approved.width, approved.height], [CELL_W, CELL_H]);
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
      const at = (y * CELL_W + x) * 4;
      assert.deepEqual(pixel(0, row, x, y), [...approved.rgba.subarray(at, at + 4)], `${name} approved pixel at ${x},${y}`);
    }
  }
});

test("approved three-head proportions remain intact and each direction has idle/walk motion", () => {
  for (let row = 0; row < CHAR_ATLAS.rows; row++) {
    const chin = CHINS[row];
    const occupied = Array.from({ length: CELL_H }, (_, y) => Array.from({ length: CELL_W }, (_, x) => pixel(0, row, x, y)[3]).filter(Boolean).length);
    const top = occupied.findIndex(Boolean), bottom = occupied.findLastIndex(Boolean);
    const headShare = (chin - top) / (bottom - top + 1);
    assert.ok(headShare >= 0.29 && headShare <= 0.38, `head share ${headShare}`);
    assert.notEqual(digest(CHAR_VIEW.front, row), digest(CHAR_VIEW.back, row), "front and back have separately drawn views");
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
      assert.deepEqual(pixel(CHAR_VIEW.left, row, x, y), pixel(CHAR_VIEW.right, row, CELL_W - 1 - x, y), "right idle view mirrors the unadorned left profile");
    }
    for (const view of Object.values(CHAR_VIEW)) {
      for (const anim of Object.values(CHAR_ANIM)) {
        const frames = Array.from({ length: anim.length }, (_, i) => digest(view + anim.from + i, row));
        assert.ok(new Set(frames).size >= (anim === CHAR_ANIM.walk ? 4 : 2), "native source pixels animate without requiring an artificial change on every frame");
      }
    }
  }
});

test("avatar is a double-sided 1.8m upright billboard that always faces the camera and swaps front/back/side art", () => {
  const { engine, node, camera } = fixture();
  engine.updatePlayers(1);
  assert.ok(node.sprite instanceof THREE.Mesh);
  assert.ok(!(node.sprite instanceof THREE.Sprite));
  assert.equal(node.mat.side, THREE.DoubleSide);
  assert.equal(node.mat.transparent, false, "opaque cutout draws once with depth writing");
  node.sprite.geometry.computeBoundingBox();
  const box = node.sprite.geometry.boundingBox;
  assert.ok(Math.abs(box.min.y) < 1e-7 && Math.abs(box.max.y - 1.8) < 1e-6);
  assert.ok(Math.abs(box.max.z - box.min.z) < 1e-8);
  const inView = (view) => frameColumn(node) >= view && frameColumn(node) < view + CHAR_ANIM.idle.length;
  const facesCamera = () => {
    const normal = new THREE.Vector3(0, 0, 1).applyEuler(node.sprite.rotation);
    const toCamera = new THREE.Vector3(camera.position.x, 0, camera.position.z).normalize();
    return normal.distanceTo(toCamera) < 1e-6;
  };
  assert.ok(facesCamera() && inView(CHAR_VIEW.front), "a character looking at the camera shows the front idle cycle");
  camera.position.z = 5;
  engine.updatePlayers(1);
  assert.ok(facesCamera() && inView(CHAR_VIEW.back), "seen from behind, the sheet turns to the camera and shows the back");
  camera.position.set(5, 0.9, 0);
  engine.updatePlayers(1);
  assert.ok(facesCamera() && inView(CHAR_VIEW.right), "from the character's right, the profile facing screen-right shows");
  camera.position.set(-5, 0.9, 0);
  engine.updatePlayers(1);
  assert.ok(facesCamera() && inView(CHAR_VIEW.left), "from the character's left, the mirrored profile shows");
  node.target.moving = true;
  engine.updatePlayers(0.2);
  const walkCol = frameColumn(node) - CHAR_VIEW.left;
  assert.ok(walkCol >= CHAR_ANIM.walk.from && walkCol < CHAR_ANIM.walk.from + CHAR_ANIM.walk.length, "walking plays the walk cycle");
});

test("the billboard keeps its full width from every side, so the side art is what the viewer sees", () => {
  const { engine, node, camera, scene } = fixture();
  const projectedWidth = (x, z) => {
    camera.position.set(x, 0.9, z);
    camera.lookAt(0, 0.9, 0);
    camera.updateMatrixWorld();
    engine.updatePlayers(1);
    scene.updateMatrixWorld(true);
    const positions = node.sprite.geometry.getAttribute("position");
    const xs = Array.from({ length: positions.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(node.sprite.matrixWorld).project(camera).x);
    return Math.max(...xs) - Math.min(...xs);
  };
  const front = projectedWidth(0, -5), side = projectedWidth(5, 0), rear = projectedWidth(0, 5);
  assert.ok(front > 0.3);
  assert.ok(Math.abs(side - front) < 1e-7);
  assert.ok(Math.abs(rear - front) < 1e-7);
});

test("a remote character selection changes the existing avatar row without replacing its node", () => {
  const { engine, node } = fixture();
  const next = { ...node.data, skin: 1 };
  engine.setPlayers([next]);
  engine.updatePlayers(0.1);
  assert.equal(engine.players.get(next.pid), node);
  assert.equal(node.data.skin, 1);
  assert.equal(node.tex.offset.y, 0, "female uses the second of two atlas rows");
  engine.setPlayers([{ ...next, skin: 0 }]);
  engine.updatePlayers(0.1);
  assert.equal(node.tex.offset.y, 0.5, "male returns to the first row");
});

test("yaw crosses ±PI by the short turn; care bounce and name tag remain above the taller character", () => {
  const { engine, node } = fixture(Math.PI - 0.02);
  node.target.yaw = -Math.PI + 0.02;
  node.bounce = 1;
  engine.deckHeight = () => 0.18;
  engine.updatePlayers(0.05);
  assert.ok(node.cur.yaw > Math.PI - 0.02 && node.cur.yaw < Math.PI + 0.02);
  assert.ok(node.sprite.position.y > 0.18);
  assert.ok(node.label.position.y > node.sprite.position.y + 1.8);
  assert.equal(node.shadow.position.y, 0.195);
});

test("an edge-on character can still be selected using the forgiving screen target", () => {
  const { engine, node, camera, scene, selected } = fixture();
  camera.position.set(5, 0.9, 0);
  camera.lookAt(0, 0.9, 0);
  camera.updateMatrixWorld();
  engine.updatePlayers(1);
  scene.updateMatrixWorld(true);
  engine.tapAt(400, 300);
  assert.equal(selected.at(-1), node.data);
  assert.equal(engine.ring.visible, true);
});

test("removing an avatar disposes its new geometry, material, atlas clone and name tag", () => {
  const { engine, node, scene } = fixture();
  const disposed = [];
  for (const [name, resource] of Object.entries({ geometry: node.sprite.geometry, material: node.mat, texture: node.tex,
    labelMaterial: node.label.material, labelTexture: node.label.material.map })) resource.addEventListener("dispose", () => disposed.push(name));
  engine.removePlayer(node);
  assert.deepEqual(disposed.sort(), ["geometry", "labelMaterial", "labelTexture", "material", "texture"]);
  assert.ok(!scene.children.includes(node.sprite) && !scene.children.includes(node.shadow) && !scene.children.includes(node.label));
});
