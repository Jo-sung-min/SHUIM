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
  /** 19:30~20:00에 깊어져 04:30까지 이어지고 새벽에 사라지는 심야 강도 */
  deepNight: number;
}

type Key = Omit<Daylight, "hour" | "label" | "sun" | "moon" | "fogNear" | "fogFar" | "fire" | "lanterns" | "deepNight">;

const c = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const NIGHT: Key = {
  skyTop: c("#070c22"), skyHorizon: c("#182548"), sunColor: c("#ffffff"), cloud: c("#222a44"), cloudAmount: 0.35,
  seaDeep: c("#07152d"), seaShallow: c("#123050"), foam: c("#8ea2c0"),
  // 풍등 불빛을 받아 밤에도 캐릭터가 따뜻하게 보이도록 푸른 기를 줄였다
  sandTint: [0.76, 0.79, 0.85], tint: [0.82, 0.82, 0.86], fog: c("#263b50"), stars: 1, sunGlow: 0, specular: 0.6,
};
const DAWN: Key = {
  skyTop: c("#2b3a6a"), skyHorizon: c("#e2906f"), sunColor: c("#ffd0a0"), cloud: c("#6a5a7a"), cloudAmount: 0.4,
  seaDeep: c("#16365a"), seaShallow: c("#3a6a88"), foam: c("#d8c8c8"),
  sandTint: [0.88, 0.84, 0.84], tint: [0.88, 0.83, 0.86], fog: c("#c9aaa5"), stars: 0.35, sunGlow: 0.9, specular: 0.7,
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
  // Rose reaches the upper sky as well as the horizon; reflected salt water shares this palette.
  skyTop: c("#b85891"), skyHorizon: c("#ff8c9f"), sunColor: c("#ffd2b3"), cloud: c("#ffc2d6"), cloudAmount: 0.62,
  seaDeep: c("#714964"), seaShallow: c("#cf8ba4"), foam: c("#ffe0e2"),
  sandTint: [1, 0.86, 0.87], tint: [1, 0.88, 0.9], fog: c("#df9ca8"), stars: 0.02, sunGlow: 1, specular: 1.05,
};
const AFTERGLOW: Key = {
  skyTop: c("#815181"), skyHorizon: c("#e979a1"), sunColor: c("#ffc1ae"), cloud: c("#ec9cbd"), cloudAmount: 0.6,
  seaDeep: c("#4e3b63"), seaShallow: c("#9d749b"), foam: c("#ead1e0"),
  sandTint: [0.94, 0.82, 0.89], tint: [0.94, 0.83, 0.91], fog: c("#b486a6"), stars: 0.14, sunGlow: 0.8, specular: 0.95,
};
const DUSK: Key = {
  skyTop: c("#30234f"), skyHorizon: c("#aa6388"), sunColor: c("#ffc1a8"), cloud: c("#655071"), cloudAmount: 0.45,
  seaDeep: c("#22263f"), seaShallow: c("#53496c"), foam: c("#c9b4c4"),
  sandTint: [0.82, 0.78, 0.84], tint: [0.83, 0.78, 0.85], fog: c("#74677f"), stars: 0.55, sunGlow: 0.35, specular: 0.8,
};

const KEYS: [number, Key][] = [
  [0, NIGHT], [4.5, NIGHT], [5.5, DAWN], [6.5, SUNRISE], [8.5, MORNING], [12, DAY], [16, AFTERNOON],
  [17.5, AFTERNOON], [18, SUNSET], [19, AFTERGLOW], [19.5, DUSK], [20, NIGHT], [24, NIGHT],
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
  if (hour < 20) return "저녁";
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
  // Keep the 18:00 rose sunset, then let stars and local lanterns lead by 20:00.
  const deepNight = hour >= 19.5 ? smooth((hour - 19.5) / 0.5) : hour <= 4.5 ? 1 : 1 - smooth(hour - 4.5);
  return {
    hour,
    label: labelOf(hour),
    sun: bodyDir(theta, 1.15),
    moon: bodyDir(theta + Math.PI, 0.9),
    skyTop: mixRgb(kc("skyTop"), c("#020713"), deepNight),
    skyHorizon: mixRgb(kc("skyHorizon"), c("#0a1528"), deepNight),
    sunColor: kc("sunColor"), cloud: mixRgb(kc("cloud"), c("#111b2b"), deepNight), cloudAmount: k("cloudAmount"),
    seaDeep: mixRgb(kc("seaDeep"), c("#030b15"), deepNight),
    seaShallow: mixRgb(kc("seaShallow"), c("#0b202c"), deepNight),
    foam: mixRgb(kc("foam"), c("#445367"), deepNight),
    sandTint: mixRgb(kc("sandTint"), [0.3, 0.35, 0.43], deepNight),
    tint: mixRgb(kc("tint"), [0.58, 0.62, 0.69], deepNight),
    fog: mixRgb(kc("fog"), c("#0a1421"), deepNight), fogNear: 28, fogFar: 150,
    stars, sunGlow: k("sunGlow"), specular: mix(k("specular"), 0.33, deepNight), fire, lanterns, deepNight,
  };
}

