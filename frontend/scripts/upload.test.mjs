import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const typed = await readFile(new URL("../lib/upload.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed)
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b)/g, "");
const photoSource = stripTypeScriptTypes(await readFile(new URL("../lib/photo-edit.ts", import.meta.url), "utf8"))
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b)/g, "");
const jpeg = (size = 30) => new File([new Uint8Array([255, 216, 255, 192, 0, 11, 8, 1, 44, 1, 144, 1, 1, 17, 0]), new Uint8Array(size - 15)], "photo.jpg", { type: "image/jpeg" });
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const tick = () => new Promise((resolve) => setImmediate(resolve));

function setup(overrides = {}) {
  const state = { consent: 0, closed: 0, urls: [], revoked: [], requests: [], xhrs: [], canvases: [], draws: [] };
  const bitmap = () => ({ width: 400, height: 300, close() { state.closed++; } });
  class FakeImage {
    naturalWidth = 400;
    naturalHeight = 300;
    set src(value) { if (value) queueMicrotask(() => this.onload?.()); }
  }
  class Xhr {
    upload = {};
    headers = {};
    status = 200;
    constructor() { state.xhrs.push(this); }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(key, value) { this.headers[key] = value; }
    send(blob) {
      this.blob = blob;
      if (!overrides.hangUpload) queueMicrotask(() => {
        this.upload.onprogress?.({ lengthComputable: true, loaded: blob.size, total: blob.size });
        this.onload?.();
      });
    }
    abort() { this.aborted = true; this.onabort?.(); }
  }
  const context = {
    Blob, File, Uint8Array, Error, AbortController, setTimeout, clearTimeout,
    window: { createImageBitmap: true },
    createImageBitmap: async () => bitmap(),
    Image: FakeImage,
    URL: {
      createObjectURL() { const url = `blob:photo-${state.urls.length}`; state.urls.push(url); return url; },
      revokeObjectURL(url) { state.revoked.push(url); },
    },
    document: { createElement() {
      const canvas = {
        getContext: () => ({ drawImage(...args) { state.draws.push(args.slice(1)); } }),
        toBlob(callback, type) { callback(new Blob(["encoded"], { type })); },
      };
      state.canvases.push(canvas);
      return canvas;
    } },
    requireCommunityConsent: async () => { state.consent++; },
    fetch: async (url, options) => {
      state.requests.push({ url, options });
      return response({ uploadUrl: "https://upload.example/photo", publicUrl: "https://photo.example/photo", key: "photo", headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=300" } });
    },
    XMLHttpRequest: Xhr,
    ...overrides,
  };
  vm.runInNewContext(`${photoSource}\n${source}\nglobalThis.api = { uploadImage, shrinkImage, uploadAvailable };`, context);
  return { state, context, ...context.api };
}

test("empty, oversized, unsupported and renamed non-photo files fail before consent or upload", async () => {
  const { uploadImage, state } = setup();
  for (const file of [
    new File([], "empty.jpg", { type: "image/jpeg" }),
    { size: 21 * 1024 * 1024, type: "image/jpeg" },
    new File(["svg"], "photo.svg", { type: "image/svg+xml" }),
    new File(["not actually an image"], "photo.jpg", { type: "image/jpeg" }),
  ]) await assert.rejects(uploadImage(file), /사진/);
  assert.equal(state.consent, 0);
  assert.equal(state.requests.length, 0);
});

test("small photos are re-encoded to remove original metadata and close the bitmap", async () => {
  const { shrinkImage, state } = setup();
  const file = jpeg();
  const encoded = await shrinkImage(file);
  assert.notEqual(encoded, file);
  assert.equal(await encoded.text(), "encoded");
  assert.equal(state.closed, 1);
  assert.equal(state.canvases.length, 1);
});

test("oversized dimensions are rejected from the header before decoding or consent", async () => {
  let decoded = false;
  const { uploadImage, state } = setup({ createImageBitmap: async () => { decoded = true; throw new Error("must not decode"); } });
  const png = new Uint8Array(24);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  png.set([73, 72, 68, 82], 12);
  const view = new DataView(png.buffer);
  view.setUint32(16, 10000); view.setUint32(20, 10000);
  await assert.rejects(uploadImage(new File([png], "large.png", { type: "image/png" })), /해상도/);
  assert.equal(decoded, false);
  assert.equal(state.consent, 0);
});

test("a failed consent connection produces a friendly error without starting upload", async () => {
  const { uploadImage, state } = setup({ requireCommunityConsent: async () => { throw new TypeError("Failed to fetch"); } });
  await assert.rejects(uploadImage(jpeg()), /사진 첨부 안내/);
  assert.equal(state.requests.length, 0);
});

test("large photos are resized and release both bitmap and canvas buffers", async () => {
  let closed = 0;
  const { shrinkImage, state } = setup({ createImageBitmap: async () => ({ width: 4000, height: 3000, close() { closed++; } }) });
  const result = await shrinkImage(jpeg());
  assert.equal(result.type, "image/webp");
  assert.deepEqual(state.draws[0], [0, 0, 1600, 1200]);
  assert.equal(closed, 1);
  assert.equal(state.canvases[0].width, 0);
  assert.equal(state.canvases[0].height, 0);
});

test("fallback decoder revokes object URLs on success and failure", async () => {
  const success = setup({ window: {} });
  await success.shrinkImage(jpeg());
  assert.deepEqual(success.state.revoked, success.state.urls);
  class BrokenImage { set src(value) { if (value) queueMicrotask(() => this.onerror?.()); } }
  const failed = setup({ window: {}, Image: BrokenImage });
  await assert.rejects(failed.shrinkImage(jpeg()), /사진을 읽지/);
  assert.deepEqual(failed.state.revoked, failed.state.urls);
});

test("cancelled fallback decoding releases its object URL", async () => {
  class HangingImage { set src(_value) {} }
  const { shrinkImage, state } = setup({ window: {}, Image: HangingImage });
  const controller = new AbortController();
  const pending = shrinkImage(jpeg(), controller.signal);
  await tick();
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.deepEqual(state.revoked, state.urls);
  assert.equal(state.revoked.length, 1);
});

test("a bitmap that finishes after cancellation is still closed", async () => {
  let finish;
  let closed = 0;
  const { shrinkImage } = setup({ createImageBitmap: () => new Promise((resolve) => { finish = resolve; }) });
  const controller = new AbortController();
  const pending = shrinkImage(jpeg(), controller.signal);
  await tick();
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  finish({ width: 400, height: 300, close() { closed++; } });
  await tick();
  assert.equal(closed, 1);
});

test("the legacy callback receives 100 only after attachment succeeds", async () => {
  const { uploadImage, state } = setup();
  const progress = [];
  const result = await uploadImage(jpeg(), (value) => progress.push(value));
  assert.equal(result.url, "https://photo.example/photo");
  assert.equal(result.bytes, 7);
  assert.deepEqual(progress, [0, 99, 100]);
  assert.equal(state.xhrs[0].headers["Cache-Control"], "public, max-age=300");
  assert.equal(JSON.parse(state.requests[0].options.body).size, 7);
});

test("cancelling an active attachment aborts transport and never reports completion", async () => {
  const { uploadImage, state } = setup({ hangUpload: true });
  const controller = new AbortController();
  const progress = [];
  const pending = uploadImage(jpeg(), { signal: controller.signal, onProgress: (value) => progress.push(value) });
  await tick();
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(state.xhrs[0].aborted, true);
  assert.equal(progress.includes(100), false);
  assert.equal(state.xhrs[0].onload, null);
});

test("stalled attachments have a bounded timeout and a friendly retry message", async () => {
  const { uploadImage, state } = setup({ hangUpload: true });
  await assert.rejects(uploadImage(jpeg(), { timeoutMs: 15 }), /시간이 걸리고/);
  assert.equal(state.xhrs[0].aborted, true);
});

test("storage errors and malformed success responses never leak infrastructure wording", async () => {
  for (const fetch of [async () => response({ error: "S3 bucket CORS failure" }, 503), async () => response({ configured: true })]) {
    const { uploadImage, state } = setup({ fetch });
    await assert.rejects(uploadImage(jpeg()), (error) => /사진/.test(error.message) && !/S3|CORS|bucket|서버/.test(error.message));
    assert.equal(state.xhrs.length, 0);
  }
});

test("large animated GIFs are rejected before a signed upload is requested", async () => {
  const { uploadImage, state } = setup();
  const gif = new File(["GIF89a", new Uint8Array([1, 0, 1, 0]), new Uint8Array(5 * 1024 * 1024)], "animation.gif", { type: "image/gif" });
  await assert.rejects(uploadImage(gif), /5MB/);
  assert.equal(state.requests.length, 0);
});

test("availability requires a successful response and an explicit true value", async () => {
  for (const [body, status] of [[{ configured: true }, 503], [{ configured: "true" }, 200], [{}, 200]]) {
    assert.equal(await setup({ fetch: async () => response(body, status) }).uploadAvailable(), false);
  }
});
