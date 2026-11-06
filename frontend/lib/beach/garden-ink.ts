import * as THREE from "three";
import { seededRandom } from "./bamboo-trail";
import { GARDEN_POLYLINES, GARDEN_PATH_WIDTH, GARDEN_LANTERNS, GARDEN_WILLOWS, GATE_YARD, LAKE, lakeSigned, HALL, GARDEN_PIERS, pierEnd, GARDEN_BRIDGE } from "./garden-layout";

/**
 * 봄물 정원의 수묵 텍스처. 전부 Canvas 2D 로 실행 시점에 그린다 (외부 이미지·CDN 없음).
 * 기법은 cloveric/claude-drawing-skill 의 수묵(inkpaint: 능선·먹번짐·안개띠·준법·태점)과
 * 강남 원림(jiangnan: 늘어지는 버들 가닥, 홈 파인 연잎)을 Canvas 로 옮긴 것이다.
 */
function canvas2d(width: number, height: number, alpha: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  return { canvas, ctx: canvas.getContext("2d", { alpha })! };
}

function texture(canvas: HTMLCanvasElement, srgb = true, repeat = false): THREE.Texture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  return t;
}

/** 주기 함수로 만든 1차원 프랙탈 요철: 띠 양끝이 이어진다 (원통에 감는다). */
function periodicFbm(seed: number, octaves = 5): (u: number) => number {
  const rand = seededRandom(seed);
  const terms: [number, number, number][] = [];
  let amp = 1;
  for (let o = 0; o < octaves; o++) {
    const k = 2 + o * 3 + Math.floor(rand() * 3);
    terms.push([k, rand() * Math.PI * 2, amp]);
    amp *= 0.52;
  }
  return (u) => terms.reduce((sum, [k, phase, a]) => sum + a * Math.sin(u * Math.PI * 2 * k + phase), 0) / 1.9;
}

/**
 * 원경 산수 띠 (2048×512, 가로로 이어짐): 먼 능선 → 가까운 능선 순서로 먹을 번지게 하고, 사이사이 안개가 먹을 걷어 낸다.
 * RGB 는 먹의 밝기(가까울수록 짙다), 알파는 덮인 정도. 셰이더가 종이빛·밤빛과 섞는다.
 */
