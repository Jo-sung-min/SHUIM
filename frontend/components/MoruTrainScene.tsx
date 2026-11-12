import { useId, type ReactNode } from "react";
import styles from "./MoruRoom.module.css";

/**
 * 기차 침대칸: 창밖 풍경이 천천히 지나가고, 모루는 창가 침대에 앉아 쉰다.
 * 그림은 480×700 고정 무대(방 바닥은 600, 그 아래는 패드 뒤로 이어지는 담요)에 손그림 선으로 그리고 방 아래 가운데에 붙인다 (늘이지 않아 선 굵기가 고르다).
 * 창밖은 무대 뒤의 띠 석 장(먼 곳·가운데·가까운 곳)이 서로 다른 빠르기로 흐른다: transform 만 움직여 합성 단계에서 돈다.
 */

/** 서버와 브라우저가 같은 그림을 그리도록 정해진 순서의 난수 */
function seeded(seed: number) {
  let s = seed % 2147483647;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}
const TILE = 320; // 풍경 한 벌의 폭. 두 벌을 이어 붙여 끊김 없이 돈다
const VIEW = 208; // 창 안쪽의 높이

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
/** 한 벌을 두 번 이어 붙인 띠 */
function Strip({ pass, children }: { pass: number; children: ReactNode }) {
  return <svg className={styles.strip} style={{ animationDuration: `${pass}s` }} viewBox={`0 0 ${TILE * 2} ${VIEW}`} width={TILE * 2} height={VIEW}>
    {[0, TILE].map((dx) => <g key={dx} transform={`translate(${dx})`}>{children}</g>)}
  </svg>;
}
/** 달리는 창에 비껴 떨어지는 비·눈: 한 주기(dx, dy)만큼 옮기면 제자리와 겹치도록 같은 무늬를 되풀이한다 */
function Weather({ snow, color }: { snow: boolean; color: string }) {
  const rnd = seeded(snow ? 77 : 31), dx = snow ? -36 : -20, dy = snow ? 80 : 52, marks: ReactNode[] = [];
  for (let i = 0; i < (snow ? 30 : 22); i++) {
    const x = rnd() * 420, y = rnd() * dy, size = 1 + rnd() * 1.6, o = 0.35 + rnd() * 0.5;
    for (let k = -1; k < 6; k++) marks.push(snow
      ? <circle key={`${i}-${k}`} cx={x + dx * k} cy={y + dy * k} r={size} fill={color} opacity={o} />
      : <path key={`${i}-${k}`} d={`M${x + dx * k} ${y + dy * k}l-5 13`} stroke={color} strokeWidth={0.8 + size * 0.3} strokeLinecap="round" opacity={o * 0.8} />);
  }
  return <svg className={snow ? styles.snowPass : styles.rainPass} viewBox="0 -60 420 330" width="420" height="330">{marks}</svg>;
}

