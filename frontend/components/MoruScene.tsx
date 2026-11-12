import { useId, type CSSProperties, type ReactNode } from "react";
import styles from "./MoruRoom.module.css";

/**
 * 모루의 공간 그림이 같이 쓰는 부품.
 * 그림은 480×700 고정 무대(방 바닥은 600, 그 아래는 패드 뒤로 이어지는 이불)에 손그림 선으로 그리고 방 아래 가운데에 붙인다:
 * 늘이지 않아 선 굵기가 고르고, 모루(바닥에서 71px)와 침대가 어느 화면에서나 같은 자리에서 만난다.
 * 창밖은 무대 뒤에 따로 깔고 transform 만 움직인다 (합성 단계에서 돈다). 창밖도 겹마다 손그림 외곽선과 떨림을 갖는다 (떨림은 한 벌마다 같은 자리라 이음매가 없다).
 */

export const INK = "#3d2a20";

/** 서버와 브라우저가 같은 그림을 그리도록 정해진 순서의 난수 */
function seeded(seed: number) {
  let s = seed % 2147483647;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}
const TILE = 320; // 풍경 한 벌의 폭. 두 벌을 이어 붙여 끊김 없이 돈다
const VIEW = 208; // 풍경 띠의 높이. 창이 더 높으면 띠는 창 아래에 붙고 위는 하늘이다

/** 창밖 한 겹의 선 색·굵기: 먼 곳일수록 옅고 가늘다 (방 그림과 같은 손그림 외곽선) */
interface Ink { line: string; width: number }

