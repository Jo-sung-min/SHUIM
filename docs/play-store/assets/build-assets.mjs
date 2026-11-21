import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, "../../../frontend");
const sharp = createRequire(path.join(frontend, "package.json"))("sharp");
const brand = path.join(frontend, "public/brand");
await mkdir(brand, {recursive:true});
const original = path.join(here, "half-mask-original.png");
const resizeIcon = size => sharp(original).resize(size, size, { fit: "contain", background: "#08080a" });
for (const size of [48, 180, 192, 512]) {
  await resizeIcon(size).removeAlpha().png({compressionLevel:9}).toFile(path.join(brand, `half-mask-${size}-v1.png`));
}
const faviconMask = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" rx="12" fill="white"/></svg>');
await sharp(path.join(brand, "half-mask-48-v1.png")).ensureAlpha()
  .composite([{ input: faviconMask, blend: "dest-in" }])
  .png({ compressionLevel: 9 }).toFile(path.join(brand, "favicon-rounded-v2.png"));
await resizeIcon(512).ensureAlpha().png({compressionLevel:9}).toFile(path.join(here, "store-icon-512.png"));

const art = path.join(here, "feature-background.jpg");
const overlay = await readFile(path.join(here, "feature-graphic.svg"));
async function feature(width, height) {
  const titles = await sharp(overlay, { density: 144 }).resize(width, height, {fit:"contain", background:"#00000000"}).png().toBuffer();
  return sharp(art).resize(width, height, {fit:"cover"}).composite([{input:titles}]);
}
await (await feature(1024, 500)).removeAlpha().png({compressionLevel:9}).toFile(path.join(here, "feature-graphic-1024x500.png"));
await (await feature(1200, 630)).jpeg({quality:88, mozjpeg:true}).toFile(path.join(brand,"share-v1.jpg"));

const captures = [
  ["01-campfire", "불멍", "모닥불 곁에서 쉬어 가요", "#282320", "#faf1e6"],
  ["02-garden", "수목원", "반딧불이 밝히는 숲길", "#182322", "#edf4e7"],
  ["03-bamboo", "대나무숲", "마음을 담은 한 장", "#302535", "#f8ecf2"],
  ["04-lantern", "풍등", "밤하늘에 띄우는 풍등", "#192235", "#f6ecdb"],
];
const phones = path.join(here, "phone");
await mkdir(phones, {recursive:true});
for (const [name, label, heading, paper, ink] of captures) {
  const screenshot = await sharp(path.join(here, "captures", name + ".png")).resize(922, 1580, {fit:"inside"}).png().toBuffer({resolveWithObject:true});
  const header = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="250"><g fill="${ink}" font-family="Malgun Gothic, sans-serif"><text x="90" y="94" font-size="30" letter-spacing="3">SOROW</text><text x="990" y="94" text-anchor="end" font-size="30">${label}</text><text x="86" y="213" font-size="73" font-weight="bold" letter-spacing="-4">${heading}</text></g></svg>`);
  await sharp({create:{width:1080,height:1920,channels:3,background:paper}}).composite([
    {input:header,top:0,left:0},
    {input:screenshot.data,top:275,left:Math.round((1080-screenshot.info.width)/2)}
  ]).removeAlpha().png({compressionLevel:9}).toFile(path.join(phones,name+".png"));
}

const liveCaptures = ["05-home", "06-feed-hope", "07-feed-kindness"];
for (const name of liveCaptures) {
  await sharp(path.join(here, "captures", name + ".jpg"))
    .resize(1080, 1920, {fit: "contain", background: "#121214"})
    .removeAlpha().png({compressionLevel: 9}).toFile(path.join(phones, name + ".png"));
}
const outputNames = [
  "store-icon-512.png", "feature-graphic-1024x500.png",
  ...[...captures.map(([name]) => name), ...liveCaptures].map(name => "phone/" + name + ".png"),
];
const report = {};
for (const name of outputNames) {
  const data = await readFile(path.join(here,name));
  const {width,height,channels,format} = await sharp(data).metadata();
  const [w,h,c,max] = name.startsWith("phone/") ? [1080,1920,3,8*1024*1024] : name === "store-icon-512.png" ? [512,512,4,1024*1024] : [1024,500,3,15*1024*1024];
  if (width!==w || height!==h || channels!==c || format!=="png" || data.length>max) throw new Error("Invalid Play asset: "+name);
  report[name] = {width,height,channels,format,bytes:data.length};
}
await writeFile(path.join(here,"asset-validation.json"),JSON.stringify(report,null,2)+"\n");
console.log(report);
