/**
 * 바닷가의 낮과 밤. 기기의 현재 시각(0~24시)을 받아 하늘·바다·모래·캐릭터 색과 해·달 위치를 돌려준다.
 * 키프레임(새벽·해돋이·아침·낮·오후·노을·저녁·밤) 사이를 선형으로 섞어서 시간이 흐르면 끊김 없이 바뀐다.
 * 색은 전부 sRGB 0~1 (셰이더와 스프라이트 색조에 그대로 넣는다).
 */
export type RGB = [number, number, number];
export type Vec3 = [number, number, number];

export interface Daylight {
  hour: number;
  /** 새벽 · 아침 · 낮 · 오후 · 노을 · 저녁 · 밤 */
  label: string;
  /** 해·달 방향 (단위 벡터). y 가 0 보다 작으면 지평선 아래 */
  sun: Vec3;
  moon: Vec3;
  skyTop: RGB;
  skyHorizon: RGB;
  sunColor: RGB;
  cloud: RGB;
  cloudAmount: number;
  seaDeep: RGB;
  seaShallow: RGB;
  foam: RGB;
  sandTint: RGB;
  /** 캐릭터·소품 스프라이트에 곱하는 색 (밤에는 푸르스름하게 어둡다) */
  tint: RGB;
  fog: RGB;
  fogNear: number;
  fogFar: number;
  /** 별 밝기 0~1 */
  stars: number;
  /** 해 둘레 빛 0~1 (지평선 가까울수록 크다) */
  sunGlow: number;
  /** 바다에 비치는 해·달 반짝임 세기 */
  specular: number;
  /** 모닥불이 켜진 정도 0~1 */
  fire: number;
  /** 밤하늘 풍등이 떠 있는 정도 0~1 (저녁에 하나둘 올라 밤에 가득, 아침·낮엔 0) */
  lanterns: number;
}

type Key = Omit<Daylight, "hour" | "label" | "sun" | "moon" | "fogNear" | "fogFar" | "fire" | "lanterns">;

const c = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const NIGHT: Key = {
  skyTop: c("#070c22"), skyHorizon: c("#182548"), sunColor: c("#ffffff"), cloud: c("#222a44"), cloudAmount: 0.35,
  seaDeep: c("#07152d"), seaShallow: c("#123050"), foam: c("#8ea2c0"),
  // 풍등 불빛을 받아 밤에도 캐릭터가 따뜻하게 보이도록 푸른 기를 줄였다
  sandTint: [0.4, 0.45, 0.62], tint: [0.76, 0.68, 0.7], fog: c("#141f3d"), stars: 1, sunGlow: 0, specular: 0.6,
};
const DAWN: Key = {
  skyTop: c("#2b3a6a"), skyHorizon: c("#e2906f"), sunColor: c("#ffd0a0"), cloud: c("#6a5a7a"), cloudAmount: 0.4,
  seaDeep: c("#16365a"), seaShallow: c("#3a6a88"), foam: c("#d8c8c8"),
  sandTint: [0.8, 0.7, 0.74], tint: [0.82, 0.74, 0.78], fog: c("#c98a80"), stars: 0.35, sunGlow: 0.9, specular: 0.7,
};
const SUNRISE: Key = {
  skyTop: c("#6b93cf"), skyHorizon: c("#ffc58f"), sunColor: c("#fff0c8"), cloud: c("#ffd9c0"), cloudAmount: 0.45,
  seaDeep: c("#2a6b9c"), seaShallow: c("#58a8c4"), foam: c("#fff2e8"),
  sandTint: [1, 0.92, 0.84], tint: [1, 0.92, 0.84], fog: c("#ffd3aa"), stars: 0, sunGlow: 1, specular: 1,
};
const MORNING: Key = {
  skyTop: c("#4f98e8"), skyHorizon: c("#cde8f8"), sunColor: c("#fffaf0"), cloud: c("#ffffff"), cloudAmount: 0.5,
  seaDeep: c("#1e7dba"), seaShallow: c("#5cc8dc"), foam: c("#ffffff"),
  sandTint: [1, 1, 1], tint: [1, 1, 1], fog: c("#d8edf9"), stars: 0, sunGlow: 0.5, specular: 1,
};
const DAY: Key = {
  skyTop: c("#2f85e6"), skyHorizon: c("#cfeafb"), sunColor: c("#ffffff"), cloud: c("#ffffff"), cloudAmount: 0.45,
  seaDeep: c("#1773b8"), seaShallow: c("#5fd2de"), foam: c("#ffffff"),
  sandTint: [1, 1, 1], tint: [1, 1, 1], fog: c("#dbeffb"), stars: 0, sunGlow: 0.35, specular: 1,
};
const AFTERNOON: Key = {
  skyTop: c("#4a92dc"), skyHorizon: c("#e9dcc4"), sunColor: c("#fff4dc"), cloud: c("#fff6ea"), cloudAmount: 0.45,
  seaDeep: c("#1f6fae"), seaShallow: c("#5ab9cc"), foam: c("#fffaf2"),
  sandTint: [1, 0.98, 0.93], tint: [1, 0.97, 0.92], fog: c("#ead9c2"), stars: 0, sunGlow: 0.6, specular: 1,
};
const SUNSET: Key = {
  skyTop: c("#4a4f92"), skyHorizon: c("#ff9a5a"), sunColor: c("#ffd8a0"), cloud: c("#ffb088"), cloudAmount: 0.5,
  seaDeep: c("#27477a"), seaShallow: c("#7a7f9c"), foam: c("#ffe6d0"),
  sandTint: [1, 0.82, 0.7], tint: [1, 0.8, 0.68], fog: c("#f2a070"), stars: 0.05, sunGlow: 1, specular: 1.1,
};
const DUSK: Key = {
  skyTop: c("#1c2552"), skyHorizon: c("#c85a62"), sunColor: c("#ffb080"), cloud: c("#4a3a62"), cloudAmount: 0.45,
  seaDeep: c("#132a4e"), seaShallow: c("#2e4b70"), foam: c("#c9b4c4"),
  sandTint: [0.72, 0.62, 0.7], tint: [0.74, 0.64, 0.72], fog: c("#6c4a6e"), stars: 0.5, sunGlow: 0.5, specular: 0.8,
};

