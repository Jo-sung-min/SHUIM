/** Original pixel artwork; each 48×64 frame is drawn at its native resolution. */
export const AVATAR_CELL = { width: 48, height: 64 };
export const AVATAR_VARIANTS = [
  { skin: "#f4cdb1", hair: "#5a3e35", shirt: "#eeb4b5", pants: "#7b839c", accent: "#fff0ce", style: 0 },
  { skin: "#e4b28f", hair: "#363544", shirt: "#b1cfdf", pants: "#7387a3", accent: "#f7e5ac", style: 1 },
  { skin: "#f8d8be", hair: "#b7834f", shirt: "#f0db9e", pants: "#94a78a", accent: "#d5e9f1", style: 2 },
  { skin: "#ca926c", hair: "#49362f", shirt: "#b9d8c5", pants: "#b49783", accent: "#fff3d9", style: 3 },
  { skin: "#edbdac", hair: "#81647e", shirt: "#eae4d8", pants: "#a2a4c4", accent: "#e9b8c9", style: 4 },
  { skin: "#a96e51", hair: "#3b3034", shirt: "#d7a2a0", pants: "#d7c9a9", accent: "#f3d9ae", style: 5 },
  { skin: "#f5d8b3", hair: "#cbb17b", shirt: "#bdb0dd", pants: "#859ba4", accent: "#f6e6b4", style: 6 },
  { skin: "#deb18d", hair: "#8e5748", shirt: "#c1d8e1", pants: "#c1a790", accent: "#efc8ad", style: 7 },
];
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]; };
const mix = (a, b, k) => a.map((v, i) => i === 3 ? 255 : Math.round(v * (1 - k) + b[i] * k));

/** Integer coverage only: stair-step pixels, without smoothed raster edges. */
function ellipse(r, x, y, w, h, color) {
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
    if (((px + 0.5 - x - w / 2) / (w / 2)) ** 2 + ((py + 0.5 - y - h / 2) / (h / 2)) ** 2 <= 1) r.set(px, py, color);
  }
}
function rounded(r, x, y, w, h, color, corner = 2) {
  r.rect(x + corner, y, w - corner * 2, h, color);
  r.rect(x, y + corner, w, h - corner * 2, color);
  if (corner > 1) r.rect(x + 1, y + 1, w - 2, h - 2, color);
}

