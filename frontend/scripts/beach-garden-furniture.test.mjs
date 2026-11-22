import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { hotSpring } from "./beach-world-fixture.mjs";

async function load(file, dependencies, names) {
  const source = stripTypeScriptTypes(await readFile(new URL(`../lib/beach/${file}.ts`, import.meta.url), "utf8"), { mode: "transform" })
    .replace(/^import\s+[\s\S]*?from\s+["'][^"']+["'];?\r?$/gm, "").replace(/\bexport\s+(?=function\b|const\b|class\b)/g, "");
  return vm.runInNewContext(`${source}\n({${names.join(",")}})`, { THREE, ...dependencies });
}

const layout = await load("garden-layout", hotSpring, ["GARDEN_POND_BENCHES", "GROUND_Y", "HALL", "HALL_BENCH_HEIGHT", "HALL_TIERS",
  "WINDOW_CHAIR_OFFSET", "WISTERIA_BENCH_ID", "GARDEN_PHOTO_ZONE", "LAKE", "GARDEN_SEATS"]);
const courts = await load("garden-photo-zone", layout, ["SPRING_PHOTO_COURTS"]);

test("mobile GLBs stream sequentially, share chair geometry and meet the four existing seat anchors", async () => {
  globalThis.self ??= globalThis;
  globalThis.createImageBitmap = async blob => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    assert.deepEqual([...bytes.subarray(0, 2)], [255, 216]);
    return { width: 1, height: 1, close() {} };
  };
  const requests = [];
  class LocalLoader extends GLTFLoader {
    loadAsync(url) {
      const request = readFile(new URL(`../public${url}`, import.meta.url)).then(bytes => {
        assert.ok(bytes.length < 1_000_000, url);
        return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
      });
      requests.push(request);
      return request;
    }
  }
  const { GardenFurniture } = await load("garden-furniture", { ...layout, ...courts, GLTFLoader: LocalLoader, MeshoptDecoder }, ["GardenFurniture"]);
  const scene = new THREE.Scene();
  let chairs = 0, bench = 0;
  const furniture = new GardenFurniture(scene, () => chairs++, () => bench++);
  for (let i = 0; i < 3; i++) {
    furniture.update(0, -11); furniture.update(0, -11);
    assert.equal(requests.length, i + 1);
    await requests[i]; await new Promise(resolve => setImmediate(resolve));
  }
  furniture.update(0, -11); assert.equal(requests.length, 3);
  assert.equal(bench, 1); assert.equal(chairs, 0);
  furniture.update(0, 62); await requests[3]; await new Promise(resolve => setImmediate(resolve));
  assert.equal(chairs, 1); scene.updateMatrixWorld(true);
  const twins = [1, 2].map(i => scene.getObjectByName(`garden-reading-chair-${i}`));
  assert.equal(twins[0].children[0].geometry, twins[1].children[0].geometry);
  const pergola = scene.getObjectByName("garden-wisteria-bench-1");
  for (const seat of layout.GARDEN_SEATS.filter(s => s.spotId === layout.WISTERIA_BENCH_ID ||
    (s.spotId === "hall-tier-1" && Math.abs(s.x - layout.HALL.x) === layout.WINDOW_CHAIR_OFFSET))) {
    const object = seat.spotId === layout.WISTERIA_BENCH_ID ? pergola : twins[Number(seat.x > layout.HALL.x)];
    const ray = new THREE.Raycaster(new THREE.Vector3(seat.x, seat.avatarY + .12, seat.z), new THREE.Vector3(0, -1, 0), 0, .24);
    const hit = ray.intersectObject(object, true)[0];
    assert.ok(hit && Math.abs(hit.point.y - seat.avatarY) < .015, seat.id);
  }
  let disposed = 0; twins[0].children[0].geometry.addEventListener("dispose", () => disposed++);
  furniture.dispose(); furniture.dispose();
  assert.equal(disposed, 1); assert.equal(scene.children.length, 0);
});
