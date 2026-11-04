import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const publicRoot = new URL("../public/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("../public-assets.manifest.json", import.meta.url), "utf8"));

/** Real asset checks use the reviewed CDN bytes without recreating files on disk. */
export function createAssetReader({ manifest, readLocal = readFile, fetchAsset = fetch }) {
  const base = new URL(manifest.baseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
    throw new Error("Asset manifest requires a public HTTPS base URL");
  }
  const files = new Map(manifest.files.map(file => [file.key, file]));
  const pending = new Map();

  function checked(bytes, record) {
    const buffer = Buffer.from(bytes);
    if (buffer.length !== record.bytes || createHash("sha256").update(buffer).digest("hex") !== record.sha256) {
      throw new Error(`Asset integrity check failed: ${record.key}`);
    }
    return buffer;
  }

  async function load(record) {
    try {
      return checked(await readLocal(new URL(record.key, publicRoot)), record);
    } catch (error) {
      // A corrupt local copy or unreadable file must not be silently ignored.
      if (error.code !== "ENOENT") throw error;
    }
    const response = await fetchAsset(new URL(record.key, `${base.href.replace(/\/$/, "")}/`), {
      redirect: "error", signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Asset download failed (${response.status}): ${record.key}`);
    const length = response.headers.get("content-length");
    if (length !== null && Number(length) !== record.bytes) throw new Error(`Asset size check failed: ${record.key}`);
    return checked(await response.arrayBuffer(), record);
  }

  return async function readAssetBytes(path) {
    if (typeof path !== "string") throw new TypeError("Asset path must be a string");
    const key = path.replace(/^\//, "");
    if (!key || /[\\?#%:]/.test(key) || key.split("/").some(part => !part || part === "." || part === "..")) {
      throw new Error(`Invalid asset path: ${path}`);
    }
    const record = files.get(key);
    if (!record || !Number.isSafeInteger(record.bytes) || record.bytes <= 0 || !/^[a-f0-9]{64}$/.test(record.sha256)) {
      throw new Error(`Asset is missing from the reviewed manifest: ${key}`);
    }
    let bytes = pending.get(key);
    if (!bytes) {
      bytes = load(record).catch(error => { pending.delete(key); throw error; });
      pending.set(key, bytes);
    }
    // Parsers may mutate their input. Preserve the shared verified memory cache.
    return Buffer.from(await bytes);
  };
}

export const readAssetBytes = createAssetReader({ manifest });
