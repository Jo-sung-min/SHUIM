import { readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, "../../../frontend");
const require = createRequire(path.join(frontend, "package.json"));
const sharp = require("sharp");

const graphic = path.join(here, "feature-graphic.svg");
await sharp(await readFile(graphic)).flatten({ background: "#4b5fe0" }).removeAlpha().png().toFile(path.join(here, "feature-graphic-1024x500.png"));

// Preserve the original launcher asset and remove only its baked-in corner
// rounding for the full-bleed icon that Google Play will mask itself.
await copyFile(path.join(frontend, "public/icon-512.png"), path.join(here, "icon-512-original.png"));
const iconSvg = (await readFile(path.join(frontend, "public/favicon.svg"), "utf8")).replace('rx="116"', 'rx="0"');
await writeFile(path.join(here, "store-icon.svg"), iconSvg);
await sharp(Buffer.from(iconSvg)).resize(512, 512).ensureAlpha().png().toFile(path.join(here, "store-icon-512.png"));

const report = {};
for (const name of ["feature-graphic-1024x500.png", "store-icon-512.png", "icon-512-original.png"]) {
  const input = await readFile(path.join(here, name));
  const meta = await sharp(input).metadata();
  report[name] = { width: meta.width, height: meta.height, format: meta.format, channels: meta.channels, hasAlpha: meta.hasAlpha, bytes: input.length };
}
if (report["feature-graphic-1024x500.png"].width !== 1024 || report["feature-graphic-1024x500.png"].height !== 500 || report["feature-graphic-1024x500.png"].hasAlpha) throw new Error("Feature graphic specification mismatch");
if (report["store-icon-512.png"].width !== 512 || report["store-icon-512.png"].height !== 512 || report["store-icon-512.png"].channels !== 4 || report["store-icon-512.png"].bytes > 1024 * 1024) throw new Error("Store icon specification mismatch");
await writeFile(path.join(here, "asset-validation.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
