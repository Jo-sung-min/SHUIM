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
const atlas = await load("../lib/beach/atlas.ts", {}, ["CHAR_ATLAS", "CHAR_VIEW", "CHAR_FRAME"]);
const { CHAR_ATLAS, CHAR_VIEW, CHAR_FRAME } = atlas;
const { BeachEngine } = await load("../lib/beach/engine.ts", {
  THREE, ...atlas, CAMPFIRE: { x: 0, z: 12 }, performance,
  document: { createElement: () => ({ width: 0, height: 0, getContext: () => null }) },
}, ["BeachEngine"]);

const png = await readFile(new URL("../public/beach/chars.png", import.meta.url));
const width = png.readUInt32BE(16), height = png.readUInt32BE(20), compressed = [];
for (let offset = 8; offset < png.length;) {
  const length = png.readUInt32BE(offset);
  if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") compressed.push(png.subarray(offset + 8, offset + 8 + length));
  offset += length + 12;
}
const raw = inflateSync(Buffer.concat(compressed));
const pixel = (col, row, x, y) => {
  const index = (row * CHAR_ATLAS.cellH + y) * (width * 4 + 1) + 1 + (col * CHAR_ATLAS.cellW + x) * 4;
  return [...raw.subarray(index, index + 4)];
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

test("the atlas has 96 native 48×64 frames, eight distinct characters and crisp transparent edges", () => {
  assert.deepEqual([width, height, CHAR_ATLAS.cellW, CHAR_ATLAS.cellH], [576, 512, 48, 64]);
  assert.equal(raw.length, height * (width * 4 + 1));
  for (let y = 0; y < height; y++) assert.equal(raw[y * (width * 4 + 1)], 0, "generator uses unfiltered RGBA rows");
  assert.equal(new Set(Array.from({ length: 8 }, (_, row) => digest(0, row))).size, 8);
  for (let row = 0; row < 8; row++) for (let col = 0; col < 12; col++) {
    const colors = new Set();
    for (let y = 0; y < 64; y++) for (let x = 0; x < 48; x++) {
      const p = pixel(col, row, x, y);
      assert.ok(p[3] === 0 || p[3] === 255, "no soft antialias pixels");
      if (x === 0 || x === 47 || y === 0 || y === 63) assert.equal(p[3], 0, "frame gutters prevent atlas bleeding");
      if (p[3]) colors.add(p.join(","));
    }
    assert.ok(colors.size >= 16, "fine highlights and shade colors survive even in back views");
  }
});

test("head and body each occupy about half the character; all walk views have distinct steps", () => {
  for (let row = 0; row < 8; row++) {
    const occupied = Array.from({ length: 64 }, (_, y) => Array.from({ length: 48 }, (_, x) => pixel(0, row, x, y)[3]).filter(Boolean).length);
    const top = occupied.findIndex(Boolean), bottom = occupied.findLastIndex(Boolean);
    assert.ok((33 - top) / (bottom - top + 1) >= 0.48 && (33 - top) / (bottom - top + 1) <= 0.54);
    assert.ok(Math.max(...occupied.slice(2, 33)) > Math.max(...occupied.slice(33)), "round head is wider than small body");
    assert.notDeepEqual(pixel(0, row, 17, 22), pixel(3, row, 17, 22), "back of head has no front eyes");
    for (const view of [0, 3, 6, 9]) assert.equal(new Set([0, 1, 2].map((frame) => digest(view + frame, row))).size, 3);
  }
});

test("avatar is a double-sided 1.8m upright plane and follows player yaw, never camera yaw", () => {
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
  assert.equal(node.tex.offset.x, CHAR_VIEW.front / CHAR_ATLAS.cols);
  const rotation = node.sprite.rotation.y;
  camera.position.z = 5;
  engine.updatePlayers(1);
  assert.equal(node.sprite.rotation.y, rotation);
  assert.equal(node.tex.offset.x, CHAR_VIEW.back / CHAR_ATLAS.cols);
  node.target.yaw = Math.PI / 2;
  engine.updatePlayers(1);
  const normal = new THREE.Vector3(0, 0, 1).applyEuler(node.sprite.rotation);
  assert.ok(normal.distanceTo(new THREE.Vector3(-1, 0, 0)) < 1e-6);
});

test("side view really collapses to a paper-thin profile, while face-on retains full width", () => {
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
  assert.ok(side < front * 0.001);
  assert.ok(Math.abs(rear - front) < 1e-7);
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