/** 건물 한 벌: 둥근 모서리 몸통, 가끔 지붕 소품(안테나·물탱크·뾰족 지붕), 창은 외곽선 없이 불빛만 */
function skyline(seed: number, base: number, minH: number, maxH: number, fill: string, ink: Ink, lit?: string[], litRate = 0.3): ReactNode {
  const rnd = seeded(seed), bodies: ReactNode[] = [], lights: ReactNode[] = [];
  for (let x = 2, i = 0; x < TILE - 6; i++) {
    const w = Math.round(24 + rnd() * 24), h = Math.round(minH + rnd() * (maxH - minH)), top = base - h, right = Math.min(x + w, TILE - 2);
    const roof = rnd();
    bodies.push(<g key={`b${i}`}>
      {roof < 0.18 && <path d={`M${x + 2} ${top}L${(x + right) / 2} ${top - 9}L${right - 2} ${top}Z`} />}
      <rect x={x} y={top} width={right - x} height={VIEW - top + 4} rx="3" />
      {roof >= 0.18 && roof < 0.36 && <path fill="none" d={`M${x + 7} ${top}V${top - 9}M${x + 4} ${top - 6}H${x + 10}`} />}
      {roof >= 0.36 && roof < 0.5 && <><rect x={right - 13} y={top - 8} width="8" height="8" rx="2" /><path fill="none" d={`M${right - 12} ${top - 8}V${top}M${right - 6} ${top - 8}V${top}`} /></>}
    </g>);
    if (lit) for (let wy = top + 8; wy < base - 4; wy += 10) for (let wx = x + 5; wx < right - 6; wx += 8) {
      if (rnd() < litRate) lights.push(<rect key={`w${i}-${wx}-${wy}`} x={wx} y={wy} width="4" height="5" rx="1.2" fill={lit[Math.floor(rnd() * lit.length)]} />);
    }
    x += w + (rnd() < 0.35 ? 6 : 2);
  }
  return <><g fill={fill} stroke={ink.line} strokeWidth={ink.width} strokeLinejoin="round" strokeLinecap="round">{bodies}</g><g>{lights}</g></>;
}
/** 침엽수 한 벌: 세 층으로 둥글게 처진 가지, 눈 덮인 숲은 cap 색으로 꼭대기·가지 끝을 덮는다 */
function pines(seed: number, base: number, minH: number, maxH: number, gap: number, fill: string, ink: Ink, cap?: string): ReactNode {
  const rnd = seeded(seed), out: ReactNode[] = [];
  for (let x = 14, i = 0; x < TILE - 14; i++) {
    const h = minH + rnd() * (maxH - minH), w = h * 0.5, t = base - h;
    const tier = (y0: number, y1: number, half: number) => `M${x} ${y0}Q${x + half * 0.5} ${(y0 + y1) / 2} ${x + half} ${y1}Q${x} ${y1 + h * 0.06} ${x - half} ${y1}Q${x - half * 0.5} ${(y0 + y1) / 2} ${x} ${y0}Z`;
    out.push(<g key={i}>
      <path fill="none" d={`M${x} ${base - h * 0.2}V${base + 4}`} />
      <path d={tier(t + h * 0.38, base - h * 0.12, w / 2)} />
      <path d={tier(t + h * 0.16, t + h * 0.62, w * 0.38)} />
      <path d={tier(t, t + h * 0.38, w * 0.26)} />
      {cap && <path fill={cap} d={`M${x} ${t}Q${x + w * 0.13} ${t + h * 0.14} ${x + w * 0.2} ${t + h * 0.26}Q${x} ${t + h * 0.3} ${x - w * 0.2} ${t + h * 0.26}Q${x - w * 0.13} ${t + h * 0.14} ${x} ${t}Z`} />}
    </g>);
    x += gap * (0.6 + rnd() * 0.9);
  }
  return <g fill={fill} stroke={ink.line} strokeWidth={ink.width} strokeLinejoin="round" strokeLinecap="round">{out}</g>;
}
/** 손그림 구름 몇 개 (먼 하늘) */
function clouds(seed: number, y: number, fill: string, ink: Ink): ReactNode {
  const rnd = seeded(seed), out: ReactNode[] = [];
  for (let x = 30, i = 0; x < TILE - 40; i++) {
    const w = 34 + rnd() * 30, cy = y + rnd() * 26;
    out.push(<path key={i} d={`M${x} ${cy}Q${x - 4} ${cy - 10} ${x + w * 0.22} ${cy - 9}Q${x + w * 0.3} ${cy - 20} ${x + w * 0.52} ${cy - 15}Q${x + w * 0.72} ${cy - 22} ${x + w * 0.84} ${cy - 10}Q${x + w + 6} ${cy - 8} ${x + w} ${cy}Z`} />);
    x += w + 50 + rnd() * 60;
  }
  return <g fill={fill} stroke={ink.line} strokeWidth={ink.width} strokeLinejoin="round">{out}</g>;
}
/** 언덕·땅 한 줄: 아래는 띠 끝까지 채우고, 선은 윗줄만 긋는다 (양 끝의 세로선이 띠 이음매에 보이지 않게) */
const hill = (d: string, fill: string, ink: Ink) => <>
  <path d={`${d}V${VIEW + 4}H-4Z`} fill={fill} stroke="none" />
  <path d={d} fill="none" stroke={ink.line} strokeWidth={ink.width} strokeLinejoin="round" strokeLinecap="round" />
</>;

/**
 * 한 벌을 두 번 이어 붙인 띠. pass(초)가 있으면 그 시간에 한 벌만큼 흘러간다 (기차), 없으면 멈춰 있다 (집).
 * 선의 떨림(손그림)은 한 벌마다 같은 자리에서 걸어서, 두 벌이 이어지는 곳과 다시 처음으로 돌아갈 때 선이 튀지 않는다
 */