const KEYS: [number, Key][] = [
  [0, NIGHT], [4.5, NIGHT], [5.5, DAWN], [6.5, SUNRISE], [8.5, MORNING], [12, DAY], [16, AFTERNOON], [17.8, SUNSET], [19, DUSK], [20.3, NIGHT], [24, NIGHT],
];

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixRgb = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * 해는 6시에 오른쪽 앞(+x, 바다 쪽)에서 떠서 정오에 높이 올랐다가 18시에 왼쪽 앞으로 진다 — 노을이 바다 위에 걸리게.
 * 달은 해와 반대편 (밤에 떠 있다)
 */
function bodyDir(theta: number, maxElev: number): Vec3 {
  const e = Math.sin(theta) * maxElev;
  return normalize([Math.cos(theta) * Math.cos(e), Math.sin(e), -0.45 * Math.cos(e)]);
}

export function labelOf(hour: number): string {
  if (hour < 5) return "밤";
  if (hour < 7) return "새벽";
  if (hour < 11) return "아침";
  if (hour < 15) return "낮";
  if (hour < 17.5) return "오후";
  if (hour < 19) return "노을";
  if (hour < 21) return "저녁";
  return "밤";
}

/** 시각(0~24) 의 바닷가 색 */
export function daylightAt(hourIn: number): Daylight {
  const hour = ((hourIn % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= hour) i++;
  const [h0, a] = KEYS[i];
  const [h1, b] = KEYS[i + 1];
  const t = h1 === h0 ? 0 : (hour - h0) / (h1 - h0);
  const k = (key: keyof Key) => mix(a[key] as number, b[key] as number, t);
  const kc = (key: keyof Key) => mixRgb(a[key] as RGB, b[key] as RGB, t);
  const theta = ((hour - 6) / 12) * Math.PI;
  const fire = hour >= 17.3 ? smooth((hour - 17.3) / 1) : hour <= 7 ? 1 - smooth((hour - 6) / 1) : 0;
  const stars = k("stars");
  const lanterns = Math.max(0, Math.min(1, (stars - 0.25) / 0.6));
  return {
    hour,
    label: labelOf(hour),
    sun: bodyDir(theta, 1.15),
    moon: bodyDir(theta + Math.PI, 0.9),
    skyTop: kc("skyTop"), skyHorizon: kc("skyHorizon"), sunColor: kc("sunColor"), cloud: kc("cloud"), cloudAmount: k("cloudAmount"),
    seaDeep: kc("seaDeep"), seaShallow: kc("seaShallow"), foam: kc("foam"),
    sandTint: kc("sandTint"), tint: kc("tint"), fog: kc("fog"), fogNear: 28, fogFar: 150,
    stars, sunGlow: k("sunGlow"), specular: k("specular"), fire, lanterns,
  };
}

/** 지금 시각 (분까지, 0~24) */
export function currentHour(now = new Date()): number {
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}

/** 개발 환경에서만 ?hour=20 처럼 시각을 고정해 미리 볼 수 있다 */
export function hourOverride(search: string): number | null {
  if (process.env.NODE_ENV === "production") return null;
  const v = new URLSearchParams(search).get("hour");
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? ((n % 24) + 24) % 24 : null;
}

/** HUD 에 보여 주는 시각 ("저녁 7시", "낮 12시 반") */
export function hourLabel(hour: number): string {
  const h = Math.floor(hour) % 24;
  const half = hour - Math.floor(hour) >= 0.5;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${labelOf(hour)} ${h12}시${half ? " 반" : ""}`;
}
