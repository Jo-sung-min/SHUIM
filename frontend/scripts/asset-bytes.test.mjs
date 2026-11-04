import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createAssetReader } from "./asset-bytes-fixture.mjs";

const bytes = Buffer.from("reviewed model bytes");
const key = "beach/models/example.glb";
const record = { key, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
const manifest = { baseUrl: "https://cdn.sorow.co.kr", files: [record] };
const missing = async () => { throw Object.assign(new Error("not present locally"), { code: "ENOENT" }); };
const response = (data = bytes) => new Response(data, { headers: { "content-length": String(data.length) } });

test("existing local assets are verified without requesting the CDN", async () => {
  let requests = 0;
  const read = createAssetReader({ manifest, readLocal: async url => {
    assert.ok(url.pathname.endsWith(`/public/${key}`));
    return bytes;
  }, fetchAsset: async () => { requests++; } });
  assert.deepEqual(await read(`/${key}`), bytes);
  assert.equal(requests, 0);
});

test("removed assets use the manifest CDN once with independent in-memory results", async () => {
  let requests = 0;
  const read = createAssetReader({ manifest, readLocal: missing, fetchAsset: async (url, options) => {
    assert.equal(url.href, `https://cdn.sorow.co.kr/${key}`);
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    requests++;
    return response();
  } });
  const [first, second] = await Promise.all([read(key), read(`/${key}`)]);
  assert.deepEqual(first, bytes);
  first[0] = 0;
  assert.deepEqual(second, bytes);
  assert.deepEqual(await read(key), bytes);
  assert.equal(requests, 1);
});

test("unexpected paths never read disk or contact a host outside the manifest", async () => {
  let reads = 0;
  const read = createAssetReader({ manifest, readLocal: async () => { reads++; }, fetchAsset: async () => { reads++; } });
  for (const path of ["../private.env", "/beach/../private.env", "https://example.com/a", "//example.com/a", "beach/%2e%2e/a", "beach/a?x=1", "beach/a#part", "beach\\a", "beach/missing.glb"]) {
    await assert.rejects(read(path));
  }
  assert.equal(reads, 0);
});

test("corrupt or unreadable local assets fail without falling back to a different copy", async () => {
  let requests = 0;
  const fetchAsset = async () => { requests++; return response(); };
  const bad = createAssetReader({ manifest, readLocal: async () => Buffer.alloc(bytes.length), fetchAsset });
  await assert.rejects(bad(key), /integrity/);
  const denied = createAssetReader({ manifest, readLocal: async () => { throw Object.assign(new Error("access denied"), { code: "EACCES" }); }, fetchAsset });
  await assert.rejects(denied(key), /access denied/);
  assert.equal(requests, 0);
});

test("CDN HTTP, length and same-size hash failures are rejected and can be retried", async () => {
  const replies = [new Response("missing", { status: 404 }), response(Buffer.from("short")), response(Buffer.alloc(bytes.length)), response()];
  let requests = 0;
  const read = createAssetReader({ manifest, readLocal: missing, fetchAsset: async () => { requests++; return replies.shift(); } });
  await assert.rejects(read(key), /404/);
  await assert.rejects(read(key), /size/);
  await assert.rejects(read(key), /integrity/);
  assert.deepEqual(await read(key), bytes);
  assert.equal(requests, 4);
});

test("unreviewed hashes and non-HTTPS manifest locations fail before network access", async () => {
  assert.throws(() => createAssetReader({ manifest: { ...manifest, baseUrl: "http://cdn.sorow.co.kr" } }), /HTTPS/);
  const read = createAssetReader({ manifest: { ...manifest, files: [{ ...record, sha256: "unknown" }] }, readLocal: missing });
  await assert.rejects(read(key), /reviewed manifest/);
});