function Strip({ pass, children }: { pass?: number; children: ReactNode }) {
  const id = useId();
  return <svg className={styles.strip} data-pass={pass ? "" : undefined} style={pass ? { animationDuration: `${pass}s` } : undefined} viewBox={`0 0 ${TILE * 2} ${VIEW}`} width={TILE * 2} height={VIEW}>
    <defs>
      <filter id={id} x="-3%" y="-6%" width="106%" height="112%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
    {[0, TILE].map((dx) => <g key={dx} transform={`translate(${dx})`}><g filter={`url(#${id})`}>{children}</g></g>)}
  </svg>;
}
/** 비·눈: 한 주기(dx, dy)만큼 옮기면 제자리와 겹치도록 같은 무늬를 되풀이한다. 달리는 기차에서는 뒤로 많이 눕는다 */
function Weather({ snow, big = false, color, width, height, moving }: { snow: boolean; big?: boolean; color: string; width: number; height: number; moving: boolean }) {
  const dx = snow ? (moving ? -36 : -12) : moving ? -20 : -5, dy = snow ? 80 : 52;
  const rnd = seeded(big ? 53 : snow ? 77 : 31), span = width + 300, rows = Math.ceil(height / dy) + 2, marks: ReactNode[] = [];
  const count = Math.round((big ? 10 : snow ? 30 : 22) * span / 420); // 첫눈은 큰 송이가 드문드문 더 내린다
  for (let i = 0; i < count; i++) {
    const x = rnd() * span, y = rnd() * dy, size = (big ? 2.4 : 1) + rnd() * 1.6, o = 0.35 + rnd() * 0.5;
    for (let k = -1; k < rows; k++) marks.push(snow
      ? <circle key={`${i}-${k}`} cx={x + dx * k} cy={y + dy * k} r={size} fill={color} opacity={o} />
      : <path key={`${i}-${k}`} d={`M${x + dx * k} ${y + dy * k}l${dx / 4} 13`} stroke={color} strokeWidth={0.8 + size * 0.3} strokeLinecap="round" opacity={o * 0.8} />);
  }
  const style = { "--fall-x": `${dx}px`, "--fall-y": `${dy}px`, animationDuration: snow ? "5.5s" : moving ? ".5s" : ".62s" } as CSSProperties;
  return <svg className={styles.fall} style={style} viewBox={`0 ${-dy} ${span} ${height + dy * 2}`} width={span} height={height + dy * 2}>{marks}</svg>;
}

/** 겹마다의 선: 먼 곳은 옅고 가늘게, 가까운 곳은 방 그림의 갈색 선에 가깝게 */
const FAR: Ink = { line: "#8b8f9c", width: 1.3 }, MID: Ink = { line: "#5d5f6c", width: 1.7 }, NEAR: Ink = { line: "#3d2f2c", width: 2.1 };
const NIGHT_FAR: Ink = { line: "#0e1226", width: 1.3 }, NIGHT_MID: Ink = { line: "#080a18", width: 1.7 }, NIGHT_NEAR: Ink = { line: "#05060f", width: 2.1 };
const SNOW_FAR: Ink = { line: "#94a2ae", width: 1.3 }, SNOW_MID: Ink = { line: "#4c5a66", width: 1.7 }, SNOW_NEAR: Ink = { line: "#2f3a43", width: 2.1 };
const GREEN_FAR: Ink = { line: "#86958c", width: 1.3 }, GREEN_MID: Ink = { line: "#4f5f55", width: 1.7 }, GREEN_NEAR: Ink = { line: "#33302a", width: 2.1 };

/** 창밖의 하늘: 풍경(도시·숲) × 날씨(비·눈·맑음) × 낮밤. 날씨는 날마다 무작위로 정해진다 (moru-rules 의 dailySky) */
export interface Sky { land: "city" | "forest"; weather: "rain" | "snow" | "clear"; night: boolean; /** 드문 하늘: rainbow·shootingStar·aurora·firstSnow (서버가 정한다) */ rare?: string | null }
export const DEFAULT_SKY: Sky = { land: "city", weather: "rain", night: false };