// Uyuni's sunset starts after the last afternoon light and joins the unchanged
// night palette at 20:00. These are final colors, including the deep-night endpoint.
const UYUNI_TWILIGHT_KEYS: [number, Key][] = [
  [17.5, daylightAt(17.5)],
  [18, {
    skyTop: c("#172744"), skyHorizon: c("#ed8240"), sunColor: c("#ffba7d"), cloud: c("#d9a07b"), cloudAmount: 0.5,
    seaDeep: c("#243749"), seaShallow: c("#ae795b"), foam: c("#f1ccb0"),
    sandTint: [1, 0.9, 0.82], tint: [1, 0.9, 0.84], fog: c("#b88c78"), stars: 0.42, sunGlow: 0.35, specular: 0.75,
  }],
  [19, {
    skyTop: c("#111c32"), skyHorizon: c("#925a41"), sunColor: c("#e0a583"), cloud: c("#806978"), cloudAmount: 0.46,
    seaDeep: c("#172536"), seaShallow: c("#655565"), foam: c("#b2adbf"),
    sandTint: [0.88, 0.8, 0.79], tint: [0.82, 0.8, 0.88], fog: c("#625367"), stars: 0.72, sunGlow: 0.12, specular: 0.6,
  }],
  [19.5, {
    skyTop: c("#0b1326"), skyHorizon: c("#3a374a"), sunColor: c("#b6b9cf"), cloud: c("#41445b"), cloudAmount: 0.4,
    seaDeep: c("#0c1929"), seaShallow: c("#30364b"), foam: c("#7d879d"),
    sandTint: [0.6, 0.58, 0.66], tint: [0.7, 0.72, 0.8], fog: c("#303448"), stars: 0.88, sunGlow: 0.02, specular: 0.45,
  }],
  [20, daylightAt(20)],
];

/** 우유니의 주황빛 잔광과 첫 별. 낮·새벽·20시 이후의 밤은 기존 팔레트를 그대로 쓴다. */
export function uyuniDaylightAt(hourIn: number): Daylight {
  const base = daylightAt(hourIn);
  const { hour } = base;
  if (hour <= 17.5 || hour >= 20) return base;
  let i = 0;
  while (i < UYUNI_TWILIGHT_KEYS.length - 2 && UYUNI_TWILIGHT_KEYS[i + 1][0] <= hour) i++;
  const [h0, a] = UYUNI_TWILIGHT_KEYS[i], [h1, b] = UYUNI_TWILIGHT_KEYS[i + 1];
  const t = (hour - h0) / (h1 - h0);
  const k = (key: keyof Key) => mix(a[key] as number, b[key] as number, t);
  const kc = (key: keyof Key) => mixRgb(a[key] as RGB, b[key] as RGB, t);
  const stars = k("stars");
  // At the sunset preset the disc is just below the horizon. Ease the small
  // offset in and out so natural-time visits keep a continuous celestial path.
  const sunDrop = 0.035 * smooth((hour - 17.5) / 0.5) * (1 - smooth((hour - 18) / 2));
  return {
    ...base,
    sun: normalize([base.sun[0], base.sun[1] - sunDrop, base.sun[2]]),
    skyTop: kc("skyTop"), skyHorizon: kc("skyHorizon"), sunColor: kc("sunColor"),
    cloud: kc("cloud"), cloudAmount: k("cloudAmount"),
    seaDeep: kc("seaDeep"), seaShallow: kc("seaShallow"), foam: kc("foam"),
    sandTint: kc("sandTint"), tint: kc("tint"), fog: kc("fog"),
    stars, sunGlow: k("sunGlow"), specular: k("specular"),
    lanterns: Math.max(0, Math.min(1, (stars - 0.25) / 0.6)),
  };
}

/**
 * 대나무숲: 빽빽한 줄기와 캐노피가 먼 곳을 가리므로 안개가 초록빛으로 가깝게 닫히고(그만큼 덜 그린다),
 * 낮에는 댓잎 그늘이 캐릭터에 살짝 초록빛을 얹는다. 밤 팔레트·등불 타이밍은 다른 지도와 같다.
 */
export function bambooSunsetAmount(hourIn: number): number {
  const hour = ((hourIn % 24) + 24) % 24;
  return smooth((hour - 17.5) / .5) * (1 - smooth(hour - 19));
}

