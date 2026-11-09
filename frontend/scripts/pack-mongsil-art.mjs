import sharp from "sharp";
import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Packaging only: preserve the generated alpha and colours; align all views
// to one physical height so turning never makes the illustrated body jump.
const out = fileURLToPath(new URL("../public/characters/mongsil/", import.meta.url));
await mkdir(out, { recursive: true });
for (const [sheet, views] of [["turnaround", ["front", "back"]], ["sides", ["left", "right"]]]) {
const source = fileURLToPath(new URL(`../../output/imagegen/mongsil/${sheet}-source-v1.png`, import.meta.url));
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (const [index, name] of views.entries()) {
  const start = index * info.width / 2, end = start + info.width / 2;
  let minX = end, minY = info.height, maxX = start, maxY = 0;
  for (let y = 0; y < info.height; y++) for (let x = start; x < end; x++) {
    if (data[(y * info.width + x) * 4 + 3] < 100) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const pad = 3;
  const crop = { left: minX - pad, top: minY - pad, width: maxX - minX + 1 + pad * 2, height: maxY - minY + 1 + pad * 2 };
  const target = `${out}/${name}-v1.webp`;
  await sharp(source).extract(crop).resize(512, 672, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 92, alphaQuality: 100, effort: 6 }).toFile(target);
  console.log(name, crop, (await stat(target)).size);
}
}