/** 해·달·별, 그리고 드문 하늘(무지개·별똥별·오로라·첫눈): 띠와 함께 흐르지 않고 하늘에 붙어 있다 */
function Lights({ sky, width }: { sky: Sky; width: number }) {
  const rare = sky.rare ?? null;
  const x = width - 42;
  const parts: ReactNode[] = [];
  if (rare === "aurora") {
    // 오로라: 초록·청록·보라의 물결 띠가 천천히 일렁인다
    parts.push(<g key="aurora" className={styles.aurora} opacity=".55">
      {[["#7de0b8", 26, 0], ["#6fc9d6", 42, 9], ["#b79be8", 58, 17]].map(([color, y, k]) => <path key={String(color)} fill="none" stroke={String(color)} strokeWidth="12" strokeLinecap="round"
        d={`M-10 ${y}C${width * 0.2} ${Number(y) - 18 + Number(k)} ${width * 0.35} ${Number(y) + 16} ${width * 0.55} ${Number(y) - 4}S${width * 0.85} ${Number(y) - 20} ${width + 10} ${Number(y) + 4}`} />)}
    </g>);
  }
  if (sky.weather === "clear" && !sky.night) {
    if (rare === "rainbow") parts.push(<g key="rainbow" fill="none" strokeWidth="5" opacity=".7" strokeLinecap="round">
      {["#f3a3a3", "#f6c98a", "#f3e58f", "#a6d9a2", "#9cc4ee", "#c3a8e8"].map((color, i) => <path key={color} stroke={color} d={`M${width * 0.08 + i * 5} 96A${width * 0.42 - i * 5} ${70 - i * 5} 0 0 1 ${width * 0.92 - i * 5} 96`} />)}
    </g>);
    parts.push(<g key="sun"><circle cx={x} cy={38} r="26" fill="#fff4c6" opacity=".45" /><circle cx={x} cy={38} r="14" fill="#ffe9a8" stroke="#d9a55e" strokeWidth="1.8" /></g>);
  }
  if (sky.night && sky.weather === "clear") {
    const rnd = seeded(91);
    for (let i = 0; i < Math.round(width / 26); i++) {
      const sx = 10 + rnd() * (width - 20), sy = 8 + rnd() * 80, r = 1.6 + rnd() * 1.6;
      parts.push(<path key={`s${i}`} d={`M${sx} ${sy - r * 2}Q${sx + r * 0.3} ${sy - r * 0.3} ${sx + r * 2} ${sy}Q${sx + r * 0.3} ${sy + r * 0.3} ${sx} ${sy + r * 2}Q${sx - r * 0.3} ${sy + r * 0.3} ${sx - r * 2} ${sy}Q${sx - r * 0.3} ${sy - r * 0.3} ${sx} ${sy - r * 2}Z`} fill="#fff3cf" opacity={0.55 + rnd() * 0.4} />);
    }
    parts.push(<g key="moon"><circle cx={x} cy={36} r="22" fill="#fff3cf" opacity=".18" /><path d={`M${x + 6} ${22}A14 14 0 1 0 ${x + 8} ${50}A11 11 0 1 1 ${x + 6} ${22}Z`} fill="#fff1c4" stroke="#c9a96a" strokeWidth="1.6" strokeLinejoin="round" /></g>);
    // 별똥별: 몇 초마다 하늘을 비스듬히 긋고 사라진다
    if (rare === "shootingStar") parts.push(<g key="shooting" className={styles.shootingStar}>
      <path d={`M${width * 0.2} 20L${width * 0.2 - 46} 46`} stroke="#fff3cf" strokeWidth="2" strokeLinecap="round" opacity=".8" />
      <circle cx={width * 0.2} cy={20} r="2.6" fill="#fffbe8" />
    </g>);
  }
  if (!parts.length) return null;
  return <svg className={styles.skyLights} viewBox={`0 0 ${width} 110`} width={width} height={110}>{parts}</svg>;
}

/**
 * 창밖. 방과 같은 손그림: 겹마다 외곽선, 살짝 떨리는 선, 둥근 모서리, 차분한 색.
 * moving 이면 먼 곳·가운데·가까운 곳이 서로 다른 빠르기로 지나간다 (기차). 아니면 풍경은 멈춰 있고 비·눈만 내린다.
 */