export function inkMountainTexture(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  const W = 2048, H = 512, { canvas, ctx } = canvas2d(W, H, true);
  const rand = seededRandom(101);
  // 북쪽(u≈0.5, 청우헌 창 너머)이 가장 높은 봉우리가 되게 봉우리를 배치한다.
  const layers = [
    { base: 0.62, rough: 0.05, peaks: [[0.5, 0.24, 0.08], [0.3, 0.14, 0.06], [0.72, 0.17, 0.07], [0.1, 0.1, 0.05], [0.9, 0.12, 0.05]], ink: 0.22, decay: 0.38, seed: 3 },
    { base: 0.72, rough: 0.06, peaks: [[0.44, 0.2, 0.05], [0.6, 0.15, 0.045], [0.22, 0.12, 0.05], [0.82, 0.13, 0.04], [0.02, 0.09, 0.04]], ink: 0.36, decay: 0.3, seed: 5 },
    { base: 0.82, rough: 0.07, peaks: [[0.37, 0.12, 0.035], [0.55, 0.11, 0.03], [0.14, 0.09, 0.03], [0.93, 0.1, 0.03], [0.7, 0.08, 0.03]], ink: 0.58, decay: 0.24, seed: 7 },
  ] as const;
  const column = new Float32Array(W);
  const ridgeOf = (layer: (typeof layers)[number]) => {
    const fbm = periodicFbm(layer.seed);
    for (let x = 0; x < W; x++) {
      const u = x / W;
      let y = layer.base;
      for (const [px, h, w] of layer.peaks) {
        for (const wrap of [-1, 0, 1]) { const d = (u - px - wrap) / w; y -= h * Math.exp(-d * d); }
      }
      column[x] = (y + layer.rough * fbm(u)) * H;
    }
    return Float32Array.from(column);
  };
  // 먹 번짐: 능선 아래로 갈수록 옅어지는 세로 띠를 열마다 그린다.
  const wash = (ridge: Float32Array, ink: number, decay: number, grey: number) => {
    const image = ctx.getImageData(0, 0, W, H), data = image.data;
    const grain = periodicFbm(1 + ink * 10, 3);
    for (let x = 0; x < W; x++) {
      const top = ridge[x], tx = 0.75 + 0.25 * (0.5 + 0.5 * grain(x / W * 7));
      for (let y = Math.max(0, Math.floor(top)); y < H; y++) {
        const depth = (y - top) / H;
        const body = Math.exp(-depth / decay) * Math.min(1, (y - top + 2) / 5);
        const edge = Math.exp(-Math.pow((y - top) / 3.5, 2)) * 0.35;
        const a = Math.min(1, (body * tx + edge) * ink);
        const i = (y * W + x) * 4;
        // over(): 앞 겹이 뒤 겹을 덮되 뒤 먹이 살짝 비친다.
        const prev = data[i + 3] / 255;
        const alpha = 1 - (1 - prev * (1 - 0.85 * Math.min(1, (y - top + 1) / 6))) * (1 - a);
        const tone = prev > 0.001 ? (data[i] / 255 * prev * (1 - a) + grey * a) / Math.max(1e-4, prev * (1 - a) + a) : grey;
        data[i] = data[i + 1] = data[i + 2] = Math.round(tone * 255);
        data[i + 3] = Math.round(alpha * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
  };
  const mist = (yCentre: number, height: number, strength: number, seed: number) => {
    const image = ctx.getImageData(0, 0, W, H), data = image.data, drift = periodicFbm(seed, 3);
    for (let x = 0; x < W; x++) {
      const centre = (yCentre + 0.05 * drift(x / W)) * H;
      for (let y = 0; y < H; y++) {
        const m = Math.exp(-Math.pow((y - centre) / (height * H), 2)) * strength;
        const i = (y * W + x) * 4;
        data[i + 3] = Math.round(data[i + 3] * (1 - m));
      }
    }
    ctx.putImageData(image, 0, 0);
  };
  ctx.clearRect(0, 0, W, H);
  const greys = [0.62, 0.42, 0.2];
  layers.forEach((layer, index) => {
    const ridge = ridgeOf(layer);
    wash(ridge, layer.ink, layer.decay, greys[index]);
    if (index === 0) mist(0.8, 0.08, 0.85, 11);
    if (index === 1) mist(0.9, 0.07, 0.8, 13);
    // 준법(皴): 능선에서 늘어지는 마른 획. 그림자 쪽(왼쪽)이 더 짙다.
    ctx.lineCap = "round";
    const strokes = index === 2 ? 320 : index === 1 ? 180 : 60;
    for (let n = 0; n < strokes; n++) {
      const x = rand() * W, top = ridge[Math.floor(x)];
      const length = (18 + rand() * 50) * (index + 1) * 0.5;
      const left = rand() < 0.68;
      ctx.strokeStyle = `rgba(30, 32, 36, ${(left ? 0.3 : 0.16) * (index === 2 ? 1 : 0.6)})`;
      ctx.lineWidth = 0.8 + rand() * 1.6;
      ctx.beginPath();
      ctx.moveTo(x, top + 4 + rand() * 20);
      const dir = left ? 1 : -1;
      ctx.quadraticCurveTo(x + dir * length * 0.25 + (rand() - 0.5) * 6, top + 10 + length * 0.5, x + dir * length * 0.5 + (rand() - 0.5) * 8, top + 12 + length);
      ctx.stroke();
    }
    // 태점(苔点)
    for (let n = 0; n < (index + 1) * 50; n++) {
      const x = rand() * W, y = ridge[Math.floor(x)] + 2 + rand() * 18;
      ctx.fillStyle = `rgba(24, 26, 30, ${0.35 + rand() * 0.35})`;
      ctx.beginPath(); ctx.ellipse(x, y, 1.2 + rand() * 1.8, 0.9 + rand() * 1.2, rand() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
  });
  mist(0.97, 0.06, 0.7, 17);
  // 아래쪽은 안개에 잠긴다: 맨 밑은 거의 투명.
  const image = ctx.getImageData(0, 0, W, H), data = image.data;
  for (let y = 0; y < H; y++) {
    const fade = 1 - Math.max(0, (y / H - 0.9) / 0.1);
    for (let x = 0; x < W; x++) data[(y * W + x) * 4 + 3] = Math.round(data[(y * W + x) * 4 + 3] * fade);
  }
  ctx.putImageData(image, 0, 0);
  const t = texture(canvas, true, true);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

const WILLOW_RAMP = ["#2f4a2a", "#476b35", "#6c9044", "#92b25a", "#b9cf7c", "#d8e59e"];
function rampAt(ramp: readonly string[], t: number): string {
  const i = Math.max(0, Math.min(ramp.length - 1, Math.round(t * (ramp.length - 1))));
  return ramp[i];
}

/**
 * 수양버들 가닥 (512×512, 투명): 위쪽 가지에서 수백 가닥이 늘어진다. 뒤 가닥은 짙고 앞 가닥은 밝다.
 * 가닥마다 어긋나게 달린 작은 잎을 찍는다. 빌보드 세 장을 교차시켜 쓴다.
 */
export function willowTexture(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  const S = 512, { canvas, ctx } = canvas2d(S, S, true);
  const rand = seededRandom(71);
  ctx.lineCap = "round";
  // 가지: 가운데 윗부분에서 좌우로 뻗는 굵은 가지 셋
  ctx.strokeStyle = "#4a3b2a"; ctx.lineWidth = 7;
  for (const [tx, ty, bend] of [[-200, 70, -30], [210, 60, -20], [40, 30, -40]] as const) {
    ctx.beginPath(); ctx.moveTo(256, 120); ctx.quadraticCurveTo(256 + tx * 0.5, 120 + bend, 256 + tx, ty); ctx.stroke();
  }
  const strands = 260;
  const records: { depth: number; x0: number; y0: number; length: number }[] = [];
  for (let i = 0; i < strands; i++) {
    const side = rand() * 2 - 1;
    const x0 = 256 + side * (30 + rand() * 200), y0 = 60 + Math.abs(side) * 30 + rand() * 60;
    records.push({ depth: rand(), x0, y0, length: 200 + rand() * 300 });
  }
  records.sort((a, b) => a.depth - b.depth);
  for (const strand of records) {
    const base = 0.08 + 0.7 * strand.depth;
    const n = 9, points: [number, number][] = [];
    const sway = (rand() - 0.5) * 40, out = Math.sign(strand.x0 - 256 + 1e-3) * (8 + rand() * 24);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      points.push([strand.x0 + out * Math.sin(Math.min(t * 3, 1) * Math.PI / 2) + sway * t * t + (rand() - 0.5) * 3,
        strand.y0 + strand.length * t - 6 * Math.sin(Math.min(t * 4, 1) * Math.PI)]);
    }
    ctx.strokeStyle = rampAt(WILLOW_RAMP, base * 0.6); ctx.lineWidth = 1.2; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (let k = 1; k <= n; k++) ctx.lineTo(points[k][0], points[k][1]);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // 잎: 가닥을 따라 어긋나게, 아래로 갈수록 조금 크고 밝다.
    const leaves = Math.floor(strand.length / 9);
    for (let k = 0; k < leaves; k++) {
      const t = (k + 0.5) / leaves, seg = Math.min(n - 1, Math.floor(t * n)), lt = t * n - seg;
      const [ax, ay] = points[seg], [bx, by] = points[seg + 1];
      const x = ax + (bx - ax) * lt, y = ay + (by - ay) * lt;
      const angle = Math.atan2(by - ay, bx - ax) + (k % 2 ? 1 : -1) * (0.35 + rand() * 0.5);
      const length = (5 + rand() * 5) * (0.85 + 0.35 * t), width = length * 0.3;
      const light = Math.min(1, base + 0.15 * t + (rand() - 0.5) * 0.16 + (k % 2 ? 0.07 : 0));
      ctx.fillStyle = rampAt(WILLOW_RAMP, light);
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(length * 0.5, -width, length, 0); ctx.quadraticCurveTo(length * 0.5, width, 0, 0); ctx.fill();
      ctx.restore();
    }
  }
  return texture(canvas);
}

const PAD_RAMP = ["#28452d", "#355d38", "#4a7a46", "#6b9657", "#8fb16b", "#b8ca8d"];
/** 연잎 (256×256, 투명): 홈이 파인 둥근 잎, 잎맥 여섯 가닥, 가장자리가 옅다. 네 잎을 한 장에 담아 인스턴스마다 고른다. */
export function lotusPadTexture(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  const S = 256, { canvas, ctx } = canvas2d(S, S, true);
  const rand = seededRandom(83);
  for (let cell = 0; cell < 4; cell++) {
    const cx = (cell % 2) * 128 + 64, cy = Math.floor(cell / 2) * 128 + 64, r = 56;
    const gap = 0.35 + rand() * 0.2, rot = rand() * Math.PI * 2, light = 0.35 + rand() * 0.35;
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = rampAt(PAD_RAMP, light);
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const t = rot + gap / 2 + (Math.PI * 2 - gap) * i / 40, rr = r * (1 + 0.03 * Math.sin(i * 1.7 + cell));
      const x = Math.cos(t) * rr, y = Math.sin(t) * rr;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.lineTo(Math.cos(rot) * r * 0.08, Math.sin(rot) * r * 0.08);
    ctx.closePath(); ctx.fill();
    // 한쪽은 그늘, 가장자리는 밝은 테두리
    ctx.globalAlpha = 0.35; ctx.fillStyle = rampAt(PAD_RAMP, light - 0.25);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.98, Math.PI * 0.1, Math.PI * 0.9); ctx.arc(0, 0, r * 0.45, Math.PI * 0.9, Math.PI * 0.1, true); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.6; ctx.strokeStyle = rampAt(PAD_RAMP, Math.min(1, light + 0.3)); ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.95, rot + gap / 2, rot + Math.PI * 2 - gap / 2); ctx.stroke();
    ctx.globalAlpha = 0.45; ctx.strokeStyle = rampAt(PAD_RAMP, Math.min(1, light + 0.25)); ctx.lineWidth = 1.1;
    for (let v = 0; v < 7; v++) {
      const a = rot + gap / 2 + 0.3 + (Math.PI * 2 - gap - 0.6) * v / 6;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.restore();
  }
  return texture(canvas);
}

/** 연꽃 (128×128, 투명): 납작한 바깥 꽃잎 고리와 선 안쪽 꽃잎, 노란 꽃술. */
export function lotusFlowerTexture(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  const S = 128, { canvas, ctx } = canvas2d(S, S, true);
  const rand = seededRandom(89);
  ctx.translate(64, 70);
  const petal = (angle: number, length: number, width: number, color: string) => {
    ctx.fillStyle = color; ctx.save(); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(length * 0.5, -width, length, 0); ctx.quadraticCurveTo(length * 0.5, width, 0, 0); ctx.fill();
    ctx.restore();
  };
  for (let i = 0; i < 10; i++) petal(i / 10 * Math.PI * 2 + rand() * 0.2, 44 + rand() * 6, 11, i % 2 ? "#f0a8bc" : "#e68aa5");
  for (let i = 0; i < 7; i++) petal(-Math.PI * 0.85 + i / 6 * Math.PI * 0.7, 30 + rand() * 4, 10, "#f7c6d4");
  ctx.fillStyle = "#f0c95a"; ctx.beginPath(); ctx.ellipse(0, -6, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#d9a53c"; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(-6 + i * 1.5, -7 + (i % 2) * 2, 1.1, 0, Math.PI * 2); ctx.fill(); }
  return texture(canvas);
}

/** 갈대 (128×128, 투명): 가늘고 긴 잎이 위로 퍼지고 끝이 숙여진다. */
export function reedTexture(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  const S = 128, { canvas, ctx } = canvas2d(S, S, true);
  const rand = seededRandom(97);
  ctx.lineCap = "round";
  const tones = ["#6f8a3f", "#8aa24a", "#a9b862", "#5e7536", "#c2c87a"];
  for (let n = 0; n < 34; n++) {
    const x0 = 64 + (rand() - 0.5) * 22, lean = (rand() - 0.5) * 70, height = 70 + rand() * 54;
    ctx.strokeStyle = tones[Math.floor(rand() * tones.length)]; ctx.lineWidth = 1.2 + rand() * 1.6;
    ctx.beginPath(); ctx.moveTo(x0, 126);
    ctx.quadraticCurveTo(x0 + lean * 0.3, 126 - height * 0.55, x0 + lean, 126 - height + Math.abs(lean) * 0.2);
    ctx.stroke();
    if (rand() < 0.3) { ctx.fillStyle = "#8c7a52"; ctx.beginPath(); ctx.ellipse(x0 + lean, 126 - height + Math.abs(lean) * 0.2, 1.6, 6, Math.atan2(lean, -height), 0, Math.PI * 2); ctx.fill(); }
  }
  return texture(canvas);
}

/** 회벽 (256², 이어짐): 흰 회칠에 비 얼룩과 이끼 낀 아랫단. */
export function plasterTexture(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  const S = 256, { canvas, ctx } = canvas2d(S, S, false);
  const rand = seededRandom(43);
  ctx.fillStyle = "#efe9dd"; ctx.fillRect(0, 0, S, S);
  for (let n = 0; n < 900; n++) {
    ctx.fillStyle = `rgba(${150 + rand() * 60}, ${140 + rand() * 50}, ${120 + rand() * 50}, ${0.05 + rand() * 0.1})`;
    ctx.beginPath(); ctx.ellipse(rand() * S, rand() * S, 2 + rand() * 14, 1 + rand() * 5, rand() * Math.PI, 0, Math.PI * 2); ctx.fill();
  }
  for (let n = 0; n < 14; n++) {
    const x = rand() * S;
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, "rgba(120,118,110,0.0)"); g.addColorStop(0.5, `rgba(110,112,104,${0.08 + rand() * 0.1})`); g.addColorStop(1, "rgba(90,95,85,0.22)");
    ctx.fillStyle = g; ctx.fillRect(x, 0, 2 + rand() * 6, S);
  }
  return texture(canvas, true, true);
}

/** 창살 병풍 (256², 이어짐): 종이 바탕에 짙은 격자와 사선 매듭. 밤에는 뒤에서 불빛이 비친다. */
export function latticeTexture(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  const S = 256, { canvas, ctx } = canvas2d(S, S, false);
  ctx.fillStyle = "#f4ead6"; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = "#3b2f24"; ctx.lineWidth = 5;
  for (let i = 0; i <= 4; i++) {
    const p = i * 64;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(S, p); ctx.stroke();
  }
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = i * 64, y = j * 64;
    ctx.beginPath(); ctx.moveTo(x + 10, y + 32); ctx.lineTo(x + 32, y + 10); ctx.lineTo(x + 54, y + 32); ctx.lineTo(x + 32, y + 54); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 32, y + 22); ctx.lineTo(x + 32, y + 42); ctx.stroke();
  }
  return texture(canvas, true, true);
}

/** 월드 x −62~62, z −32~102 를 1024×1100 에 굽는 바닥 마스크. R: 길, G: 돌, B: 등불, A: 나무의 부드러운 접지·잎그늘. */
export const GARDEN_MASK = { minX: -62, minZ: -32, width: 124, depth: 134, sizeX: 1024, sizeZ: 1100 } as const;
export function gardenGroundMaskTexture(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  const { canvas, ctx } = canvas2d(GARDEN_MASK.sizeX, GARDEN_MASK.sizeZ, false);
  const sx = GARDEN_MASK.sizeX / GARDEN_MASK.width, sz = GARDEN_MASK.sizeZ / GARDEN_MASK.depth;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, GARDEN_MASK.sizeX, GARDEN_MASK.sizeZ);
  ctx.setTransform(sx, 0, 0, sz, -GARDEN_MASK.minX * sx, -GARDEN_MASK.minZ * sz);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "lighter";
  const strokeLines = (width: number, alpha: number) => {
    ctx.strokeStyle = "#f00"; ctx.globalAlpha = alpha; ctx.lineWidth = width;
    for (const line of GARDEN_POLYLINES) {
      ctx.beginPath();
      line.points.forEach(([x, z], index) => index ? ctx.lineTo(x, z) : ctx.moveTo(x, z));
      if (line.closed) ctx.closePath();
      ctx.stroke();
    }
  };
  strokeLines(GARDEN_PATH_WIDTH + 1.6, 0.25); strokeLines(GARDEN_PATH_WIDTH + 0.6, 0.45); strokeLines(GARDEN_PATH_WIDTH, 1);
  ctx.fillStyle = "#f00"; ctx.globalAlpha = 1;
  ctx.fillRect(GATE_YARD.minX, GATE_YARD.minZ, GATE_YARD.maxX - GATE_YARD.minX, GATE_YARD.maxZ - GATE_YARD.minZ);
  // 청우헌 둘레 돌 포장과 옆문 앞 마당
  ctx.fillStyle = "#0f0"; ctx.globalAlpha = 1;
  ctx.fillRect(HALL.x - HALL.halfX - 3.6, HALL.doorZ - 2.4, 3.6, 4.8);
  ctx.fillRect(HALL.x + HALL.halfX, HALL.doorZ - 2.4, 3.6, 4.8);
  ctx.fillRect(HALL.x - HALL.halfX - 0.8, HALL.glassZ - 0.5, HALL.halfX * 2 + 1.6, HALL.backZ - HALL.glassZ + 1.3);
  for (const p of GARDEN_PIERS) {
    ctx.beginPath(); ctx.arc(p.x, p.z, 1.9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(GARDEN_BRIDGE[0][0], GARDEN_BRIDGE[0][1], 1.6, 0, Math.PI * 2); ctx.fill();
  // 돌판: 중심선을 따라 드문드문
  const rand = seededRandom(19);
  for (const line of GARDEN_POLYLINES) {
    const pts = line.points, count = line.closed ? pts.length : pts.length - 1;
    let travelled = 0, nextAt = 0.8;
    for (let i = 0; i < count; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz) || 1e-9;
      while (nextAt <= travelled + length) {
        const t = (nextAt - travelled) / length;
        if (rand() < 0.55) {
          const lateral = (rand() - 0.5) * 1.2, nx = -dz / length, nz = dx / length;
          const cx = a[0] + dx * t + nx * lateral, cz = a[1] + dz * t + nz * lateral;
          const radius = 0.3 + rand() * 0.22, sides = 5 + Math.floor(rand() * 3), spin = rand() * Math.PI;
          ctx.beginPath();
          for (let k = 0; k < sides; k++) {
            const angle = spin + k / sides * Math.PI * 2, r = radius * (0.8 + rand() * 0.4);
            const x = cx + Math.cos(angle) * r, z = cz + Math.sin(angle) * r;
            if (k) ctx.lineTo(x, z); else ctx.moveTo(x, z);
          }
          ctx.closePath(); ctx.fill();
        }
        nextAt += 1.15;
      }
      travelled += length;
    }
  }
  for (const lantern of GARDEN_LANTERNS) {
    const radius = 2.6;
    const gradient = ctx.createRadialGradient(lantern.x, lantern.z, 0, lantern.x, lantern.z, radius);
    gradient.addColorStop(0, "rgba(0,0,255,0.95)"); gradient.addColorStop(0.4, "rgba(0,0,255,0.45)"); gradient.addColorStop(1, "rgba(0,0,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(lantern.x - radius, lantern.z - radius, radius * 2, radius * 2);
  }
  // Preserve the painted RGB exactly. Canvas alpha would premultiply away the path/stone/lamp
  // data where there is no shadow, so pack this independent mask channel directly into RGBA.
  const data = new Uint8Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
  for (let i = 3; i < data.length; i += 4) data[i] = 0;
  for (const tree of GARDEN_WILLOWS) {
    const radius = 3.7 * tree.scale, cx = tree.x - 0.45 * tree.scale, cz = tree.z + 0.55 * tree.scale;
    const minX = Math.max(0, Math.floor((cx - radius * 1.2 - GARDEN_MASK.minX) * sx));
    const maxX = Math.min(canvas.width - 1, Math.ceil((cx + radius * 1.2 - GARDEN_MASK.minX) * sx));
    const minZ = Math.max(0, Math.floor((cz - radius - GARDEN_MASK.minZ) * sz));
    const maxZ = Math.min(canvas.height - 1, Math.ceil((cz + radius - GARDEN_MASK.minZ) * sz));
    const phase = tree.seed * Math.PI * 2;
    for (let iz = minZ; iz <= maxZ; iz++) for (let ix = minX; ix <= maxX; ix++) {
      const x = GARDEN_MASK.minX + (ix + 0.5) / sx, z = GARDEN_MASK.minZ + (iz + 0.5) / sz;
      const dx = x - cx, dz = z - cz, angle = Math.atan2(dz, dx);
      const edge = 1 + 0.1 * Math.sin(angle * 3 + phase) + 0.065 * Math.cos(angle * 5 - phase);
      const d = Math.hypot(dx / radius, dz / (radius * 0.85)) / edge;
      const envelope = Math.max(0, 1 - d * d);
      const dapple = 0.78 + 0.12 * Math.sin(dx * 3.5 + dz * 1.8 + phase)
        + 0.1 * Math.sin(dx * 6.7 - phase) * Math.cos(dz * 5.2 + phase);
      const canopy = 0.38 * envelope * envelope * dapple;
      const trunkDistance = Math.hypot(x - tree.x, z - tree.z);
      const contact = 0.65 * Math.exp(-Math.pow(trunkDistance / 0.24, 2)) * Math.max(0, 1 - trunkDistance / 0.65);
      const index = (iz * canvas.width + ix) * 4 + 3;
      data[index] = Math.max(data[index], Math.round(Math.max(canopy, contact) * 255));
    }
  }
  const t = new THREE.DataTexture(data, canvas.width, canvas.height, THREE.RGBAFormat);
  t.flipY = false;
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** 호수 부호 거리를 구운 텍스처 (512²): R = clamp(signed / 12 + 0.5). 셰이더가 물가·연잎·비 파문·수심에 쓴다. */
export const LAKE_MASK = { minX: -62, minZ: -32, width: 124, depth: 134, size: 512 } as const;
export function lakeDistanceTexture(): THREE.DataTexture {
  const { size } = LAKE_MASK;
  const data = new Uint8Array(size * size * 4);
  for (let iz = 0; iz < size; iz++) for (let ix = 0; ix < size; ix++) {
    const x = LAKE_MASK.minX + (ix + 0.5) / size * LAKE_MASK.width, z = LAKE_MASK.minZ + (iz + 0.5) / size * LAKE_MASK.depth;
    const signed = lakeSigned(x, z);
    const i = (iz * size + ix) * 4;
    data[i] = Math.round(Math.max(0, Math.min(1, signed / 12 + 0.5)) * 255);
    data[i + 1] = Math.round(Math.max(0, Math.min(1, Math.hypot(x - LAKE.x, z - LAKE.z) / 60)) * 255);
    data[i + 2] = 0; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** 수면 위 안개 빌보드용 부드러운 얼룩 (64²) */
export function mistTexture(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  const S = 64, { canvas, ctx } = canvas2d(S, S, true);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,0.55)"); g.addColorStop(0.5, "rgba(255,255,255,0.22)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return texture(canvas);
}

void pierEnd;
