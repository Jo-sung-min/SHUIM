// Bake the two original, painted companion rigs. Run from any directory with
// node frontend/scripts/gen-home-companions.mjs. The last ten pixels of each
// 96px cell are kept below the feet so every expression shares a ground line.
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const source = new URL("./art/home-companions/", import.meta.url);
const output = new URL("../public/companions/", import.meta.url);
const scale = 3;
const cell = 96;
const side = cell * scale;
const columns = 6;
const rows = [
  "low", "quiet", "idle", "light", "joy", "happy", "pet", "eat", "sleep",
  "tired", "celebrate", "sad", "anxious", "bored", "hello",
];
// Offsets across the six hand-timed exposures. The last pose eases back
// towards the first. Pronounced motions are confined to short reactions.
const lift = [0, 0.36, 0.82, 1, 0.64, 0.22];
const nod = [0, 0.3, 0.95, 1, 0.46, 0.08];
const sway = [0, 0.65, 1, 0.3, -0.45, -0.3];
const wag = [0, 0.9, 0.65, -0.25, -1, -0.58];
const blink = [1, 1, 1, 0.86, 0.09, 0.92];
const pure = { r: 0, g: 0, b: 0, alpha: 0 };
const number = (x) => x.toFixed(2);
const svg = (content) => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="288" height="288" viewBox="0 0 96 96">' + content + "</svg>");
const ellipse = (x, y, rx, ry, color, opacity = 1) =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${color}" opacity="${opacity}"/>`;
const path = (d, color, width, opacity = 1) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"/>`;
const shape = (d, fill, stroke = "none", width = 0.5) =>
  `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"/>`;

const expressions = {
  low: { kind: "low", gaze: -1.1, y: 0.5, mouth: "frown", cheek: 0.12 },
  quiet: { kind: "lid", gaze: -0.55, y: 0.4, mouth: "still", cheek: 0.18 },
  idle: { kind: "open", gaze: 0, y: 0, mouth: "still", cheek: 0.26 },
  light: { kind: "open", gaze: 0.55, y: -0.3, mouth: "smile", cheek: 0.42 },
  joy: { kind: "smile", gaze: 0, y: 0, mouth: "smile", cheek: 0.68 },
  happy: { kind: "grin", gaze: 0, y: 0, mouth: "grin", cheek: 0.74 },
  pet: { kind: "smile", gaze: 0, y: 0, mouth: "smile", cheek: 0.82 },
  eat: { kind: "lid", gaze: 0, y: 0.7, mouth: "chew", cheek: 0.62 },
  sleep: { kind: "closed", gaze: 0, y: 0.6, mouth: "sleep", cheek: 0.22 },
  tired: { kind: "closed", gaze: 0, y: 0.3, mouth: "soft", cheek: 0.35 },
  celebrate: { kind: "star", gaze: 0.1, y: -0.5, mouth: "grin", cheek: 0.76 },
  sad: { kind: "tender", gaze: -0.1, y: 0.5, mouth: "frown", cheek: 0.31 },
  anxious: { kind: "tender", gaze: 0.6, y: -0.1, mouth: "soft", cheek: 0.34 },
  bored: { kind: "curious", gaze: 1.1, y: -0.5, mouth: "o", cheek: 0.32 },
  hello: { kind: "open", gaze: 0.3, y: -0.25, mouth: "hello", cheek: 0.5 },
};

