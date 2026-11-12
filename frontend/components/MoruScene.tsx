import { useId, type CSSProperties, type ReactNode } from "react";
import styles from "./MoruRoom.module.css";

/**
 * 모루의 공간 그림이 같이 쓰는 부품.
 * 그림은 480×700 고정 무대(방 바닥은 600, 그 아래는 패드 뒤로 이어지는 이불)에 손그림 선으로 그리고 방 아래 가운데에 붙인다:
 * 늘이지 않아 선 굵기가 고르고, 모루(바닥에서 71px)와 침대가 어느 화면에서나 같은 자리에서 만난다.
 * 창밖은 무대 뒤에 따로 깔고 transform 만 움직인다 (합성 단계에서 돈다). 외곽선의 떨림은 멈춰 있는 실내 그림에만 건다.
 */

export const INK = "#3d2a20";

/** 서버와 브라우저가 같은 그림을 그리도록 정해진 순서의 난수 */
function seeded(seed: number) {
  let s = seed % 2147483647;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}
const TILE = 320; // 풍경 한 벌의 폭. 두 벌을 이어 붙여 끊김 없이 돈다
const VIEW = 208; // 풍경 띠의 높이. 창이 더 높으면 띠는 창 아래에 붙고 위는 하늘이다

/** 건물 실루엣 한 벌 (불 켜진 창은 lit 색으로 드문드문) */
function skyline(seed: number, base: number, minH: number, maxH: number, fill: string, lit?: string[], litRate = 0.3): ReactNode[] {
  const rnd = seeded(seed), out: ReactNode[] = [];
  for (let x = 0, i = 0; x < TILE; i++) {
    const w = Math.round(22 + rnd() * 26), h = Math.round(minH + rnd() * (maxH - minH)), top = base - h;
    out.push(<rect key={`b${i}`} x={x} y={top} width={Math.min(w, TILE - x)} height={VIEW - top} rx="2" fill={fill} />);
    if (rnd() < 0.3) out.push(<rect key={`r${i}`} x={x + 5} y={top - 6} width="3" height="7" fill={fill} />);
    if (lit) for (let wy = top + 7; wy < base - 4; wy += 10) for (let wx = x + 4; wx < Math.min(x + w, TILE) - 6; wx += 8) {
      if (rnd() < litRate) out.push(<rect key={`w${i}-${wx}-${wy}`} x={wx} y={wy} width="4" height="5" rx="1" fill={lit[Math.floor(rnd() * lit.length)]} />);
    }
    x += w + (rnd() < 0.35 ? 5 : 1);
  }
  return out;
}
/** 침엽수 한 벌 (눈 덮인 숲은 cap 색으로 꼭대기를 덮는다) */
function pines(seed: number, base: number, minH: number, maxH: number, gap: number, fill: string, cap?: string): ReactNode[] {
  const rnd = seeded(seed), out: ReactNode[] = [];
  for (let x = 14, i = 0; x < TILE - 14; i++) {
    const h = minH + rnd() * (maxH - minH), w = h * 0.46;
    out.push(<g key={i}>
      <path fill={fill} d={`M${x} ${base - h}L${x + w * 0.34} ${base - h * 0.56}H${x + w * 0.16}L${x + w / 2} ${base - h * 0.14}H${x + 2}V${base + 4}H${x - 2}V${base - h * 0.14}H${x - w / 2}L${x - w * 0.16} ${base - h * 0.56}H${x - w * 0.34}Z`} />
      {cap && <path fill={cap} d={`M${x} ${base - h}L${x + w * 0.3} ${base - h * 0.6}Q${x + w * 0.1} ${base - h * 0.66} ${x} ${base - h * 0.6}Q${x - w * 0.12} ${base - h * 0.66} ${x - w * 0.3} ${base - h * 0.6}Z`} />}
    </g>);
    x += gap * (0.6 + rnd() * 0.9);
  }
  return out;
}
/** 한 벌을 두 번 이어 붙인 띠. pass(초)가 있으면 그 시간에 한 벌만큼 흘러간다 (기차), 없으면 멈춰 있다 (집) */
function Strip({ pass, children }: { pass?: number; children: ReactNode }) {
  return <svg className={styles.strip} data-pass={pass ? "" : undefined} style={pass ? { animationDuration: `${pass}s` } : undefined} viewBox={`0 0 ${TILE * 2} ${VIEW}`} width={TILE * 2} height={VIEW}>
    {[0, TILE].map((dx) => <g key={dx} transform={`translate(${dx})`}>{children}</g>)}
  </svg>;
}
/** 비·눈: 한 주기(dx, dy)만큼 옮기면 제자리와 겹치도록 같은 무늬를 되풀이한다. 달리는 기차에서는 뒤로 많이 눕는다 */
function Weather({ snow, color, width, height, moving }: { snow: boolean; color: string; width: number; height: number; moving: boolean }) {
  const dx = snow ? (moving ? -36 : -12) : moving ? -20 : -5, dy = snow ? 80 : 52;
  const rnd = seeded(snow ? 77 : 31), span = width + 300, rows = Math.ceil(height / dy) + 2, marks: ReactNode[] = [];
  const count = Math.round((snow ? 30 : 22) * span / 420);
  for (let i = 0; i < count; i++) {
    const x = rnd() * span, y = rnd() * dy, size = 1 + rnd() * 1.6, o = 0.35 + rnd() * 0.5;
    for (let k = -1; k < rows; k++) marks.push(snow
      ? <circle key={`${i}-${k}`} cx={x + dx * k} cy={y + dy * k} r={size} fill={color} opacity={o} />
      : <path key={`${i}-${k}`} d={`M${x + dx * k} ${y + dy * k}l${dx / 4} 13`} stroke={color} strokeWidth={0.8 + size * 0.3} strokeLinecap="round" opacity={o * 0.8} />);
  }
  const style = { "--fall-x": `${dx}px`, "--fall-y": `${dy}px`, animationDuration: snow ? "5.5s" : moving ? ".5s" : ".62s" } as CSSProperties;
  return <svg className={styles.fall} style={style} viewBox={`0 ${-dy} ${span} ${height + dy * 2}`} width={span} height={height + dy * 2}>{marks}</svg>;
}