export function Outside({ sky, moving = false, width, height, className }: { sky: Sky; moving?: boolean; width: number; height: number; className: string }) {
  const lamp = useId();
  const pass = (seconds: number) => (moving ? seconds : undefined);
  const { land, weather, night } = sky;
  const snowy = weather === "snow";
  const cloudFill = night ? "#2c3460" : weather === "clear" ? "#f4f7f8" : "#d6dde2";
  return <div className={`${styles.view} ${className}`} data-sky={`${weather}-${night ? "night" : "day"}`}>
    <Lights sky={sky} width={width} />
    {weather !== "snow" && <Strip pass={pass(120)}>{clouds(night ? 41 : 13, night ? 40 : 30, cloudFill, night ? NIGHT_FAR : FAR)}</Strip>}
    {land === "forest" ? (night ? <>
      <Strip pass={pass(80)}>{hill("M-4 132C50 116 96 140 150 128S262 112 324 132", snowy ? "#2a3356" : "#1d2442", NIGHT_FAR)}{pines(5, 134, 20, 32, 26, "#1f2747", NIGHT_FAR, snowy ? "#8e9bc0" : undefined)}</Strip>
      <Strip pass={pass(30)}>{hill("M-4 162C70 150 120 170 190 158S280 150 324 162", snowy ? "#323c63" : "#171d38", NIGHT_FAR)}{pines(9, 164, 46, 84, 40, "#161b35", NIGHT_MID, snowy ? "#aab5d6" : undefined)}</Strip>
      <Strip pass={pass(9)}>{hill("M-4 190C80 182 150 196 230 186C270 182 300 186 324 190", snowy ? "#3b4670" : "#10142b", NIGHT_FAR)}{moving ? pines(13, 196, 110, 170, 150, "#0f1329", NIGHT_NEAR, snowy ? "#b8c2e0" : undefined) : pines(13, 198, 40, 70, 120, "#0f1329", NIGHT_NEAR, snowy ? "#b8c2e0" : undefined)}</Strip>
    </> : snowy ? <>
      <Strip pass={pass(80)}>{hill("M-4 132C50 116 96 140 150 128S262 112 324 132", "#e4ebf0", SNOW_FAR)}{pines(5, 134, 20, 32, 26, "#b7c5d0", SNOW_FAR, "#f3f7f9")}</Strip>
      <Strip pass={pass(30)}>{hill("M-4 162C70 150 120 170 190 158S280 150 324 162", "#f0f4f7", SNOW_FAR)}{pines(9, 164, 46, 84, 40, "#7d93a1", SNOW_MID, "#f6f9fb")}</Strip>
      <Strip pass={pass(9)}>{hill("M-4 190C80 182 150 196 230 186C270 182 300 186 324 190", "#fbfcfd", SNOW_FAR)}{moving ? pines(13, 196, 110, 170, 150, "#5a6f7c", SNOW_NEAR, "#eef3f6") : pines(13, 198, 40, 70, 120, "#5a6f7c", SNOW_NEAR, "#eef3f6")}</Strip>
    </> : <>
      <Strip pass={pass(80)}>{hill("M-4 132C50 116 96 140 150 128S262 112 324 132", "#bccbc0", GREEN_FAR)}{pines(5, 134, 20, 32, 26, "#a2b7a8", GREEN_FAR)}</Strip>
      <Strip pass={pass(30)}>{hill("M-4 162C70 150 120 170 190 158S280 150 324 162", "#a9bda9", GREEN_FAR)}{pines(9, 164, 46, 84, 40, "#6f8f7b", GREEN_MID)}</Strip>
      <Strip pass={pass(9)}>{hill("M-4 190C80 182 150 196 230 186C270 182 300 186 324 190", "#8ca58f", GREEN_FAR)}{moving ? pines(13, 196, 110, 170, 150, "#4f6d5b", GREEN_NEAR) : pines(13, 198, 40, 70, 120, "#4f6d5b", GREEN_NEAR)}</Strip>
    </>) : night ? <>
      <Strip pass={pass(90)}>{skyline(21, 150, 34, 96, "#232a4d", NIGHT_FAR, ["#ffd98a", "#ffc46b", "#a8d6e4"], 0.22)}</Strip>
      <Strip pass={pass(32)}>{skyline(27, 172, 22, 60, "#181d3a", NIGHT_MID, ["#ffe2a0", "#ffb86a"], 0.34)}</Strip>
      <Strip pass={pass(7)}>
        <defs><radialGradient id={lamp}><stop offset="0" stopColor="#ffe2a0" stopOpacity=".85" /><stop offset="1" stopColor="#ffe2a0" stopOpacity="0" /></radialGradient></defs>
        {hill("M-4 192C90 186 220 196 324 192", snowy ? "#3b4670" : "#10132a", NIGHT_NEAR)}
        {(moving ? [70, 230] : [150]).map((x) => <g key={x} fill="#10132a" stroke={NIGHT_NEAR.line} strokeWidth={NIGHT_NEAR.width} strokeLinejoin="round">
          <path d={moving ? `M${x - 2.5} 60h5v140h-5zM${x} 59h20v4.500H${x}z` : `M${x - 2} 140h4v60h-4zM${x} 139h13v3.500H${x}z`} />
          <circle cx={x + (moving ? 17 : 11)} cy={moving ? 66 : 145} r={moving ? 26 : 16} fill={`url(#${lamp})`} stroke="none" />
          <circle cx={x + (moving ? 17 : 11)} cy={moving ? 66 : 145} r={moving ? 3.5 : 2.5} fill="#fff3cf" strokeWidth="1.2" />
        </g>)}
      </Strip>
    </> : <>
      <Strip pass={pass(90)}>{skyline(3, 146, 30, 92, weather === "clear" ? "#b6c6d2" : "#adbbc6", FAR)}</Strip>
      <Strip pass={pass(34)}>{skyline(8, 170, 20, 62, weather === "clear" ? "#95a9b8" : "#8d9fad", MID, ["#f7e3a8"], 0.14)}{pines(4, 176, 16, 26, 70, "#7f9a8b", MID)}</Strip>
      <Strip pass={pass(8)}>
        {hill("M-4 192C60 184 110 196 170 188S270 184 324 192", snowy ? "#eef3f6" : weather === "clear" ? "#7e9886" : "#74867f", NEAR)}
        {moving && <g stroke={NEAR.line} strokeLinejoin="round" strokeLinecap="round">
          <path fill="none" strokeWidth="1.3" d="M-70 47Q10 61 90 47T250 47T410 47" />
          {[90, 250].map((x) => <path key={x} fill="#5b5452" strokeWidth={NEAR.width} d={`M${x - 2.5} 30h5v170h-5zM${x - 15} 43h30v4.500h-30z`} />)}
        </g>}
      </Strip>
    </>}
    {weather === "rain" && <Weather snow={false} color={night ? "#c9d8ff" : "#eef4f8"} width={width} height={height} moving={moving} />}
    {weather === "snow" && <Weather snow color="#ffffff" width={width} height={height} moving={moving} />}
    {sky.rare === "firstSnow" && <Weather snow big color="#ffffff" width={width} height={height} moving={moving} />}
  </div>;
}