function eye(species, row, frame, left) {
  const dog = species === "bamu";
  const ink = "#191317";
  const expression = expressions[row];
  const { kind } = expression;
  const flip = left ? -1 : 1;
  const x = dog ? 48.2 + flip * 9.75 : 48 + flip * 10.3;
  const y = (dog ? 37.55 : 48.3) + expression.y;
  const rim = dog ? "#ac8d70" : "#ac97a1";
  const iris = dog ? "#6e4b35" : "#675260";
  const lid = dog ? "#b08c70" : "#b29aab";
  let content = "";
  if (["closed", "smile", "grin"].includes(kind)) {
    const arc = kind === "closed" ? 1.95 : kind === "grin" ? -4.9 : -3.5;
    const outer = `M-3.4 0.65Q-0.15 ${arc} 3.35 0.45`;
    content += path(outer, ink, 2.55) + path(outer, lid, 1.05);
    if (kind === "grin") content += path("M-1.9 -0.55Q-0.8 -1.9 0.25 -1.4", "#e0bfac", 0.62);
  } else {
    const rx = kind === "curious" && !left ? 3.25 : dog ? 2.85 : 3.1;
    const ry = kind === "low" ? 2.05 : kind === "lid" ? 2.7 : kind === "curious" || kind === "star" ? 4.0 : 3.55;
    const openness = row === "eat" ? [0.86, 0.45, 0.12, 0.52, 0.95, 1][frame] : blink[frame];
    const look = expression.gaze + (kind === "curious" ? 0.5 * sway[frame] : 0.12 * sway[frame]);
    if (openness < 0.15) {
      content += path("M-3.05 0.35Q-0.05 1.8 3.05 0.35", ink, 2.45) + path("M-2.9 0.32Q-0.05 1.78 3 0.34", lid, 0.95);
    } else {
      const tilt = (kind === "low" || kind === "tender") ? flip * 13 : kind === "curious" ? -flip * 7 : 0;
      content += `<g transform="rotate(${tilt}) scale(1,${number(openness)})">`;
      content += ellipse(0, 0.2, rx + 0.84, ry + 0.77, ink) + ellipse(0, 0.08, rx + 0.35, ry + 0.3, rim);
      content += ellipse(0, -0.22, rx, ry - 0.02, iris);
      content += ellipse(look * 0.5, -0.76, rx * 0.82, ry * 0.74, "#161419");
      content += ellipse(-0.72 + look * 0.45, -1.62, kind === "star" ? 1.16 : 0.97, kind === "star" ? 1.25 : 0.99, "#fff1d8");
      content += ellipse(1.05 + look * 0.3, 1.14, 0.47, 0.53, "#f0cdb4", 0.94) + "</g>";
      if (kind === "low" || kind === "lid") {
        content += path(`M-3.15 ${flip * -0.42 - 1.3}Q0 -0.7 3.15 ${flip * 0.42 - 1.3}`, "#4b3940", 1.14);
      }
    }
    if (!dog && ["low", "curious", "tender"].includes(kind)) {
      const height = kind === "curious" && !left ? -6.6 : -5.6;
      content += path(`M-2.1 ${height - flip * 0.4}Q0 ${height - 1.15} 1.85 ${height + flip * 0.6}`, "#9b8090", 0.68, 0.84);
    }
  }
  return `<g transform="translate(${x},${y})">${content}</g>`;
}

function mouth(species, row, frame) {
  const dog = species === "bamu";
  const x = dog ? 48.3 : 48;
  const y = dog ? 50.7 : 55;
  const line = dog ? "#4c342e" : "#d1a3a0";
  const lip = expressions[row].mouth;
  let mark = "";
  if (dog) mark += path("M0 -2.05V-0.2", "#4c342e", 0.82);
  if (lip === "grin" || (lip === "hello" && [1, 2].includes(frame))) {
    mark += shape("M-2.45 -0.35Q0 0.73 2.5 -0.35Q2.2 3.6 0.2 3.75Q-1.89 3.65 -2.45 -0.35Z", "#57333f", line, 0.65);
    mark += shape("M-1.55 2.05Q-0.2 0.9 1.55 2Q1.25 3.1 0 3.13Q-1.0 3.13 -1.55 2.05Z", "#d69c96");
  } else if (lip === "o" || lip === "chew" && frame % 3 !== 0) {
    mark += ellipse(0, 0.86, lip === "o" ? 1.4 : 1.05, lip === "o" ? 1.75 : 1.3, line);
    mark += ellipse(0, 0.85, 0.65, 0.91, "#573942");
  } else if (lip === "frown") {
    mark += path("M-1.85 1.1Q0 -0.65 1.9 1.1", line, 0.92);
  } else if (lip === "sleep" || lip === "soft") {
    mark += path("M-1.45 0.25Q-0.1 1.15 1.6 0.3", line, 0.85);
  } else if (dog || ["hello", "smile"].includes(lip)) {
    const curl = lip === "still" ? 0.9 : 1.65;
    mark += path(`M-3 -0.16Q-1.75 ${curl} 0 0Q1.7 ${curl} 3 -0.16`, line, 0.9);
  } else {
    mark += path("M-1.7 0.05Q0 1.4 1.7 0.05", line, 0.9);
  }
  return `<g transform="translate(${x},${y})">${mark}</g>`;
}