/**
 * 창밖: 0 비 오는 도시 · 1 눈 내리는 숲 · 2 비 오는 밤.
 * moving 이면 먼 곳·가운데·가까운 곳이 서로 다른 빠르기로 지나간다 (기차). 아니면 풍경은 멈춰 있고 비·눈만 내린다.
 */
export function Outside({ scene, moving = false, width, height, className }: { scene: number; moving?: boolean; width: number; height: number; className: string }) {
  const lamp = useId();
  const view = scene === 1 || scene === 2 ? scene : 0;
  const pass = (seconds: number) => (moving ? seconds : undefined);
  return <div className={`${styles.view} ${className}`} data-scene={view}>
    {view === 1 ? <>
      <Strip pass={pass(80)}><path fill="#dfe8ef" d="M0 132C50 116 96 140 150 128S262 112 320 132V208H0Z" />{pines(5, 134, 18, 30, 26, "#a9bbc8")}</Strip>
      <Strip pass={pass(30)}><path fill="#eef3f6" d="M0 162C70 150 120 170 190 158S280 150 320 162V208H0Z" />{pines(9, 164, 46, 84, 40, "#6d8898", "#f4f8fa")}</Strip>
      <Strip pass={pass(9)}><path fill="#f9fbfc" d="M0 190C80 182 150 196 230 186C270 182 300 186 320 190V208H0Z" />{moving ? pines(13, 196, 110, 170, 150, "#465d6c", "#e8eff3") : pines(13, 198, 40, 70, 120, "#465d6c", "#e8eff3")}</Strip>
      <Weather snow color="#ffffff" width={width} height={height} moving={moving} />
    </> : view === 2 ? <>
      <Strip pass={pass(90)}>{skyline(21, 150, 34, 96, "#141a33", ["#ffd98a", "#ffc46b", "#9fd4e6"], 0.22)}</Strip>
      <Strip pass={pass(32)}>{skyline(27, 172, 22, 60, "#0c1024", ["#ffe2a0", "#ffb86a"], 0.34)}</Strip>
      <Strip pass={pass(7)}>
        <defs><radialGradient id={lamp}><stop offset="0" stopColor="#ffe2a0" stopOpacity=".85" /><stop offset="1" stopColor="#ffe2a0" stopOpacity="0" /></radialGradient></defs>
        <path fill="#070916" d="M0 192C90 186 220 196 320 192V208H0Z" />
        {(moving ? [70, 230] : [150]).map((x) => <g key={x}><path fill="#070916" d={moving ? `M${x - 2} 60h4v140h-4zM${x} 60h18v3H${x}z` : `M${x - 1.500} 140h3v60h-3zM${x} 140h12v2.500H${x}z`} /><circle cx={x + (moving ? 17 : 11)} cy={moving ? 66 : 145} r={moving ? 26 : 16} fill={`url(#${lamp})`} /><circle cx={x + (moving ? 17 : 11)} cy={moving ? 66 : 145} r={moving ? 3 : 2} fill="#fff3cf" /></g>)}
      </Strip>
      <Weather snow={false} color="#c9d8ff" width={width} height={height} moving={moving} />
    </> : <>
      <Strip pass={pass(90)}>{skyline(3, 146, 30, 92, "#93a5b5")}</Strip>
      <Strip pass={pass(34)}>{skyline(8, 170, 20, 62, "#6f8496", ["#f7e3a8"], 0.14)}{pines(4, 176, 14, 24, 70, "#5f7d76")}</Strip>
      <Strip pass={pass(8)}>
        <path fill="#4b5c60" d="M0 192C60 184 110 196 170 188S270 184 320 192V208H0Z" />
        {moving && <>{[90, 250].map((x) => <path key={x} fill="#3c4750" d={`M${x - 2} 30h4v170h-4zM${x - 14} 44h28v3h-28z`} />)}<path fill="none" stroke="#3c4750" strokeWidth="1.2" d="M-70 46Q10 60 90 46T250 46T410 46" /></>}
      </Strip>
      <Weather snow={false} color="#eef4f8" width={width} height={height} moving={moving} />
    </>}
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
