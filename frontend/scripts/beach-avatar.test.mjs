import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { inflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { hotSpring } from "./beach-world-fixture.mjs";
import { readAssetBytes } from "./asset-bytes-fixture.mjs";

async function load(file, dependencies, names) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed).replace(/^import\s+[^\n]+\n/gm, "")
    .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
  const context = { ...hotSpring, ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${names.join(",")} };`, context);
  return context.api;
}
const atlas = await load("../lib/beach/atlas.ts", {}, ["CHAR_ATLAS", "CHAR_VIEW", "CHAR_ANIM"]);
const { CHAR_ATLAS, CHAR_VIEW, CHAR_ANIM } = atlas;
const { cellW: CELL_W, cellH: CELL_H } = CHAR_ATLAS;
/** 승인된 남녀 정면 원본의 턱 위치. 머리 높이는 전체 키의 약 1/3이다. */
const CHINS = [40, 38];
const frameColumn = (node) => Math.round(node.tex.offset.x * CHAR_ATLAS.cols);
const stargazing = await load("../lib/beach/stargazing.ts", { THREE }, ["STARGAZING", "claimedStargazingSlot", "applyLyingTransform", "stargazingBodyPoint"]);
const textiles = await load("../lib/beach/shelter-textiles.ts", { THREE }, ["createShelterDuvetGeometry", "createShelterPillowGeometry", "createShelterTextileMaterial"]);
const bedding = await load("../lib/beach/shelters.ts", { THREE, RoundedBoxGeometry, ...textiles }, ["SHELTERS", "BED_CAPACITY", "claimedBedSlot"]);
const benches = await load("../lib/beach/fire-benches.ts", { THREE, RoundedBoxGeometry }, ["FIRE_BENCH_SEATS", "FIRE_BENCH_REACH", "claimedFireBenchSlot"]);
const { BeachEngine } = await load("../lib/beach/engine.ts", {
  THREE, ...atlas, ...stargazing, ...bedding, ...benches, CAMPFIRE: { x: 0, z: 12 }, performance,
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
const { width, height, rgba } = decodePng(await readAssetBytes("/beach/chars-v2.png"));
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
    mapId: "beach", uyuni: null,
    scene, camera, charTex: new THREE.Texture(), daylight: { tint: [1, 1, 1] },
    shadowGeo: new THREE.PlaneGeometry(1, 1), shadowMat: new THREE.MeshBasicMaterial(),
    players: new Map(), selected: null, time: 0, self: { x: 0, z: 3 },
    ring: new THREE.Mesh(), ringMat: new THREE.MeshBasicMaterial(),
    canvas: { getBoundingClientRect: () => ({ width: 800, height: 600 }) },
    handlers: { onSelect: (value) => selected.push(value) },
    deckHeight: () => 0,
  });
  const node = engine.createPlayer({ pid: "player", nick: "파도", x: 0, z: 0, yaw, moving: false, skin: 0 });
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

function modelPool(kind = "male") {
  const instances = [];
  const pool = {
    create() {
      const root = new THREE.Group(), nested = new THREE.Group();
      // The nested, offset mesh is deliberately outside the atlas plane and the
      // forgiving 28px screen target, so selection must hit the actual model.
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.8, 0.3), new THREE.MeshBasicMaterial());
      mesh.position.set(0.85, 0.9, 0); nested.add(mesh); root.add(nested);
      const instance = {
        root, mesh, kind, states: [], disposed: 0,
        update(dt, state) {
          this.states.push({ dt, ...state });
          root.position.set(state.x, state.y ?? 0, state.z);
          root.visible = state.visible;
        },
        dispose() { this.disposed++; root.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); },
      };
      instances.push(instance);
      return instance;
    },
  };
  return { pool, instances };
}

test("a loaded male model is selected through nested geometry instead of the hidden sprite", () => {
  const { engine, node, camera, scene, selected } = fixture();
  const { pool, instances } = modelPool(); engine.avatarModels = pool;
  engine.updatePlayers(0.1); scene.updateMatrixWorld(true);
  const avatar = instances[0], point = avatar.mesh.getWorldPosition(new THREE.Vector3()).project(camera);
  const x = (point.x + 1) / 2 * 800, y = (1 - point.y) / 2 * 600;
  assert.ok(Math.abs(x - 400) > 28, "the test must not pass through the forgiving fallback target");
  assert.equal(node.sprite.visible, false);
  assert.equal(avatar.root.visible, true);
  engine.tapAt(x, y);
  assert.equal(selected.at(-1), node.data);
  assert.equal(engine.ring.visible, true);
  engine.removePlayer(node);
  assert.equal(avatar.disposed, 1);
  assert.equal(avatar.root.parent, null);
});

test("remote male/female changes release only that model and can create a fresh male instance", () => {
  const { engine, node, scene } = fixture();
  const { pool, instances } = modelPool(); engine.avatarModels = pool;
  engine.updatePlayers(0.1); const male = node.avatar;
  engine.setPlayers([{ ...node.data, skin: 1 }]); engine.updatePlayers(0.1);
  assert.equal(engine.players.get(node.data.pid), node, "the network player and selection identity are retained");
  assert.equal(male.disposed, 1); assert.equal(male.root.parent, null);
  assert.equal(node.avatar, null); assert.equal(node.sprite.visible, true);
  assert.equal(node.tex.offset.y, 0, "the female artwork is selected");
  engine.updatePlayers(0.1); assert.equal(male.disposed, 1, "female updates do not repeatedly dispose old models");
  engine.setPlayers([{ ...node.data, skin: 0 }]); engine.updatePlayers(0.1);
  assert.equal(instances.length, 2); assert.notEqual(node.avatar, male);
  assert.equal(node.avatar.root.parent, scene); assert.equal(node.sprite.visible, false);
});

test("a model that is not ready keeps a visible atlas avatar until it becomes available", () => {
  const { engine, node } = fixture();
  const { pool } = modelPool(); let ready = false;
  engine.avatarModels = { create: () => ready ? pool.create() : null };
  engine.updatePlayers(0.1);
  assert.equal(node.avatar, null); assert.equal(node.sprite.visible, true);
  ready = true; engine.updatePlayers(0.1);
  assert.ok(node.avatar); assert.equal(node.sprite.visible, false);
});

test("current and legacy selections switch between 3D genders while keeping the remote player identity", () => {
  const { engine, node, scene } = fixture();
  const male = modelPool("male"), female = modelPool("female");
  engine.avatarModels = male.pool; engine.femaleAvatarModels = female.pool;
  engine.updatePlayers(0.1);
  const firstMale = node.avatar;
  engine.setPlayers([{ ...node.data, skin: 3 }]); engine.updatePlayers(0.1);
  assert.equal(node.avatar.kind, "female");
  assert.equal(firstMale.disposed, 1);
  assert.equal(node.avatar.root.parent, scene);
  const firstFemale = node.avatar;
  engine.updatePlayers(0.1);
  assert.equal(node.avatar, firstFemale, "a stable selection retains its mixer and skeleton");
  for (const skin of [2, 1]) {
    engine.setPlayers([{ ...node.data, skin }]); engine.updatePlayers(0.1);
    assert.equal(node.avatar.kind, skin === 2 ? "male" : "female");
    assert.equal(node.sprite.visible, false);
    assert.equal(node.avatar.root.parent, scene);
    const migrated = node.avatar;
    engine.setPlayers([{ ...node.data, skin: skin === 2 ? 0 : 3 }]); engine.updatePlayers(0.1);
    assert.equal(node.avatar, migrated, "legacy and current IDs share a gender without resetting its animation");
  }
  assert.equal(firstFemale.disposed, 1);
  assert.equal(engine.players.get(node.data.pid), node);
  engine.setSkin(2); assert.equal(engine.skin, 2);
  engine.setSkin(3); assert.equal(engine.skin, 3);
  engine.setSkin(4); assert.equal(engine.skin, 0, "a retired male selection restores the ordinary male");
  engine.setSkin(5); assert.equal(engine.skin, 3, "a retired female selection restores the ordinary female");
  engine.setSkin(6); assert.equal(engine.skin, 6, "the original paper character keeps its own stable ID");
  engine.setSkin(7); assert.equal(engine.skin, 6, "unknown IDs cannot silently select another character");
  engine.removePlayer(node);
});

test("retired remote selections use ordinary male and female models on every map", () => {
  for (const mapId of ["beach", "uyuni", "bamboo", "garden"]) {
    const { engine, node } = fixture();
    engine.mapId = mapId;
    engine.avatarModels = modelPool("male").pool;
    engine.femaleAvatarModels = modelPool("female").pool;
    for (const [skin, expected] of [[4, "male"], [5, "female"]]) {
      assert.equal(engine.syncAvatar(node, skin, 0, 0).kind, expected);
      engine.setSkin(skin);
      assert.equal(engine.skin, skin === 4 ? 0 : 3);
    }
    engine.removePlayer(node);
  }
});

test("mongsil has its own pool on every map and never requests a bathrobe", () => {
  for (const mapId of ["beach", "uyuni", "bamboo", "garden", "cloudspa", "baikal"]) {
    const { engine } = fixture(); engine.mapId = mapId;
    const paper = modelPool("mongsil"); engine.paperAvatarModels = { ...paper.pool, ready: true };
    const forbidden = { canLoad: true, load() { throw new Error("paper characters must not request a GLB robe"); }, create() { throw new Error("paper characters must not switch to a GLB"); } };
    engine.avatarModels = engine.femaleAvatarModels = engine.onsenAvatarModels = engine.femaleOnsenAvatarModels = forbidden;
    engine.setSkin(6); assert.equal(engine.skin, 6);
    assert.equal(engine.baseAvatarPool(engine.avatarKind(6)), engine.paperAvatarModels);
    const local = { avatar: null }, remote = { avatar: null };
    for (const p of [{ x: 0, z: 45 }, { x: 0, z: 70 }, { x: -24, z: 38 }]) {
      assert.equal(engine.syncAvatar(local, 6, p.x, p.z).kind, "mongsil");
      assert.equal(engine.syncAvatar(remote, 6, p.x, p.z).kind, "mongsil");
    }
    assert.notEqual(local.avatar, remote.avatar);
    assert.equal(paper.instances.length, 2, "stable actors share artwork without recreating each frame");
  }
});

test("a paper download shares retries across visitors and leaves a valid row-zero sprite while pending", async () => {
  const { engine, node } = fixture();
  let ready = false, pending = false, cooling = true, loads = 0, finish;
  const paper = modelPool("mongsil");
  engine.paperAvatarModels = {
    get ready() { return ready; }, get canLoad() { return !ready && !pending && !cooling; },
    load() { loads++; pending = true; return new Promise(resolve => { finish = () => { ready = true; pending = false; resolve(); }; }); },
    create() { return ready ? paper.pool.create() : null; },
  };
  engine.setPlayers([{ ...node.data, skin: 6 }]); engine.updatePlayers(.1);
  assert.equal(node.sprite.visible, true); assert.equal(node.avatar, null);
  assert.equal(node.tex.offset.y, 1 - 1 / CHAR_ATLAS.rows);
  assert.equal(loads, 0, "the failed loader's cooldown is respected");
  cooling = false; const local = { avatar: null };
  for (let i = 0; i < 4; i++) { engine.updatePlayers(.1); engine.syncAvatar(local, 6, 0, 0); }
  assert.equal(loads, 1);
  finish(); await Promise.resolve(); engine.updatePlayers(.1); engine.syncAvatar(local, 6, 0, 0);
  assert.equal(node.avatar.kind, "mongsil"); assert.equal(node.sprite.visible, false);
  assert.notEqual(local.avatar, node.avatar); assert.equal(loads, 1);
});

test("switching between GLB and paper retains remote identity and releases only the replaced actor", () => {
  const { engine, node, scene, camera, selected } = fixture();
  const male = modelPool("male"), paper = modelPool("mongsil");
  engine.avatarModels = male.pool; engine.paperAvatarModels = paper.pool;
  engine.updatePlayers(.1); const first = node.avatar;
  engine.setPlayers([{ ...node.data, skin: 6 }]); engine.updatePlayers(.1); scene.updateMatrixWorld(true);
  const cutout = node.avatar;
  assert.equal(cutout.kind, "mongsil"); assert.equal(first.disposed, 1);
  assert.equal(engine.players.get(node.data.pid), node); assert.equal(node.shadow.visible, true);
  const point = cutout.mesh.getWorldPosition(new THREE.Vector3()).project(camera);
  engine.tapAt((point.x + 1) / 2 * 800, (1 - point.y) / 2 * 600);
  assert.equal(selected.at(-1), node.data, "the actual paper mesh remains selectable");
  engine.setPlayers([{ ...node.data, skin: 0 }]); engine.updatePlayers(.1);
  assert.equal(cutout.disposed, 1); assert.equal(cutout.root.parent, null);
  assert.equal(node.avatar.kind, "male"); assert.notEqual(node.avatar, first);
  const replacement = node.avatar; engine.removePlayer(node); assert.equal(replacement.disposed, 1); assert.equal(node.avatar, null);
});

test("paper actors receive local seated, lying and bunker transition heights and hide near an indoor camera", () => {
  const { engine, camera } = fixture(); const paper = modelPool("mongsil"); engine.paperAvatarModels = paper.pool;
  Object.assign(engine, { skin: 6, view: "third", skyRest: null, benchSeat: null, restSeat: null,
    self: { x: 2, z: 4, yaw: .4, moving: true }, deckHeight: () => -8.6, activeBunkerId: "dawn", bunkerClimbOffset: 3.4 });
  engine.selfNode = engine.createSelfAvatar(); engine.updateSelfAvatar(.1);
  const actor = engine.selfNode.avatar;
  assert.ok(Math.abs(actor.states.at(-1).y + 5.2) < 1e-9, "the ladder animation offset reaches the cutout");
  assert.equal(actor.root.visible, true); assert.equal(engine.selfNode.sprite.visible, false);
  camera.position.set(2.1, -6, 4.1); engine.updateSelfAvatar(.1);
  assert.equal(actor.root.visible, false); assert.equal(engine.selfNode.shadow.visible, false);
  camera.position.set(2, -4, 0); engine.view = "first"; engine.updateSelfAvatar(.1);
  assert.equal(actor.root.visible, false);
  engine.view = "third"; engine.bunkerClimbOffset = 0;
  engine.restSeat = { x: 2, z: 4, yaw: .4, shelterId: "dawn" }; engine.updateSelfAvatar(.1);
  assert.ok(Math.abs(actor.states.at(-1).seated.avatarY + 8.08) < 1e-9);
  engine.restSeat = null; engine.activeBunkerId = null;
  const lying = stargazing.claimedStargazingSlot({ pose: "lying", spotId: "starlight", slot: 2 });
  engine.skyRest = lying; engine.self.moving = false; engine.updateSelfAvatar(.1);
  assert.equal(actor.states.at(-1).lying, lying); assert.equal(engine.selfNode.shadow.visible, false);
});

test("remote paper characters receive canonical bed and bench poses instead of stale walking coordinates", () => {
  const { engine, node } = fixture(); engine.paperAvatarModels = modelPool("mongsil").pool;
  engine.setPlayers([{ ...node.data, skin: 6, pose: "lying", spotId: "hut-wave", slot: 0, moving: true }]); engine.updatePlayers(.1);
  const actor = node.avatar;
  assert.equal(actor.kind, "mongsil"); assert.equal(actor.states.at(-1).moving, false);
  assert.equal(actor.states.at(-1).lying.avatarY, .82); assert.equal(node.shadow.visible, false);
  engine.setPlayers([{ ...node.data, pose: "sitting", spotId: "fire-benches", slot: 4 }]); engine.updatePlayers(.1);
  assert.equal(node.avatar, actor); assert.equal(actor.states.at(-1).seated, benches.FIRE_BENCH_SEATS[4]);
  assert.equal(actor.states.at(-1).moving, false); assert.equal(actor.states.at(-1).lying, null);
});

test("the local 3D avatar hides in first person and receives the authoritative rest poses", () => {
  const { engine } = fixture();
  const { pool, instances } = modelPool(); engine.avatarModels = pool;
  Object.assign(engine, { skin: 0, view: "third", skyRest: null, benchSeat: null, restSeat: null,
    self: { x: 2, z: 4, yaw: 0.4, moving: true }, deckHeight: () => 0.18 });
  engine.selfNode = engine.createSelfAvatar();
  engine.updateSelfAvatar(0.1);
  const avatar = instances[0];
  assert.equal(avatar.states.at(-1).moving, true);
  assert.equal(avatar.states.at(-1).y, 0.18);
  assert.equal(avatar.root.visible, true); assert.equal(engine.selfNode.sprite.visible, false);
  engine.view = "first"; engine.updateSelfAvatar(0.1);
  assert.equal(avatar.root.visible, false); assert.equal(engine.selfNode.shadow.visible, false);
  engine.view = "third";
  const lying = stargazing.claimedStargazingSlot({ pose: "lying", spotId: "starlight", slot: 2 });
  engine.skyRest = lying; engine.self.moving = false; engine.updateSelfAvatar(0.1);
  assert.equal(avatar.states.at(-1).lying, lying);
  assert.equal(engine.selfNode.shadow.visible, false);
  engine.skyRest = null; engine.benchSeat = benches.FIRE_BENCH_SEATS[3]; engine.updateSelfAvatar(0.1);
  assert.equal(avatar.states.at(-1).seated, engine.benchSeat);
  assert.equal(avatar.states.at(-1).lying, null);
  engine.benchSeat = null;
  engine.restSeat = { x: 0, z: 24.7, yaw: 0, shelterId: "wave" }; engine.updateSelfAvatar(0.1);
  assert.ok(Math.abs(avatar.states.at(-1).seated.avatarY - 0.7) < 1e-10, "hut seat includes the deck height");
});

for (const [gender, skin, poolField, robeField] of [
  ["male", 0, "avatarModels", "onsenAvatarModels"],
  ["female", 3, "femaleAvatarModels", "femaleOnsenAvatarModels"],
]) test(`the ${gender} robe loads only on arrival, retains the dressed avatar while loading, and changes back on exit`, async () => {
  const { engine } = fixture();
  const male = modelPool(gender), robe = modelPool(`${gender}-onsen`);
  let complete, loads = 0, ready = false;
  Object.assign(engine, { skin, view: "third", skyRest: null, benchSeat: null, restSeat: null,
    self: { x: 6.5, z: 33.5, yaw: 0, moving: false }, [poolField]: male.pool,
    [robeField]: { get canLoad() { return !ready; }, get ready() { return ready; },
      load: () => { loads++; return new Promise(resolve => { complete = () => { ready = true; resolve(); }; }); }, create: () => ready ? robe.pool.create() : null } });
  engine.selfNode = engine.createSelfAvatar();
  engine.updateSelfAvatar(0.1);
  const dressed = engine.selfNode.avatar;
  assert.equal(loads, 0, "ordinary beach and tunnel use do not download a robe");
  Object.assign(engine.self, { x: 6, z: 45, moving: true });
  engine.updateSelfAvatar(0.1); engine.updateSelfAvatar(0.1);
  assert.equal(loads, 1);
  assert.equal(engine.selfNode.avatar, dressed, "the character remains visible while the optional outfit loads");
  complete(); await Promise.resolve();
  engine.updateSelfAvatar(0.1);
  const clothed = engine.selfNode.avatar;
  assert.equal(clothed.kind, `${gender}-onsen`); assert.equal(dressed.disposed, 1);
  assert.equal(clothed.states.at(-1).moving, true);
  engine.view = "first"; engine.updateSelfAvatar(0.1);
  assert.equal(clothed.root.visible, false, "the outfit respects first-person visibility");
  engine.self.x = 7.25; engine.updateSelfAvatar(0.1);
  assert.equal(engine.selfNode.avatar, clothed, "small movements around the threshold cannot flicker between clothes");
  engine.self.x = 8.7; engine.updateSelfAvatar(0.1);
  assert.equal(engine.selfNode.avatar.kind, gender); assert.equal(clothed.disposed, 1);
  assert.equal(loads, 1);
});

test("remote male and female outfits follow their shared positions and restore the correct gender on exit", () => {
  const { engine, node } = fixture();
  const male = modelPool("male"), robe = modelPool("male-onsen"), female = modelPool("female"), femaleRobe = modelPool("female-onsen");
  Object.assign(engine, { avatarModels: male.pool, femaleAvatarModels: female.pool,
    onsenAvatarModels: robe.pool, onsenAvatarReady: true, onsenAvatarRequested: true,
    femaleOnsenAvatarModels: femaleRobe.pool, femaleOnsenAvatarReady: true, femaleOnsenAvatarRequested: true });
  engine.setPlayers([{ ...node.data, skin: 0, x: 0, z: 45, pose: "standing", moving: false }]);
  engine.updatePlayers(1);
  const clothed = node.avatar;
  assert.equal(clothed.kind, "male-onsen");
  engine.setPlayers([{ ...node.data, skin: 3, x: 0, z: 45 }]); engine.updatePlayers(0.1);
  assert.equal(node.avatar.kind, "female-onsen"); assert.equal(clothed.disposed, 1);
  engine.setPlayers([{ ...node.data, skin: 3, x: 0, z: 20 }]); engine.updatePlayers(1);
  assert.equal(node.avatar.kind, "female");
  engine.setPlayers([{ ...node.data, skin: 0, x: 0, z: 20 }]); engine.updatePlayers(1);
  assert.equal(node.avatar.kind, "male");
});

test("an unavailable robe cannot remove the working male model and a late download cannot revive a closed room", async () => {
  const { engine } = fixture();
  const male = modelPool("male");
  let resolveLoad;
  Object.assign(engine, { avatarModels: male.pool, onsenAvatarModels: { canLoad: true, ready: false, create: () => null, load: () => new Promise(resolve => { resolveLoad = resolve; }) } });
  const node = { avatar: null };
  const dressed = engine.syncAvatar(node, 0, 0, 20);
  engine.syncAvatar(node, 0, 0, 45);
  assert.equal(node.avatar, dressed);
  engine.disposed = true; resolveLoad(); await Promise.resolve();
  assert.ok(!engine.onsenAvatarReady);
  engine.disposed = false; engine.onsenAvatarReady = true;
  engine.syncAvatar(node, 0, 0, 45);
  assert.equal(node.avatar, dressed); assert.equal(dressed.disposed, 0);
  const newlyArrived = { avatar: null };
  assert.equal(engine.syncAvatar(newlyArrived, 0, 0, 45).kind, "male", "a late base model can still replace the sprite after a robe failure");
});

for (const [gender, skin, baseField, robeField, readyField, requestedField] of [
  ["male", 0, "avatarModels", "onsenAvatarModels", "onsenAvatarReady", "onsenAvatarRequested"],
  ["female", 3, "femaleAvatarModels", "femaleOnsenAvatarModels", "femaleOnsenAvatarReady", "femaleOnsenAvatarRequested"],
]) test(`${gender} keeps its everyday outfit through a transient failure and automatically changes after a retry`, async () => {
  const { engine } = fixture(), base = modelPool(gender), robe = modelPool(`${gender}-onsen`);
  let complete, ready = false, canLoad = true, loads = 0;
  Object.assign(engine, { [baseField]: base.pool, [robeField]: {
    get canLoad() { return canLoad; }, get ready() { return ready; },
    create: () => ready ? robe.pool.create() : null,
    load() { loads++; canLoad = false; return new Promise(resolve => { complete = success => { ready = success; resolve(); }; }); },
  } });
  const local = { avatar: null }, remote = { avatar: null };
  engine.syncAvatar(local, skin, 0, 20); engine.syncAvatar(remote, skin, 0, 20);
  const everyday = local.avatar;
  engine.syncAvatar(local, skin, 0, 45); engine.syncAvatar(remote, skin, 0, 45);
  assert.equal(loads, 1, "local and remote users share one in-flight download per gender");
  complete(false); await Promise.resolve();
  assert.equal(engine[readyField], false); assert.equal(engine[requestedField], false);
  for (let frame = 0; frame < 100; frame++) engine.syncAvatar(local, skin, 0, 45);
  assert.equal(loads, 1, "pool backoff prevents a retry storm");
  assert.equal(local.avatar, everyday); assert.equal(everyday.disposed, 0);
  canLoad = true; // The actual pool permits another request after its five-second backoff.
  engine.syncAvatar(local, skin, 0, 45); engine.syncAvatar(remote, skin, 0, 45);
  assert.equal(loads, 2);
  complete(true); await Promise.resolve();
  engine.syncAvatar(local, skin, 0, 45); engine.syncAvatar(remote, skin, 0, 45);
  assert.equal(engine[readyField], true); assert.equal(local.avatar.kind, `${gender}-onsen`);
  assert.equal(remote.avatar.kind, `${gender}-onsen`); assert.equal(everyday.disposed, 1);
  engine.syncAvatar(local, skin, 0, 20);
  assert.equal(local.avatar.kind, gender, "leaving still restores the matching everyday character");
});

test("remote 3D avatars receive bed and bench claims without an active walking animation", () => {
  const { engine, node } = fixture();
  const { pool } = modelPool(); engine.avatarModels = pool;
  engine.setPlayers([{ ...node.data, skin: 0, pose: "lying", spotId: "hut-wave", slot: 0, moving: true }]);
  engine.updatePlayers(0.1);
  const bedState = node.avatar.states.at(-1);
  assert.equal(bedState.moving, false); assert.equal(bedState.lying.spotId, "hut-wave");
  assert.equal(bedState.lying.avatarY, 0.82); assert.equal(bedState.lying.incline, 0.25);
  engine.setPlayers([{ ...node.data, pose: "sitting", spotId: "fire-benches", slot: 4 }]);
  engine.updatePlayers(0.1);
  const benchState = node.avatar.states.at(-1);
  assert.equal(benchState.lying, null); assert.equal(benchState.moving, false);
  assert.equal(benchState.seated, benches.FIRE_BENCH_SEATS[4]);
  assert.equal(benchState.x, benchState.seated.x); assert.equal(benchState.z, benchState.seated.z);
});

test("a seated pixel avatar gains depth on the first lying frame without changing another actor", async () => {
  let row = 0;
  const context = {
    clearRect() {},
    drawImage(_image, _x, y) { row = y / CELL_H; },
    getImageData() {
      const data = new Uint8ClampedArray(CELL_W * CELL_H * 4);
      for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) data.set(pixel(0, row, x, y), (y * CELL_W + x) * 4);
      return { width: CELL_W, height: CELL_H, data };
    },
  };
  const { PixelAvatarDepth } = await load("../lib/beach/pixel-avatar-depth.ts", {
    THREE, ...atlas, document: { createElement: () => ({ getContext: () => context }) },
  }, ["PixelAvatarDepth"]);
  const { engine, node } = fixture();
  engine.charTex.image = { width, height };
  engine.pixelDepth = new PixelAvatarDepth(engine.charTex, 1.8);
  Object.assign(engine, { skin: 1, view: "third", skyRest: null, restSeat: null,
    benchSeat: benches.FIRE_BENCH_SEATS[0], self: { x: 2, z: 4, yaw: 0, moving: false } });
  engine.selfNode = engine.createSelfAvatar();
  const sprite = engine.selfNode.sprite;
  assert.notEqual(sprite.geometry, node.sprite.geometry, "each actor owns its deformable front plane");
  engine.updateSelfAvatar(0.1);
  assert.equal(sprite.geometry.userData.seated, true);
  engine.benchSeat = null;
  engine.skyRest = stargazing.claimedStargazingSlot({ pose: "lying", spotId: "starlight", slot: 0 });
  engine.updateSelfAvatar(0.1);
  assert.equal(sprite.geometry.userData.seated, false);
  const side = sprite.getObjectByName("lying-pixel-depth");
  assert.ok(side?.visible);
  for (let i = 0; i < sprite.geometry.attributes.position.count; i++) {
    assert.ok(Math.abs(sprite.geometry.attributes.position.getZ(i) - side.geometry.boundingBox.max.z) < 1e-7,
      "unfolding the seated sprite happens before its raised front meets the bevel");
  }
  assert.equal(node.sprite.geometry.attributes.position.getZ(0), 0, "the standing actor remains flat");
  assert.equal(side.material.map, engine.selfNode.tex);
  assert.equal(engine.selfNode.tex.offset.x, 0);
  assert.equal(engine.selfNode.tex.offset.y, 0, "both surfaces sample the female front idle frame");
  engine.skyRest = null; engine.updateSelfAvatar(0.1);
  assert.equal(side.visible, false);
  assert.equal(sprite.geometry.attributes.position.getZ(0), 0);
  engine.pixelDepth.dispose();
  engine.removePlayer(node);
  sprite.geometry.dispose(); engine.selfNode.mat.dispose(); engine.selfNode.tex.dispose();
});

test("atlas downloads finishing after the room closes release textures without rebuilding actors", async () => {
  const pending = [];
  let depthPools = 0, selfNodes = 0;
  class TextureLoader {
    loadAsync() { return new Promise((resolve) => pending.push(resolve)); }
  }
  const { BeachEngine: DelayedEngine } = await load("../lib/beach/engine.ts", {
    THREE: { ...THREE, TextureLoader }, ...atlas, CAMPFIRE: { x: 0, z: 12 },
    PixelAvatarDepth: class { constructor() { depthPools++; } },
  }, ["BeachEngine"]);
  const engine = Object.assign(Object.create(DelayedEngine.prototype), {
    disposed: false, scene: new THREE.Scene(),
    createSelfAvatar() { selfNodes++; return {}; },
  });
  const loading = engine.loadAtlases();
  assert.equal(pending.length, 2);
  const chars = new THREE.Texture(), props = new THREE.Texture();
  let charsReleased = 0, propsReleased = 0;
  chars.addEventListener("dispose", () => charsReleased++);
  props.addEventListener("dispose", () => propsReleased++);
  engine.disposed = true; // The scene was already disposed while both requests were in flight.
  pending[0](chars); pending[1](props);
  await loading;
  assert.equal(charsReleased, 1);
  assert.equal(propsReleased, 1);
  assert.equal(depthPools, 0);
  assert.equal(selfNodes, 0);
  assert.equal(engine.scene.children.length, 0);
  assert.equal(engine.charTex, undefined);
  assert.equal(engine.propTex, undefined);
});