function face(species, row, frame) {
  const dog = species === "bamu";
  const strength = expressions[row].cheek;
  const y = dog ? 42.0 : 53.1;
  let content = "";
  for (const x of [dog ? 33.3 : 32.2, dog ? 63 : 63.8]) {
    content += ellipse(x, y, 3.5, 1.37, "#a77177", strength * 0.6);
    content += ellipse(x - 0.1, y - 0.1, 2.4, 0.74, "#e9a2a2", strength * 0.46);
    content += eye(species, row, frame, x < 48);
  }
  return svg(content + mouth(species, row, frame));
}

// The head, ears, and tail have separate soft influence regions. Baking the
// face into the painted body first keeps it registered while the head tilts.
const poses = {
  // head drop, breath, tilt, tail swing, ear lift, jump, centre shift
  low:       [2.6, 0.48, -0.037, 0.46, -0.5, 0, -0.5],
  quiet:     [1.2, 0.65, -0.009, 0.75, 0.2, 0, 0],
  idle:      [0, 0.92, 0, 1.08, 0.45, 0, 0],
  light:     [-0.5, 1.0, 0.018, 2.2, 0.65, 0, 0.4],
  joy:       [-0.8, 1.1, 0.021, 3.4, 1.3, 0.6, 0.2],
  happy:     [-0.8, 0.6, -0.015, 4.7, 2.0, 3.0, 0],
  pet:       [1.2, 0.67, -0.075, 3.5, -0.65, 0, -1.0],
  eat:       [1.1, 0.52, 0.043, 1.55, -0.25, 0, 0],
  sleep:     [9.8, 0.68, -0.112, 0.28, -0.92, 0, -1.1],
  tired:     [3.3, 0.65, -0.055, 0.65, -0.24, 0, -0.4],
  celebrate: [-1.0, 0.62, 0.024, 3.65, 1.8, 1.8, 0.2],
  sad:       [1.8, 0.65, -0.045, 0.95, 0.25, 0, -0.4],
  anxious:   [0.3, 0.9, 0.01, 1.03, 0.54, 0, 0.2],
  bored:     [-0.2, 0.65, 0.08, 1.8, 0.7, 0, 0.7],
  hello:     [-0.12, 0.78, -0.045, 2.6, 0.65, 0, -0.2],
};
function softRange(value, start, end) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}
function influence(x, y, cx, cy, rx, ry) {
  return Math.exp(-(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2));
}
function pose(pixels, dog, row, frame) {
  const [drop, breath, restingTilt, tail, ear, hop, shift] = poses[row];
  const tilt = restingTilt + ((row === "bored" ? 0.068 : row === "pet" ? 0.037 : 0.014) * sway[frame]);
  const headDip = drop + (row === "eat" ? 5.75 * nod[frame] : 0);
  const jump = hop * [0, -0.24, 0.46, 1, 0.55, 0][frame];
  const out = Buffer.alloc(pixels.length);
  for (let py = 0; py < side; py++) {
    const y = py / scale;
    const head = 1 - softRange(y, dog ? 42 : 43, 85);
    const shoulders = 1 - softRange(y, 47, 86);
    for (let px = 0; px < side; px++) {
      const x = px / scale;
      let dx = head * ((dog ? 53 : 59) - y) * tilt + shift * shoulders;
      let dy = head * (headDip + (x - 48) * tilt) - breath * shoulders * lift[frame] - jump;
      dx += (x - 48) * shoulders * lift[frame] * (row === "sleep" ? 0.016 : 0.008);
      if (dog) {
        const tailRoot = influence(x, y, 20, 64, 7.8, 9.5);
        dx += tailRoot * wag[frame] * tail;
        dy -= tailRoot * (0.62 * wag[frame] * tail);
        dy -= ear * (0.45 + 0.6 * sway[frame]) * influence(x, y, 70, 17, 10, 9);
        dy += ear * 0.65 * sway[frame] * influence(x, y, 17, 38, 10, 12);
      } else {
        const tufts = influence(x, y, 31, 22, 14, 9) - influence(x, y, 69, 25, 11, 8);
        dx += tufts * (0.72 * wag[frame] + 0.25 * ear);
        dy -= tufts * (ear + 0.72 * sway[frame]);
        // Mongul rocks its little forepaws towards its cheeks while eating.
        if (row === "eat") dy -= 2.05 * nod[frame] * (influence(x, y, 35, 67, 7, 6) + influence(x, y, 61, 67, 7, 6));
      }
      const sx = Math.round(px - dx * scale), sy = Math.round(py - dy * scale);
      if (sx < 0 || sx >= side || sy < 0 || sy >= side) continue;
      const i = (sy * side + sx) * 4, j = (py * side + px) * 4;
      out[j] = pixels[i]; out[j + 1] = pixels[i + 1]; out[j + 2] = pixels[i + 2]; out[j + 3] = pixels[i + 3];
    }
  }
  return out;
}