function Outside({ scene }: { scene: number }) {
  const lamp = useId();
  if (scene === 1) return <>{/* 눈 내리는 숲 */}
    <Strip pass={80}><path fill="#dfe8ef" d="M0 132C50 116 96 140 150 128S262 112 320 132V208H0Z" />{pines(5, 134, 18, 30, 26, "#a9bbc8")}</Strip>
    <Strip pass={30}><path fill="#eef3f6" d="M0 162C70 150 120 170 190 158S280 150 320 162V208H0Z" />{pines(9, 164, 46, 84, 40, "#6d8898", "#f4f8fa")}</Strip>
    <Strip pass={9}><path fill="#f9fbfc" d="M0 190C80 182 150 196 230 186C270 182 300 186 320 190V208H0Z" />{pines(13, 196, 110, 170, 150, "#465d6c", "#e8eff3")}</Strip>
    <Weather snow color="#ffffff" />
  </>;
  if (scene === 2) return <>{/* 비 오는 밤 */}
    <Strip pass={90}>{skyline(21, 150, 34, 96, "#141a33", ["#ffd98a", "#ffc46b", "#9fd4e6"], 0.22)}</Strip>
    <Strip pass={32}>{skyline(27, 172, 22, 60, "#0c1024", ["#ffe2a0", "#ffb86a"], 0.34)}</Strip>
    <Strip pass={7}>
      <defs><radialGradient id={lamp}><stop offset="0" stopColor="#ffe2a0" stopOpacity=".85" /><stop offset="1" stopColor="#ffe2a0" stopOpacity="0" /></radialGradient></defs>
      <path fill="#070916" d="M0 192C90 186 220 196 320 192V208H0Z" />
      {[70, 230].map((x) => <g key={x}><path fill="#070916" d={`M${x - 2} 60h4v140h-4zM${x} 60h18v3H${x}z`} /><circle cx={x + 17} cy="66" r="26" fill={`url(#${lamp})`} /><circle cx={x + 17} cy="66" r="3" fill="#fff3cf" /></g>)}
    </Strip>
    <Weather snow={false} color="#c9d8ff" />
  </>;
  return <>{/* 비 오는 도시 */}
    <Strip pass={90}>{skyline(3, 146, 30, 92, "#93a5b5")}</Strip>
    <Strip pass={34}>{skyline(8, 170, 20, 62, "#6f8496", ["#f7e3a8"], 0.14)}{pines(4, 176, 14, 24, 70, "#5f7d76")}</Strip>
    <Strip pass={8}>
      <path fill="#4b5c60" d="M0 192C60 184 110 196 170 188S270 184 320 192V208H0Z" />
      {[90, 250].map((x) => <path key={x} fill="#3c4750" d={`M${x - 2} 30h4v170h-4zM${x - 14} 44h28v3h-28z`} />)}
      <path fill="none" stroke="#3c4750" strokeWidth="1.2" d="M-70 46Q10 60 90 46T250 46T410 46" />
    </Strip>
    <Weather snow={false} color="#eef4f8" />
  </>;
}

const INK = "#3d2a20";
/** 묶어 둔 커튼 한 쪽 (오른쪽은 뒤집어 쓴다) */
function Curtain() {
  return <g>
    <path fill="#e5b65f" d="M118 231H180C178 262 170 302 152 338C144 356 139 366 137 373L127 373C126 330 121 282 118 231Z" />
    <path fill="none" stroke="#c08f3d" strokeWidth="1.8" d="M133 236C134 282 131 330 130 366M150 236C149 284 141 330 133 368M166 236C162 282 149 328 135 369" />
    <path fill="#e5b65f" d="M127 380H139C147 402 153 428 155 452H117C117 428 121 402 127 380Z" />
    <path fill="none" stroke="#c08f3d" strokeWidth="1.8" d="M131 384C128 406 127 428 127 448M137 384C142 406 145 428 146 448" />
    <path fill="#b5694f" d="M124 371Q132 368 141 371Q143 376 141 381Q132 384 124 381Q122 376 124 371Z" />
  </g>;
}