export function bambooDaylightAt(hourIn: number): Daylight {
  const base = daylightAt(hourIn);
  const night = Math.max(0, Math.min(1, base.stars));
  const canopyFog: RGB = [0.5, 0.6, 0.38];
  const nightFog: RGB = [0.045, 0.075, 0.062];
  const fog = mixRgb(mixRgb(base.fog, canopyFog, 0.58 * (1 - night) + 0.25 * night), nightFog, base.deepNight);
  const shade: RGB = [base.tint[0] * 0.92, base.tint[1] * 1.0, base.tint[2] * 0.88];
  const lanternWarm: RGB = [0.74, 0.7, 0.68];
  const tint = mixRgb(mixRgb(base.tint, shade, 1 - night), lanternWarm, base.deepNight * 0.45);
  const sunset = bambooSunsetAmount(base.hour), evening = smooth((base.hour - 18) / 1.8);
  return {
    ...base, fog: mixRgb(fog, c("#766f82"), sunset * .65), fogNear: 14, fogFar: 62, tint,
    skyTop: mixRgb(base.skyTop, mixRgb(c("#17365b"), c("#141b3a"), evening), sunset),
    skyHorizon: mixRgb(base.skyHorizon, mixRgb(c("#f9b971"), c("#a5667d"), evening), sunset),
    sunColor: mixRgb(base.sunColor, c("#ffc28f"), sunset),
  };
}

/**
 * 봄물 정원: 차분한 진주빛 안개가 봄 산수와 호수를 잇는다. 가까운 소재의 색은 살리고
 * 밤에는 푸른 산과 따뜻한 등불이 대비된다. 밤 팔레트·등불 타이밍은 다른 지도와 같다.
 */
export function gardenDaylightAt(hourIn: number): Daylight {
  const base = daylightAt(hourIn);
  const night = Math.max(0, Math.min(1, base.stars));
  const paper: RGB = [0.89, 0.94, 0.94];
  const inkNight: RGB = [0.05, 0.08, 0.13];
  const fog = mixRgb(mixRgb(base.fog, paper, 0.64 * (1 - night)), inkNight, base.deepNight);
  const grey = (base.tint[0] + base.tint[1] + base.tint[2]) / 3;
  const washed: RGB = [mix(base.tint[0], grey, 0.06), mix(base.tint[1], grey, 0.06), mix(base.tint[2], grey, 0.06)];
  return { ...base, fog, fogNear: 55, fogFar: 220, tint: washed };
}

/** 구름 위 온천: 은청색 구름과 호박색 등불, 아래 도시까지 열려 있는 높은 공기층. */
export function cloudSpaDaylightAt(hourIn: number): Daylight {
  const base = uyuniDaylightAt(hourIn);
  const night = Math.max(0, Math.min(1, base.stars));
  return { ...base,
    fog: mixRgb([0.69, 0.78, 0.88], [0.055, 0.08, 0.14], night), fogNear: 105, fogFar: 460,
    cloud: mixRgb([0.96, 0.97, 1], [0.54, 0.63, 0.79], night),
    tint: mixRgb([1, 0.98, 0.96], [0.81, 0.85, 0.95], night),
    cloudAmount: 0.36,
  };
}

/**
 * 바이칼: 눈보라가 머금은 백청색 안개(낮)와 슬레이트빛 안개(밤), 차고 낮은 겨울 해. near/far 는 잠잠할 때의 값이고,
 * 눈보라 세기에 따른 축소와 산장 안에서의 완화는 엔진·월드가 곱한다.
 */
export function baikalDaylightAt(hourIn: number): Daylight {
  const base = uyuniDaylightAt(hourIn);
  const night = Math.max(0, Math.min(1, base.stars)), day = 1 - night;
  const fog = mixRgb(mixRgb([0.80, 0.86, 0.92], [0.07, 0.10, 0.16], night), [0.04, 0.06, 0.10], base.deepNight * 0.5);
  return {
    ...base, fog, fogNear: 60, fogFar: 320, cloudAmount: 0.7,
    skyTop: mixRgb(base.skyTop, [0.18, 0.36, 0.62], 0.35 * day),
    skyHorizon: mixRgb(base.skyHorizon, [0.78, 0.85, 0.92], 0.3 * day),
    sunColor: mixRgb(base.sunColor, [1, 0.93, 0.82], 0.4 * day),
    tint: mixRgb(base.tint, [0.88, 0.92, 1], 0.18 * day),
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

/** 개발 환경에서만 ?rain=1 (0~1) 로 봄물 정원의 비를, ?storm=1 로 바이칼의 눈보라를 고정해 볼 수 있다 */
export function rainOverride(search: string): number | null {
  if (process.env.NODE_ENV === "production") return null;
  const params = new URLSearchParams(search);
  const v = params.get("rain") ?? params.get("storm");
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
}

/** HUD 에 보여 주는 시각 ("저녁 7시", "낮 12시 반") */
export function hourLabel(hour: number): string {
  const h = Math.floor(hour) % 24;
  const half = hour - Math.floor(hour) >= 0.5;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${labelOf(hour)} ${h12}시${half ? " 반" : ""}`;
}