/** 무대와 실내 그림: 실내는 떨리는 외곽선(짙은 갈색 2.2px)으로 한 번만 그려지고, 창 자리는 비워 창밖이 비친다 */
export function Stage({ view, children }: { view: ReactNode; children: (glow: string) => ReactNode }) {
  const id = useId();
  const sketch = `${id}-sketch`, glow = `${id}-glow`;
  return <div className={styles.stage} data-moru-stage="" aria-hidden="true">
    {view}
    <svg className={styles.cabin} viewBox="0 0 480 700" width="480" height="700">
      <defs>
        <filter id={sketch} x="-2%" y="-2%" width="104%" height="104%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="11" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <radialGradient id={glow}><stop offset="0" stopColor="#ffd98a" stopOpacity=".5" /><stop offset=".55" stopColor="#ffc46b" stopOpacity=".16" /><stop offset="1" stopColor="#ffc46b" stopOpacity="0" /></radialGradient>
      </defs>
      <g filter={`url(#${sketch})`} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">{children(`url(#${glow})`)}</g>
    </svg>
  </div>;
}
/** 작은 전구 하나 (줄 전구) */
export function Bulb({ x, y }: { x: number; y: number }) {
  return <g><circle cx={x} cy={y} r="10" fill="#ffd98a" opacity=".3" stroke="none" /><ellipse cx={x} cy={y} rx="3.400" ry="4.400" fill="#ffe9b0" strokeWidth="1.400" /></g>;
}