/** Head y=2..32 and body y=33..62 preserve the two-head proportion. */
export function drawAvatar(Raster, v, view, frame) {
  const c = new Raster(AVATAR_CELL.width, AVATAR_CELL.height);
  const skin = hex(v.skin), hair = hex(v.hair), shirt = hex(v.shirt), pants = hex(v.pants), accent = hex(v.accent);
  const white = hex("#fff8ee"), ink = hex("#42333e");
  const skinShade = mix(skin, hex("#9d6260"), 0.25), skinLight = mix(skin, white, 0.18);
  const hairShade = mix(hair, ink, 0.34), hairLight = mix(hair, hex("#ecd6b7"), 0.22);
  const shirtShade = mix(shirt, hex("#77748b"), 0.24), shirtLight = mix(shirt, white, 0.28);
  const pantsShade = mix(pants, ink, 0.18), blush = mix(skin, hex("#d9778a"), 0.5);
  const back = view === 1, side = view >= 2, bob = frame === 0 ? 0 : -1;
  const footLeft = frame === 1 ? -2 : 0;
  const footRight = frame === 2 ? -2 : 0;

  // Small sneakers, soft socks and short legs alternate with each stride.
  for (const [x, lift] of [[16, footLeft], [26, footRight]]) {
    rounded(c, x, 51 + lift, 7, 11, pantsShade, 1);
    c.rect(x + 1, 52 + lift, 5, 6, skinShade);
    c.rect(x + 1, 52 + lift, 4, 5, skin);
    c.rect(x, 57 + lift, 7, 3, white);
    rounded(c, x - 1, 59 + lift, 9, 4, ink, 1);
    c.rect(x, 59 + lift, 7, 2, accent);
    c.rect(x - 1, 62 + lift, 9, 1, white);
    c.rect(x + 1, 59 + lift, 3, 1, white);
  }
  rounded(c, 14, 46 + bob, 20, 9, pantsShade, 2);
  c.rect(15, 47 + bob, 18, 5, pants);
  c.rect(23, 50 + bob, 2, 5, pantsShade);
  c.rect(15, 52 + bob, 7, 1, mix(pants, white, 0.16));
  c.rect(26, 52 + bob, 7, 1, mix(pants, white, 0.16));
  for (const [x, sway] of [[10, frame === 1 ? -1 : 0], [32, frame === 2 ? -1 : 0]]) {
    rounded(c, x, 36 + bob + sway, 7, 15, shirtShade, 2);
    rounded(c, x + 1, 37 + bob + sway, 5, 9, shirt, 1);
    rounded(c, x + 1, 46 + bob + sway, 5, 6, skinShade, 1);
    c.rect(x + 1, 46 + bob + sway, 4, 4, skinLight);
    c.set(x + 3, 50 + bob + sway, skin);
  }
  rounded(c, 13, 33 + bob, 22, 18, shirtShade, 3);
  rounded(c, 14, 34 + bob, 20, 14, shirt, 2);
  c.rect(16, 35 + bob, 3, 10, shirtLight);
  c.rect(15, 48 + bob, 18, 2, shirtLight);
  c.rect(21, 31 + bob, 6, 5, skinShade);
  c.rect(22, 32 + bob, 4, 4, skinLight);
  c.rect(20, 35 + bob, 8, 2, white);
  if (back) {
    rounded(c, 19, 35 + bob, 10, 6, shirtShade, 2);
    rounded(c, 20, 35 + bob, 8, 4, shirtLight, 2);
    c.rect(20, 46 + bob, 8, 1, shirtShade);
  } else {
    c.rect(26, 39 + bob, 4, 4, accent);
    c.rect(27, 38 + bob, 2, 6, accent);
    c.set(27, 40 + bob, white);
    c.rect(20, 43 + bob, 5, 1, shirtShade);
  }

  if (v.style === 5) {
    ellipse(c, 6, 3 + bob, 12, 12, hairShade); ellipse(c, 30, 3 + bob, 12, 12, hairShade);
    ellipse(c, 8, 4 + bob, 8, 8, hairLight); ellipse(c, 32, 4 + bob, 8, 8, hair);
  }
  ellipse(c, 7, 2 + bob, 34, 31, ink);
  ellipse(c, 8, 3 + bob, 32, 29, hairShade);
  ellipse(c, 9, 3 + bob, 30, 26, hair);
  ellipse(c, 11, 5 + bob, 24, 13, hairLight);
  if (back) {
    ellipse(c, 10, 9 + bob, 28, 21, hair);
    c.line(13, 17 + bob, 15, 27 + bob, hairShade);
    c.line(32, 17 + bob, 30, 28 + bob, hairShade);
    c.line(21, 10 + bob, 21, 29 + bob, hairLight);
    c.line(25, 12 + bob, 26, 28 + bob, hairShade);
    c.rect(15, 7 + bob, 8, 1, mix(hairLight, white, 0.12));
  } else {
    ellipse(c, 7, 19 + bob, 6, 8, skinShade); ellipse(c, 35, 19 + bob, 6, 8, skinShade);
    ellipse(c, 8, 20 + bob, 4, 5, skin); ellipse(c, 36, 20 + bob, 4, 5, skin);
    ellipse(c, 11, 10 + bob, 26, 23, skinShade);
    ellipse(c, 12, 10 + bob, 24, 21, skin);
    ellipse(c, 13, 11 + bob, 21, 15, skinLight);
    const fringe = [16, 17, 15, 17, 16, 16, 15, 17][v.style];
    for (let x = 10; x <= 37; x++) {
      const wave = v.style % 3 === 0 ? Math.floor((x - 10) / 5) % 2 : v.style % 3 === 1 ? Math.round((37 - x) / 6) - 2 : Math.round(Math.abs(x - 23.5) / 5) - 1;
      const lower = fringe + wave;
      for (let y = 10; y <= lower; y++) c.set(x, y + bob, y === lower ? hairShade : hair);
    }
    c.rect(11, 14 + bob, 2, v.style % 2 ? 11 : 9, hairShade);
    c.rect(35, 14 + bob, 2, v.style % 2 ? 10 : 8, hairShade);
    c.line(13, 9 + bob, 18, 7 + bob, hairLight, 2);
    c.line(19, 7 + bob, 26, 7 + bob, hairLight);
    c.line(28, 9 + bob, 32, 11 + bob, hairLight);
    for (const x of side ? [14] : [16, 28]) {
      c.rect(x, 21 + bob, 3, 5, ink);
      c.set(x, 21 + bob, white);
      c.set(x + 2, 25 + bob, mix(ink, skin, 0.3));
      c.rect(x, 19 + bob, 3, 1, hairShade);
    }
    c.rect(side ? 11 : 12, 26 + bob, 5, 2, blush);
    if (!side) c.rect(31, 26 + bob, 5, 2, blush);
    c.set(side ? 11 : 23, 26 + bob, skinShade);
    c.rect(side ? 13 : 22, 29 + bob, 3, 1, hex("#b17677"));
    c.set(side ? 12 : 21, 28 + bob, skinShade);
    if (side) {
      ellipse(c, 22, 11 + bob, 17, 20, hair);
      ellipse(c, 24, 21 + bob, 5, 6, skinShade);
      c.rect(25, 22 + bob, 3, 3, skin);
      c.line(31, 12 + bob, 33, 25 + bob, hairShade);
    }
  }
  if (v.style === 2 || v.style === 7) {
    c.rect(33, 14 + bob, 5, 2, accent); c.set(34, 13 + bob, white);
  } else if (v.style === 4) {
    rounded(c, 7, 10 + bob, 5, 5, accent, 1); rounded(c, 12, 11 + bob, 5, 5, accent, 1);
    c.rect(11, 12 + bob, 2, 2, white);
  } else if (v.style === 6) {
    c.rect(31, 10 + bob, 4, 2, accent); c.rect(32, 9 + bob, 2, 4, accent); c.set(32, 10 + bob, white);
  }
  if (view !== 3) return c;
  const mirrored = new Raster(AVATAR_CELL.width, AVATAR_CELL.height);
  mirrored.blitMirror(c, 0, 0, AVATAR_CELL.width, AVATAR_CELL.height, 0, 0);
  return mirrored;
}
