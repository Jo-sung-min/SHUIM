import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";

const source = stripTypeScriptTypes(await readFile(new URL("../lib/assets.ts", import.meta.url), "utf8"))
  .replace(/\bexport\s+(?=function\b|const\b)/g, "");
export function assetsFor(base = "") {
  const context = { URL, process: { env: { NEXT_PUBLIC_ASSET_BASE_URL: base } } };
  vm.runInNewContext(`${source}\nglobalThis.api = { assetUrl, assetCssUrl, assetLoader, publicAssetStyles };`, context);
  return context.api;
}
export const assets = assetsFor();
