import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const typed = await readFile(new URL("../lib/photo-edit.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed).replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b)/g, "");
const context = { ArrayBuffer, Uint8Array, DataView, Math, Number, Error };
vm.runInNewContext(`${source}\nglobalThis.photo = { calculatePhotoCrop, photoOutputSize, inspectPhotoHeader, validatePhotoDimensions, normalizeRotation, drawPhotoCrop, loadEditablePhoto };`, context);
const { calculatePhotoCrop, photoOutputSize, inspectPhotoHeader, validatePhotoDimensions, normalizeRotation, drawPhotoCrop, loadEditablePhoto } = context.photo;

test("a square profile crop centers the photograph without stretching", () => {
  const crop = calculatePhotoCrop(1200, 800, 0, 1, 1, { x: 0, y: 0 });
  assert.equal(crop.width, 800);
  assert.equal(crop.height, 800);
  assert.equal(crop.x, 200);
  assert.equal(crop.y, 0);
});

test("quarter-turn rotation changes the crop axes before cover sizing", () => {
  const crop = calculatePhotoCrop(1600, 900, 90, 4 / 5, 1, { x: 0, y: 0 });
  assert.equal(crop.rotatedWidth, 900);
  assert.equal(crop.rotatedHeight, 1600);
  assert.equal(crop.width, 900);
  assert.equal(crop.height, 1125);
  assert.equal(crop.y, 237.5);
  assert.equal(normalizeRotation(450), 90);
  assert.equal(normalizeRotation(-90), 270);
});

test("moving the photograph reveals the opposite edge and never reveals empty pixels", () => {
  const right = calculatePhotoCrop(1000, 800, 0, 1, 2, { x: 1, y: 1 });
  const left = calculatePhotoCrop(1000, 800, 0, 1, 2, { x: -1, y: -1 });
  assert.equal(right.x, 0); assert.equal(right.y, 0);
  assert.equal(left.x + left.width, 1000);
  assert.equal(left.y + left.height, 800);
  assert.equal(right.width, 400);
});

test("all supported ratios, rotations, zooms and extreme drags stay inside the photo", () => {
  for (const [width, height] of [[500, 1500], [2048, 1024], [13, 7]]) {
    for (const angle of [0, 90, 180, 270]) for (const ratio of [.25, .8, 1, 4]) for (const zoom of [1, 2.3, 4]) for (const x of [-10, 0, 10]) for (const y of [-10, 0, 10]) {
      const crop = calculatePhotoCrop(width, height, angle, ratio, zoom, { x, y });
      assert.ok(crop.x >= 0 && crop.y >= 0);
      assert.ok(crop.x + crop.width <= crop.rotatedWidth + 1e-8);
      assert.ok(crop.y + crop.height <= crop.rotatedHeight + 1e-8);
      assert.ok(Math.abs(crop.width / crop.height - ratio) < 1e-8);
    }
  }
});

test("output sizing caps memory and never enlarges a small crop", () => {
  const large = photoOutputSize({ width: 2048, height: 2560 });
  assert.equal(large.width, 1280); assert.equal(large.height, 1600);
  const small = photoOutputSize({ width: 240, height: 300 });
  assert.equal(small.width, 240); assert.equal(small.height, 300);
  assert.throws(() => validatePhotoDimensions(8000, 6000), /해상도/);
  assert.throws(() => validatePhotoDimensions(20000, 1), /해상도/);
  for (const value of [NaN, Infinity, 0, -1, 0.5]) assert.throws(() => validatePhotoDimensions(value, 100), /크기/);
});

test("the original aspect keeps the entire panorama instead of silently cropping it", () => {
  const landscape = calculatePhotoCrop(2000, 200, 0, 10, 1, { x: 0, y: 0 });
  assert.equal(landscape.width, 2000); assert.equal(landscape.height, 200);
  assert.equal(landscape.x, 0); assert.equal(landscape.y, 0);
  const portrait = calculatePhotoCrop(2000, 200, 90, .1, 1, { x: 0, y: 0 });
  assert.equal(portrait.width, 200); assert.equal(portrait.height, 2000);
});

test("header checks recognize common camera formats before pixel decoding", () => {
  const png = new Uint8Array(24); png.set([0x89, 80, 78, 71], 0); png.set([73, 72, 68, 82], 12);
  new DataView(png.buffer).setUint32(16, 800); new DataView(png.buffer).setUint32(20, 600);
  assert.equal(inspectPhotoHeader(png.buffer).width, 800);
  const gif = new Uint8Array(10); gif.set([...Buffer.from("GIF89a")]); new DataView(gif.buffer).setUint16(6, 640, true); new DataView(gif.buffer).setUint16(8, 480, true);
  assert.equal(inspectPhotoHeader(gif.buffer).height, 480);
  const jpeg = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 2, 88, 3, 32, 1, 1, 17, 0]);
  assert.equal(inspectPhotoHeader(jpeg.buffer).width, 800);
  const webp = new Uint8Array(30); webp.set([...Buffer.from("RIFF")]); webp.set([...Buffer.from("WEBPVP8X")], 8); webp[24] = 255; webp[25] = 1; webp[27] = 255;
  assert.equal(inspectPhotoHeader(webp.buffer).width, 512);
  assert.equal(inspectPhotoHeader(webp.buffer).height, 256);
});

test("oversized, malformed and non-photo input is rejected without decoding", async () => {
  const png = new Uint8Array(24); png.set([0x89, 80, 78, 71], 0); png.set([73, 72, 68, 82], 12);
  new DataView(png.buffer).setUint32(16, 20000); new DataView(png.buffer).setUint32(20, 20000);
  assert.throws(() => inspectPhotoHeader(png.buffer), /해상도/);
  assert.throws(() => inspectPhotoHeader(new Uint8Array([255, 216, 255]).buffer), /크기/);
  assert.throws(() => inspectPhotoHeader(new TextEncoder().encode("<svg width='600' height='400'></svg>").buffer), /크기/);
  await assert.rejects(loadEditablePhoto({ size: 21 * 1024 * 1024 }), /20MB/);
  await assert.rejects(loadEditablePhoto({ size: 100, type: "image/svg+xml" }), /JPG/);
});

test("rendering applies crop scale, translation and rotation to the actual source", () => {
  const operations = [];
  const drawing = Object.fromEntries(["save", "fillRect", "scale", "translate", "rotate", "drawImage", "restore"].map((name) => [name, (...args) => operations.push([name, ...args])]));
  const photo = { width: 1200, height: 800 };
  const crop = calculatePhotoCrop(1200, 800, 90, 1, 1, { x: 0, y: 0 });
  drawPhotoCrop(drawing, photo, crop, 400, 400);
  assert.deepEqual(operations.find((operation) => operation[0] === "scale"), ["scale", .5, .5]);
  assert.deepEqual(operations.find((operation) => operation[0] === "rotate"), ["rotate", Math.PI / 2]);
  assert.deepEqual(operations.find((operation) => operation[0] === "drawImage"), ["drawImage", photo, -600, -400]);
  assert.equal(operations.at(-1)[0], "restore");
});