export default function MoruTrainScene({ scene = 0 }: { scene?: number }) {
  const id = useId();
  const sketch = `${id}-sketch`, glow = `${id}-glow`;
  const view = scene === 1 || scene === 2 ? scene : 0;
  return <div className={styles.stage} data-moru-stage="" aria-hidden="true">
    <div className={styles.view} data-scene={view}><Outside scene={view} /></div>
    <svg className={styles.cabin} viewBox="0 0 480 700" width="480" height="700">
      <defs>
        <filter id={sketch} x="-2%" y="-2%" width="104%" height="104%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="11" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <radialGradient id={glow}><stop offset="0" stopColor="#ffd98a" stopOpacity=".5" /><stop offset=".55" stopColor="#ffc46b" stopOpacity=".16" /><stop offset="1" stopColor="#ffc46b" stopOpacity="0" /></radialGradient>
      </defs>
      <g filter={`url(#${sketch})`} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
        {/* 나무 벽: 창 자리만 비운다 */}
        <path stroke="none" fill="#8c5f47" fillRule="evenodd" d="M-10-10H490V710H-10ZM158 238h164a18 18 0 0 1 18 18v164a18 18 0 0 1-18 18H158a18 18 0 0 1-18-18V256a18 18 0 0 1 18-18Z" />
        <path stroke="none" fill="#7a4f3c" d="M-10-10H490V198H-10Z" />
        <path fill="none" stroke="#754a36" strokeWidth="1.6" opacity=".7" d="M38 206C41 290 36 384 39 474M92 206C90 300 94 392 91 474M388 206C391 296 386 386 389 474M442 206C440 300 444 390 441 474M200 204V226M282 204V226M60 20C62 80 58 140 60 190M180 20C178 90 182 140 180 190M300 20C302 80 298 140 300 190M420 20C418 90 422 140 420 190" />
        <path fill="none" stroke="#5b3a2c" strokeWidth="5" d="M-10 198C120 195 320 201 490 197" />
        <path fill="none" stroke="#b08060" strokeWidth="1.6" opacity=".8" d="M-10 204C120 201 320 207 490 203" />
        {/* 짐 선반: 여행 가방과 말아 둔 담요 */}
        <g transform="translate(0 -44)">
          <path fill="#a9623f" d="M252 112Q300 108 348 112Q352 138 348 164H252Q248 138 252 112Z" />
          <path fill="#e9c58a" d="M270 111h10v53h-10zM320 111h10v53h-10z" />
          <path fill="none" d="M286 110Q300 96 314 110" />
          <path fill="#e5b65f" d="M150 134Q190 130 226 134Q234 149 226 164H150Q142 149 150 134Z" />
          <path fill="none" stroke="#c08f3d" strokeWidth="1.8" d="M170 134V164M206 134V164" />
          <path fill="#fff3dc" d="M150 134Q142 149 150 164Q158 149 150 134Z" />
          <path fill="#d9a55e" d="M56 164H424Q428 168 424 172H56Q52 168 56 164Z" />
          <path fill="#8f5f44" d="M84 172v14l14-14ZM396 172v14l-14-14Z" />
        </g>
        {/* 벽에 건 작은 그림과 화분 */}
        <path fill="none" strokeWidth="1.5" d="M380 384V402" /><path fill="#c9705a" d="M369 402H391L388 420H372Z" />
        <path fill="#7f9d78" strokeWidth="1.6" d="M373 402C366 396 366 388 372 386C376 390 377 396 376 402ZM384 402C384 394 388 388 394 389C395 395 391 400 387 402Z" />
        {/* 창틀과 창턱 */}
        <path fill="#5f3d2d" fillRule="evenodd" d="M152 228h176a22 22 0 0 1 22 22v176a22 22 0 0 1-22 22H152a22 22 0 0 1-22-22V250a22 22 0 0 1 22-22ZM158 238h164a18 18 0 0 1 18 18v164a18 18 0 0 1-18 18H158a18 18 0 0 1-18-18V256a18 18 0 0 1 18-18Z" />
        <path stroke="none" fill="#ffffff" opacity=".08" d="M150 428L226 240H262L186 438H160Z" /><path stroke="none" fill="#ffffff" opacity=".05" d="M262 438L334 262V330L290 438Z" />
        <path fill="#b9835a" d="M124 446H356Q361 451 356 457H124Q119 451 124 446Z" />
        {/* 커튼과 봉 */}
        <Curtain /><g transform="translate(480) scale(-1 1)"><Curtain /></g>
        <path fill="#d9a55e" d="M110 225H370Q373 228 370 231H110Q107 228 110 225Z" /><circle cx="108" cy="228" r="5" fill="#d9a55e" /><circle cx="372" cy="228" r="5" fill="#d9a55e" />
        {/* 줄 전구 */}
        <path fill="none" strokeWidth="1.4" d="M182 236C200 250 222 252 240 247C258 252 280 250 298 236" />
        {[[196, 246], [216, 250], [240, 249], [264, 250], [284, 246]].map(([x, y]) => <g key={x}><circle cx={x} cy={y + 4} r="10" fill="#ffd98a" opacity=".3" stroke="none" /><ellipse cx={x} cy={y + 4} rx="3.4" ry="4.4" fill="#ffe9b0" strokeWidth="1.4" /></g>)}
        {/* 접이식 탁자: 등과 찻잔 */}
        <circle cx="110" cy="440" r="52" fill={`url(#${glow})`} stroke="none" />
        <path fill="#b9835a" d="M76 463H152Q157 469 152 475H76Z" /><path fill="#8f5f44" d="M92 475V496L124 475Z" />
        <path fill="#d9a55e" d="M100 463Q110 458 120 463Z" /><path fill="none" strokeWidth="3" d="M110 446V460" />
        <path fill="#ffd27a" d="M96 447L102 424H118L124 447Z" />
        <path fill="#fff3dc" d="M131 448H146V459Q146 463 142 463H135Q131 463 131 459Z" /><path fill="none" d="M146 451Q152 451 152 455Q152 459 146 459" />
        <path fill="none" stroke="#fff6e4" strokeWidth="1.6" opacity=".7" d="M136 443C133 438 139 436 136 430M142 443C139 439 144 437 142 432" />
        {/* 침대: 홑이불, 등 뒤의 베개, 앞쪽에 접어 둔 담요 */}
        <path fill="#f6e8d0" d="M-10 477C110 473 370 480 490 476V710H-10Z" />
        <path fill="#fff6e4" d="M266 448C284 438 336 438 352 446C362 460 362 486 354 498C336 506 284 506 268 498C258 486 258 462 266 448Z" />
        <path fill="none" stroke="#a9c1d6" strokeWidth="2" d="M286 444C282 462 282 482 286 502M310 441C308 462 308 484 310 504M334 443C338 462 338 482 334 502" />
        <path fill="#fffaf0" d="M108 498L138 492L140 508L110 514Z" /><path fill="#fffaf0" d="M138 492L168 498L166 514L140 508Z" />
        <path fill="none" stroke="#c9b9a2" strokeWidth="1.2" d="M114 502L133 498M115 507L134 503M145 498L162 502M145 503L161 507" />
        <path fill="#c9806a" d="M-10 530C60 520 130 534 200 526C270 518 340 534 410 524C440 520 470 526 490 524V710H-10Z" />
        <path stroke="none" fill="#dba08b" d="M-10 532C60 522 130 536 200 528C270 520 340 536 410 526C440 522 470 528 490 526V540C470 542 440 536 410 540C340 550 270 534 200 542C130 550 60 536 -10 546Z" />
        <path fill="none" stroke="#a9624f" strokeWidth="1.6" strokeDasharray="5 6" d="M-10 546C60 536 130 550 200 542C270 534 340 550 410 540C440 536 470 542 490 540" />
        <path fill="none" stroke="#f3dcc0" strokeWidth="1.8" opacity=".55" d="M-10 578C90 568 200 584 300 574C380 566 440 576 490 572M-10 586C90 576 200 592 300 582C380 574 440 584 490 580M-10 660C90 650 200 666 300 656C380 648 440 658 490 654M96 548C100 600 94 650 98 706M104 548C108 600 102 650 106 706M256 544C260 600 254 650 258 706M264 544C268 600 262 650 266 706M410 546C414 600 408 650 412 706M418 546C422 600 416 650 420 706" />
        <path fill="none" stroke="#a9624f" strokeWidth="1.8" opacity=".7" d="M176 552C170 580 180 610 172 640M344 556C350 584 340 612 348 644" />
      </g>
    </svg>
  </div>;
}
