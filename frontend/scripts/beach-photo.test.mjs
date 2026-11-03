import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

async function load(overrides = {}) {
  const typed = await readFile(new URL("../lib/beach/photo.ts", import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed).replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b)/g, "");
  const context = { Blob, File, URL, Error, Date, ...overrides };
  vm.runInNewContext(`${source}\nglobalThis.api = { captureScenePhoto, createBeachPhoto, canSharePhoto, shareBeachPhoto, downloadBeachPhoto };`, context);
  return context.api;
}

function captureFixture(width = 3840, height = 2160, result = new Blob(["png"], { type: "image/png" })) {
  const events = [];
  let encoded;
  const source = { width, height };
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage(...args) { events.push(["copy", ...args]); } }), toBlob(callback, type) { events.push(["encode", type]); encoded = () => callback(result); } };
  return { source, canvas, events, renderer: { domElement: source, render: (scene, camera) => events.push(["render", scene, camera]) }, document: { createElement: (tag) => { assert.equal(tag, "canvas"); return canvas; } }, finish: () => encoded() };
}

test("snapshot renders then copies the current frame synchronously before async PNG encoding", async () => {
  const fixture = captureFixture();
  const api = await load({ document: fixture.document });
  const scene = {}, camera = {};
  const pending = api.captureScenePhoto(fixture.renderer, scene, camera);
  assert.deepEqual(fixture.events.map((event) => event[0]), ["render", "copy", "encode"]);
  assert.deepEqual(fixture.events[0], ["render", scene, camera]);
  assert.deepEqual(fixture.events[1], ["copy", fixture.source, 0, 0, 1920, 1080]);
  assert.equal(fixture.events[2][1], "image/png");
  fixture.finish();
  assert.equal((await pending).type, "image/png");
});

test("portrait snapshots preserve ratio and small canvases never upscale", async () => {
  for (const [w, h, outW, outH] of [[1800, 3200, 1080, 1920], [390, 844, 390, 844]]) {
    const f = captureFixture(w, h);
    const api = await load({ document: f.document });
    const pending = api.captureScenePhoto(f.renderer, {}, {});
    assert.equal(f.canvas.width, outW);
    assert.equal(f.canvas.height, outH);
    f.finish();
    await pending;
  }
});

test("snapshot failures reject cleanly for empty canvas, missing context, failed encoding and copy", async () => {
  const empty = captureFixture(0, 50);
  const api = await load({ document: empty.document });
  await assert.rejects(api.captureScenePhoto(empty.renderer, {}, {}), /준비/);
  const missing = captureFixture();
  missing.canvas.getContext = () => null;
  await assert.rejects((await load({ document: missing.document })).captureScenePhoto(missing.renderer, {}, {}), /저장/);
  const broken = captureFixture(100, 100, null);
  const pending = (await load({ document: broken.document })).captureScenePhoto(broken.renderer, {}, {});
  broken.finish();
  await assert.rejects(pending, /다시/);
  const tainted = captureFixture();
  tainted.canvas.getContext = () => ({ drawImage() { throw new Error("SecurityError"); } });
  await assert.rejects((await load({ document: tainted.document })).captureScenePhoto(tainted.renderer, {}, {}), /다시/);
});

test("photo creates a real image File and releases its preview URL exactly once", async () => {
  const made = [], revoked = [];
  const api = await load({ URL: { createObjectURL: (file) => { made.push(file); return "blob:snapshot"; }, revokeObjectURL: (url) => revoked.push(url) } });
  const photo = api.createBeachPhoto(new Blob(["image"], { type: "image/png" }), new Date("2026-11-04T12:34:56.000Z"));
  assert.equal(photo.file.name, "sorow-2026-11-04T12-34-56-000Z.png");
  assert.equal(photo.file.type, "image/png");
  assert.equal(made[0], photo.file);
  photo.dispose(); photo.dispose();
  assert.deepEqual(revoked, ["blob:snapshot"]);
  assert.throws(() => api.createBeachPhoto(new Blob([])), /다시/);
});

test("native file share is invoked in the click call stack with only a prepared file", async () => {
  const api = await load();
  const file = new File(["image"], "sorow.png", { type: "image/png" });
  const calls = [];
  const browser = { canShare: (data) => { assert.deepEqual(Object.keys(data), ["files"]); return data.files[0] === file; }, share: (data) => { calls.push(data); return Promise.resolve(); } };
  const pending = api.shareBeachPhoto(file, browser, true);
  assert.equal(calls.length, 1, "share must run before the first asynchronous yield");
  assert.equal(calls[0].files[0], file);
  assert.equal("url" in calls[0], false, "share the captured image, not a page link");
  assert.equal(await pending, "shared");
});

test("unsupported or insecure sharing falls back; cancellation is quiet and other failures are actionable", async () => {
  const api = await load();
  const file = new File(["image"], "sorow.png", { type: "image/png" });
  const browser = { canShare: () => true, share: () => { throw Object.assign(new Error("cancel"), { name: "AbortError" }); } };
  assert.equal(await api.shareBeachPhoto(file, browser, true), "cancelled");
  assert.equal(await api.shareBeachPhoto(file, browser, false), "unsupported");
  assert.equal(await api.shareBeachPhoto(file, {}, true), "unsupported");
  assert.equal(await api.shareBeachPhoto(file, { ...browser, canShare: () => false }, true), "unsupported");
  assert.equal(api.canSharePhoto(file, { ...browser, canShare: () => { throw new Error("blocked"); } }, true), false);
  await assert.rejects(api.shareBeachPhoto(file, { ...browser, share: () => Promise.reject(new Error("denied")) }, true), /사진을 저장/);
});

test("download uses the prepared image filename without an external request", async () => {
  const events = [];
  const anchor = { click: () => events.push("click"), remove: () => events.push("remove") };
  const api = await load({ document: { createElement: (tag) => { assert.equal(tag, "a"); return anchor; }, body: { appendChild: (el) => { assert.equal(el, anchor); events.push("append"); } } } });
  api.downloadBeachPhoto({ file: { name: "sorow.png" }, url: "blob:local-photo" });
  assert.equal(anchor.href, "blob:local-photo");
  assert.equal(anchor.download, "sorow.png");
  assert.deepEqual(events, ["append", "click", "remove"]);
});