function supper(dog, frame) {
  const x = dog ? 47 : 48;
  let dish = shape("M-11 -3C-10.5 2 -8.5 5 -5 6Q0 7.25 5 6C8.5 5 10.5 2 11 -3Z", "#657b79", "#423d40", 0.87);
  dish += shape("M-10.2 -1.7Q0 1.5 10.2 -1.75Q9.8 0.3 8.9 1.65Q0 4.25 -8.9 1.65Z", "#99a59a");
  dish += ellipse(0, -3.06, 11, 2.55, "#c0b6a0") + ellipse(0, -3.03, 9.65, 1.76, "#594b48");
  for (const [tx, ty, r] of [[-5,-4,1.4],[-2,-4.4,1.7],[1,-4.6,1.5],[4.5,-4.0,1.4],[-1.0,-5.7,1.2],[3,-5.3,1.1]]) {
    dish += ellipse(tx, ty, r, r * 0.72, dog ? "#bd956e" : "#e4d4b1");
  }
  const nearMouth = dog ? 56 : 60.3;
  const liftY = [73, 67, nearMouth + 1.5, nearMouth, nearMouth - 0.4, 74][frame];
  let snack = "";
  if (frame < 4) {
    snack += shape("M-2.7 -0.6Q-3.4 -1.6 -2.4 -2.2Q-1.55 -2.7 -1.1 -1.65L1.2 -1.25Q1.85 -2.2 2.65 -1.6Q3.2 -1.05 2.59 -0.35Q3.2 0.5 2.4 1.15Q1.55 1.6 1 0.67L-1.1 0.3Q-1.8 1.2 -2.6 0.64Q-3.15 0.15 -2.7 -0.6Z", dog ? "#d7ab79" : "#d4b68a", "#674e40", 0.55);
  } else if (frame === 4) {
    snack += ellipse(1.5, -1, 0.5, 0.5, "#d4b68a") + ellipse(-1, 0, 0.42, 0.45, "#d4b68a");
  }
  return svg(`<g transform="translate(${x},79)">${dish}</g><g transform="translate(${x + 2.6 + sway[frame]},${liftY}) rotate(-9)">${snack}</g>`);
}

async function bake(species) {
  const file = fileURLToPath(new URL(species + ".webp", source));
  const tiles = [];
  for (const [rowIndex, row] of rows.entries()) {
    for (let frame = 0; frame < columns; frame++) {
      const pixels = await sharp(file).ensureAlpha().composite([{ input: face(species, row, frame) }]).raw().toBuffer();
      const posed = pose(pixels, species === "bamu", row, frame);
      let tile = sharp(posed, { raw: { width: side, height: side, channels: 4 } });
      if (row === "eat") tile = sharp(await tile.composite([{ input: supper(species === "bamu", frame) }]).png().toBuffer());
      tiles.push({ input: await tile.resize(cell, cell).png().toBuffer(), left: frame * cell, top: rowIndex * cell });
    }
  }
  await sharp({ create: { width: cell * columns, height: cell * rows.length, channels: 4, background: pure } })
    .composite(tiles).png({ palette: true, quality: 95, colours: 224, dither: 0, effort: 10 })
    .toFile(fileURLToPath(new URL(species + ".png", output)));
}
await mkdir(output, { recursive: true });
await Promise.all(["bamu", "mongul"].map(bake));
