"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import MoruCompanion from "./MoruCompanion";
import { haptic } from "@/lib/haptics";
import { pickLine } from "@/lib/moru-rules";
import { EMPTY_OUTING, OUTING_ACTIVITIES, outingRequest, type OutingActivity, type OutingSession, type OutingView } from "@/lib/outing";
import {
  DECLINE_LINE, DONE_LINES, GROUND, LOOK_HINT, POKE_LINES, ROOM_SPOTS, WALK_LINES, lineIndex, roomPlace, spotState, strollTarget, walkTarget, walkerScale,
  type RoomPlace, type RoomSpot,
} from "@/lib/outing-room";
import styles from "./MoruOuting.module.css";

/**
 * 방 안에서 나가는 외출 (docs/OUTINGS.md "방 안의 외출"). 방(.world) 안에 그려진다: 방 그림 대신 같은 손그림의 바깥 풍경이 깔리고, 친구가 그 안을 걷는다.
 * 풍경 속 물건은 이름표 없이 그려져 있다. 누르면 친구가 그쪽으로 걸어가서 말해 준다 (자리와 말은 lib/outing-room.ts):
 * 아직 열리지 않은 것은 "조금 더 친해지면…", 열린 것은 같이 할지 묻고, 좋다고 하면 그 자리에서 잠깐 함께한다.
 * 함께한 날·열리는 것·보상은 그대로 서버(/api/outings)가 정한다: 시작을 알리고, 서버가 정한 시간이 지나면 마쳤다고 알린다.
 * 그림은 방과 같은 480×700 무대(바닥 600)에 코드로 그린 SVG 다. 낮과 밤은 방의 시계를 따른다.
 */
const INK = "#3d2a20";
type Bubble = { text: string; ask?: RoomSpot } | null;
type Doing = { spot: RoomSpot; activity: OutingActivity; token: string; startedAt: number; duration: number };

export default function MoruOuting({ place, friend, appearance, level, night, onBanner, onError, onDays }: {
  place: RoomPlace; friend: string; appearance: string; level?: number; night: boolean;
  onBanner: (text: string) => void; onError: (text: string) => void;
  /** 함께 나간 날 수가 바뀔 때 (방의 패드가 보여 준다) */
  onDays?: (days: number) => void;
}) {
  const [view, setView] = useState<OutingView>(EMPTY_OUTING);
  const [pos, setPos] = useState({ sx: 240, sy: 540 });
  const [moving, setMoving] = useState(false);
  const [bubble, setBubble] = useState<Bubble>(null);
  const [doing, setDoing] = useState<Doing | null>(null);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const arrive = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hush = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishing = useRef(false);
  const lastLine = useRef<string | null>(null);
  const hinted = useRef(false);
  const errorRef = useRef(onError); errorRef.current = onError;
  const daysRef = useRef(onDays); daysRef.current = onDays;
  useEffect(() => { daysRef.current?.(view.days); }, [view.days]);

  /** 말풍선 한 줄. 묻는 말이 아니면 조금 뒤에 사라진다 */
  const say = useCallback((next: Bubble, stay = 5200) => {
    if (hush.current) clearTimeout(hush.current);
    setBubble(next);
    if (next && !next.ask) hush.current = setTimeout(() => setBubble(null), stay);
  }, []);
  const pick = (lines: readonly string[]) => { const line = pickLine(lines, lastLine.current); lastLine.current = line; return line; };

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; for (const t of [arrive, hush]) if (t.current) clearTimeout(t.current); };
  }, []);
  // 함께한 날과 열린 것들을 서버에서 받는다. 받지 못해도 풍경은 둘러볼 수 있다 (첫날의 것만 열려 보인다)
  useEffect(() => {
    let current = true;
    outingRequest<OutingView>("").then((next) => { if (current) setView(next); })
      .catch((e) => { if (current) errorRef.current(e instanceof Error ? e.message : "외출 기록을 연결하지 못했어요."); });
    return () => { current = false; };
  }, []);
  // 장소에 도착: 가운데에 서서 한마디. 처음 나온 곳에서는 여기저기 눌러 보라고 덧붙인다
  useEffect(() => {
    if (arrive.current) clearTimeout(arrive.current);
    setDoing(null); finishing.current = false; setMoving(false);
    setPos({ sx: 240, sy: 540 });
    const hint = hinted.current ? "" : ` ${LOOK_HINT}`;
    hinted.current = true;
    say({ text: `${roomPlace(place)?.arrive ?? ""}${hint}` }, 6400);
  }, [place, say]);

  /** 그 자리로 걸어간다. 도착하면 then */
  const walk = (sx: number, sy: number, then?: () => void) => {
    if (arrive.current) clearTimeout(arrive.current);
    const far = Math.hypot(sx - pos.sx, sy - pos.sy) > 6;
    setPos({ sx, sy }); setMoving(far);
    arrive.current = setTimeout(() => { if (!alive.current) return; setMoving(false); then?.(); }, far ? 950 : 0);
  };
  const tapSpot = (spot: RoomSpot) => {
    if (doing || busy) return;
    haptic(6); say(null);
    walk(spot.sx, spot.sy, () => {
      const state = spotState(spot.id, view);
      if (state === "locked") say({ text: spot.locked || DECLINE_LINE }, 6800);
      else if (state === "done") say({ text: pick(DONE_LINES) });
      else say({ text: spot.invite, ask: spot });
    });
  };
  const tapGround = (e: MouseEvent<HTMLButtonElement>) => {
    if (doing || busy) return;
    const stage = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!stage || !stage.width) return;
    const target = walkTarget((e.clientX - stage.left) / stage.width * 480, (e.clientY - stage.top) / stage.height * 700);
    say(null);
    walk(target.sx, target.sy, () => { if (Math.random() < 0.45) say({ text: pick(WALK_LINES) }, 3600); });
  };
  const poke = () => { if (doing) return; haptic(8); say({ text: pick(POKE_LINES) }); };
  // 가만히 두면 가끔 혼자 몇 걸음 걷는다 (말하는 중·함께하는 중에는 그 자리에 있는다. 움직임을 줄인 기기에서는 걷지 않는다)
  const strollRef = useRef(() => {});
  strollRef.current = () => { const target = strollTarget(pos.sx, Math.random(), Math.random()); walk(target.sx, target.sy); };
  useEffect(() => {
    if (doing || busy || bubble || moving) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setTimeout(() => strollRef.current(), 9000 + Math.random() * 5000);
    return () => clearTimeout(timer);
  }, [doing, busy, bubble, moving, pos]);

  /** 같이 하기: 서버에 시작을 알리고, 서버가 정한 시간만큼 그 자리에서 함께한다 */
  const accept = async (spot: RoomSpot) => {
    const activity = OUTING_ACTIVITIES.find((a) => a.id === spot.id);
    if (!activity || busy) return;
    haptic(10); setBusy(true); say(null);
    try {
      const session = await outingRequest<OutingSession>("/start", { actionId: spot.id });
      if (!alive.current) return;
      finishing.current = false;
      setNow(Date.now());
      setDoing({ spot, activity, token: session.token, startedAt: Date.now(), duration: Math.max(1000, session.readyAt - session.serverTime) + 600 });
    } catch (e) {
      if (!alive.current) return;
      errorRef.current(e instanceof Error ? e.message : "외출을 시작하지 못했어요.");
      say({ text: DECLINE_LINE });
    } finally { if (alive.current) setBusy(false); }
  };
  const stop = () => { setDoing(null); finishing.current = false; say({ text: "괜찮아. 다음에 하자." }); };
  // 함께하는 동안: 시간이 차면 마쳤다고 알린다 (한 번만)
  useEffect(() => {
    if (!doing) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [doing]);
  useEffect(() => {
    if (!doing || finishing.current || now - doing.startedAt < doing.duration) return;
    finishing.current = true;
    const { activity, token } = doing;
    outingRequest<OutingView>("/complete", { token, note: null }).then((next) => {
      if (!alive.current) return;
      setView(next); setDoing(null);
      haptic([10, 50, 10]);
      onBanner(next.rewardAffinity > 0 ? `함께 나간 ${next.days}일 · 호감도 +${next.rewardAffinity}` : `추억 한 장 · ${activity.name}`);
      say({ text: activity.lines[activity.lines.length - 1] }, 6000);
    }).catch((e) => {
      if (!alive.current) return;
      setDoing(null);
      errorRef.current(e instanceof Error ? e.message : "외출 기록을 남기지 못했어요.");
    }).finally(() => { finishing.current = false; });
  }, [doing, now, onBanner, say]);

  const scale = walkerScale(pos.sy);
  const elapsed = doing ? Math.max(0, now - doing.startedAt) : 0;
  const text = doing ? doing.activity.lines[lineIndex(elapsed, doing.activity.lines.length)] : bubble?.text;
  const center = Math.max(200, Math.min(280, pos.sx)); // 말풍선이 방 밖으로 나가지 않게 (좁은 화면의 방은 가로 306 까지 줄어든다)

  return <div className={styles.out} data-night={night ? "" : undefined} style={{ "--out-sky": SKY[place][night ? 1 : 0] } as CSSProperties}>
    <div className={styles.sky} aria-hidden="true" />
    <div className={styles.stage}>
      <svg className={styles.art} viewBox="0 0 480 700" width="480" height="700" aria-hidden="true" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {place === "park" ? <Park night={night} /> : place === "sea" ? <Sea night={night} /> : <Mountain night={night} />}
      </svg>
      <button type="button" className={styles.ground} style={{ top: GROUND.top - 18 }} aria-label="빈 땅을 눌러 함께 걷기" onClick={tapGround} />
      {ROOM_SPOTS[place].map((spot) => <button key={spot.id} type="button" className={styles.spot} disabled={Boolean(doing) || busy}
        style={{ left: spot.x - spot.w / 2, top: spot.y - spot.h / 2, width: spot.w, height: spot.h }}
        aria-label={`풍경 속 ${OUTING_ACTIVITIES.find((a) => a.id === spot.id)?.name ?? "무언가"} 살펴보기`} onClick={() => tapSpot(spot)} />)}
      <button type="button" className={styles.walker} data-moving={moving ? "" : undefined} data-doing={doing ? "" : undefined}
        style={{ left: pos.sx, top: pos.sy, "--s": scale } as CSSProperties} aria-label={`${friend}에게 말 걸기`} onClick={poke}>
        <MoruCompanion appearance={appearance} mood={doing || bubble?.ask ? "happy" : moving ? "idle" : bubble ? "pet" : "idle"} level={level} />
      </button>
      {text && <div className={styles.bubble} aria-live="polite" style={{ left: center, top: pos.sy - 124 * scale, "--tail": `${pos.sx - center}px` } as CSSProperties}>
        <i aria-hidden="true" />
        <p>{text}</p>
        {doing && <span className={styles.progress} role="progressbar" aria-label="함께하는 중" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, elapsed / doing.duration) * 100)}>
          <b style={{ width: `${Math.min(1, elapsed / doing.duration) * 100}%` }} />
        </span>}
        {doing && <button type="button" className={styles.quiet} onClick={stop}>그만할래</button>}
        {!doing && bubble?.ask && <span className={styles.answers}>
          <button type="button" disabled={busy} onClick={() => { const spot = bubble.ask; if (spot) void accept(spot); }}>좋아</button>
          <button type="button" disabled={busy} onClick={() => { haptic(6); say({ text: DECLINE_LINE }, 3200); }}>다음에</button>
        </span>}
      </div>}
    </div>
  </div>;
}

/* ---------- 손그림 풍경: 방 그림과 같은 선(짙은 갈색 2.2px)·단색 면. 숨은 것들은 lib/outing-room.ts 의 자리에 그려져 있다 ---------- */

/** 장소의 하늘색 [낮, 밤]: 아래 그림들의 sky 와 같다 (꽉 찬 화면에서 그림 위로 이어지는 하늘) */
const SKY: Record<RoomPlace, [string, string]> = { park: ["#cfe8f2", "#2b3355"], sea: ["#f0d9ec", "#262b4d"], mountain: ["#dcecf5", "#232a4a"] };

function Sun({ x, y, r = 22 }: { x: number; y: number; r?: number }) {
  return <g><circle cx={x} cy={y} r={r + 12} fill="#fff6c9" stroke="none" opacity=".55" /><circle cx={x} cy={y} r={r} fill="#ffe08a" /></g>;
}
function Moon({ x, y }: { x: number; y: number }) {
  return <path fill="#fff3c4" d={`M${x + 6} ${y - 22}C${x - 14} ${y - 18} ${x - 22} ${y + 4} ${x - 8} ${y + 18}C${x + 6} ${y + 30} ${x + 26} ${y + 20} ${x + 26} ${y + 8}C${x + 12} ${y + 16} ${x - 4} ${y + 2} ${x + 6} ${y - 22}Z`} />;
}
/** 네 갈래 별. 낮에는 흐리게 떠 있다 */
function Stars({ at, night }: { at: [number, number][]; night: boolean }) {
  return <g fill="#fff3c4" strokeWidth="1.4" opacity={night ? 1 : 0.42}>
    {at.map(([x, y], i) => <path key={i} d={`M${x} ${y - 7}C${x + 1} ${y - 2} ${x + 2} ${y - 1} ${x + 7} ${y}C${x + 2} ${y + 1} ${x + 1} ${y + 2} ${x} ${y + 7}C${x - 1} ${y + 2} ${x - 2} ${y + 1} ${x - 7} ${y}C${x - 2} ${y - 1} ${x - 1} ${y - 2} ${x} ${y - 7}Z`} />)}
  </g>;
}
function Cloud({ x, y, w = 70, fill }: { x: number; y: number; w?: number; fill: string }) {
  return <path fill={fill} d={`M${x} ${y}Q${x - 6} ${y - 14} ${x + w * 0.2} ${y - 13}Q${x + w * 0.3} ${y - 28} ${x + w * 0.52} ${y - 21}Q${x + w * 0.74} ${y - 30} ${x + w * 0.86} ${y - 13}Q${x + w + 8} ${y - 10} ${x + w} ${y}Z`} />;
}
function Tufts({ at, fill }: { at: [number, number][]; fill: string }) {
  return <g fill={fill} strokeWidth="1.8">{at.map(([x, y], i) => <path key={i} d={`M${x - 8} ${y}Q${x - 7} ${y - 9} ${x - 3} ${y - 11}Q${x - 2} ${y - 5} ${x} ${y - 14}Q${x + 2} ${y - 5} ${x + 4} ${y - 10}Q${x + 7} ${y - 7} ${x + 8} ${y}Z`} />)}</g>;
}

/** 오후의 공원: 벤치(왼쪽) · 연못과 종이배 · 큰 나무(오른쪽) · 돗자리 · 낙엽 더미 · 반딧불 풀숲 */
function Park({ night }: { night: boolean }) {
  const c = night
    ? { sky: "#2b3355", cloud: "#465078", far: "#3d5670", grass: "#3d6753", grass2: "#345a4a", pond: "#3c5f88", ripple: "#7da0c8", path: "#6f6a8a", leaf: "#4f8a5c", leaf2: "#3f7450", trunk: "#6b4a3a", wood: "#8a6247", mat: "#a26d78", bush: "#3f7450" }
    : { sky: "#cfe8f2", cloud: "#ffffff", far: "#bcd9c0", grass: "#a9cf86", grass2: "#97c277", pond: "#a6d6e6", ripple: "#eefaff", path: "#ead9b5", leaf: "#7fb77a", leaf2: "#6aa468", trunk: "#a9774f", wood: "#c98f5f", mat: "#f4a9a0", bush: "#6fa86a" };
  return <g>
    <rect x="-10" y="-10" width="500" height="720" fill={c.sky} stroke="none" />
    {night ? <><Moon x={128} y={196} /><Stars at={[[210, 176], [286, 204], [96, 262], [320, 168]]} night /></> : <Sun x={128} y={198} />}
    <Cloud x={196} y={226} fill={c.cloud} /><Cloud x={300} y={190} w={56} fill={c.cloud} />
    <path fill={c.far} d="M-10 376Q60 336 132 360Q204 322 284 354Q352 326 424 356Q460 344 490 360V440H-10Z" />
    <g fill={c.leaf2}><circle cx="70" cy="374" r="16" /><circle cx="96" cy="380" r="12" /><circle cx="252" cy="372" r="14" /><circle cx="278" cy="378" r="11" /></g>
    <path fill={c.grass} d="M-10 400Q120 382 240 396Q360 410 490 390V710H-10Z" />
    <path fill={c.pond} d="M112 430C112 412 172 404 232 406C292 408 332 418 328 434C324 450 264 458 208 456C152 454 112 448 112 430Z" />
    <path stroke={c.ripple} strokeWidth="1.6" d="M150 428Q170 424 190 428M250 442Q268 438 286 442M184 448Q198 445 212 448" />
    <g fill="#fffaf0"><path d="M206 428H242L234 439H214Z" /><path d="M224 408V428H210Z" /><path d="M224 408L238 428H224Z" /></g>
    <path fill={c.path} d="M296 710C292 652 350 618 332 574C318 542 370 514 440 508L446 524C392 530 358 550 368 578C382 624 340 662 350 710Z" />
    <path fill={c.trunk} d="M346 488C352 442 350 394 344 344H374C370 394 370 442 380 488Z" />
    <path stroke={INK} strokeWidth="1.6" d="M356 400C358 420 358 440 356 462M366 372C367 392 366 410 368 430" />
    <path fill={c.leaf} d="M296 304C278 274 296 236 330 236C334 200 388 188 412 214C442 208 468 236 458 268C478 294 460 334 428 332C414 360 366 362 352 338C324 348 292 332 296 304Z" />
    <path stroke="#4f8a52" strokeWidth="1.6" d="M322 268C330 258 344 258 352 268M380 240C388 232 402 233 408 243M398 296C406 288 420 290 426 300M336 312C344 304 358 305 364 315" />
    <g fill={c.wood}><path d="M92 444H158V458H92Z" /><path d="M86 468H164V479H86Z" /></g>
    <path d="M98 458V468M152 458V468M96 479V496M154 479V496" />
    <path fill={c.mat} d="M300 512L352 500L380 524L328 538Z" />
    <path stroke="#fffaf0" strokeWidth="1.6" d="M314 509L342 533M328 506L356 530M306 520L360 508M318 530L372 518" />
    <path fill="#d9a56b" d="M330 500H354L351 516H333Z" /><path d="M334 500C334 488 350 488 350 500" />
    <g strokeWidth="1.8"><path fill="#e8b04a" d="M238 566C238 556 246 550 256 552C256 562 248 568 238 566Z" /><path fill="#d97b4a" d="M258 572C256 562 264 554 274 556C276 566 268 574 258 572Z" />
      <path fill="#a9c77d" d="M272 562C272 553 280 548 289 550C289 559 281 564 272 562Z" /><path fill="#e8b04a" d="M250 578C250 570 257 566 265 568C265 576 258 580 250 578Z" /></g>
    <path fill={c.bush} d="M74 566C66 552 76 536 92 538C96 524 118 524 122 538C138 536 146 554 136 566Z" />
    <g fill="#fff3a8" stroke="none" opacity={night ? 1 : 0.55}><circle cx="92" cy="530" r="2.600" /><circle cx="118" cy="522" r="2.200" /><circle cx="132" cy="540" r="2.400" /></g>
    <Tufts at={[[196, 520], [60, 508], [420, 566], [180, 596]]} fill={c.grass2} />
  </g>;
}

/** 보랏빛 바다: 파도 · 모래 그림과 막대 · 조개 · 편지 병 · 하늘의 별 · 쌓아 둔 돌 */
function Sea({ night }: { night: boolean }) {
  const c = night
    ? { sky: "#262b4d", cloud: "#3e4470", sea: "#33457a", sea2: "#2b3a69", wave: "#8fa6d6", foam: "#c9d4ee", sand: "#8d88a2", wet: "#7b7694", rock: "#56506e", glass: "#7fa3b8" }
    : { sky: "#f0d9ec", cloud: "#fff4fb", sea: "#a9bfe6", sea2: "#93abd9", wave: "#eef4ff", foam: "#ffffff", sand: "#f4e2c2", wet: "#e6cfa9", rock: "#a89bb0", glass: "#bfe1ea" };
  return <g>
    <rect x="-10" y="-10" width="500" height="720" fill={c.sky} stroke="none" />
    {night ? <Moon x={340} y={236} /> : <Sun x={338} y={262} r={24} />}
    <Stars at={[[150, 178], [196, 156], [246, 190], [128, 214], [262, 160]]} night={night} />
    <Cloud x={84} y={262} w={64} fill={c.cloud} /><Cloud x={252} y={248} w={50} fill={c.cloud} />
    <path fill={c.sea} d="M-10 304H490V452H-10Z" />
    <path fill={c.rock} d="M372 306C376 290 392 284 404 290C412 280 432 282 438 294C452 292 462 300 464 306Z" />
    <g><path fill="#fffaf0" d="M412 248H426L429 290H409Z" /><path fill="#e8766d" stroke="none" d="M411 262H427L428 272H410Z" /><path fill="#ffe08a" d="M410 238H428V248H410Z" /><path d="M408 238L419 229L430 238" /></g>
    <path fill={c.sea2} stroke="none" d="M-10 372H490V452H-10Z" />
    <path stroke={c.wave} strokeWidth="1.8" d="M40 330Q56 324 72 330M150 344Q168 338 186 344M286 326Q302 320 318 326M96 386Q116 379 136 386M232 398Q254 391 276 398M360 380Q378 374 396 380" />
    <path fill={c.sand} d="M-10 446Q70 430 150 444Q230 458 310 440Q400 422 490 444V710H-10Z" />
    <path fill={c.foam} strokeWidth="1.8" d="M-10 446Q70 430 150 444Q230 458 310 440Q400 422 490 444V452Q400 432 310 450Q230 468 150 454Q70 440 -10 456Z" />
    <path stroke={c.wet} strokeWidth="1.8" d="M30 482Q110 468 190 480M250 492Q330 476 410 488" />
    <g strokeWidth="2"><path stroke="#b58f6a" d="M240 548C240 536 256 534 262 544C268 534 284 536 284 548C284 560 266 566 262 574C258 566 240 560 240 548Z" /><path stroke="#8a6247" strokeWidth="3" d="M296 532L316 560" /></g>
    <g strokeWidth="1.8"><path fill="#ffd9d0" d="M328 566C328 556 336 550 344 550C352 550 360 556 360 566L352 570H336Z" /><path d="M344 551V569M336 554L339 569M352 554L349 569" />
      <path fill="#fff1d8" d="M362 572C362 565 368 561 374 561C380 561 386 565 386 572L380 575H368Z" /><path fill="#f7b6c4" d="M322 580C322 574 327 571 332 571C337 571 342 574 342 580L337 582H327Z" /></g>
    <g><path fill={c.glass} d="M118 522C118 516 124 512 132 513L160 520C166 522 166 534 160 536L132 541C124 542 118 538 118 532Z" /><path fill="#c9a06a" d="M160 520L170 522V534L160 536Z" /><path fill="#fffaf0" strokeWidth="1.6" d="M128 520L150 524V532L128 535Z" /></g>
    <g fill={c.rock} transform="translate(-10 0)"><path d="M356 498C356 488 366 482 378 482C390 482 398 488 398 498C398 506 390 510 378 510C366 510 356 506 356 498Z" /><path d="M362 478C362 470 370 466 378 466C386 466 392 470 392 478C392 484 386 487 378 487C370 487 362 484 362 478Z" /><path d="M368 462C368 456 373 453 378 453C383 453 388 456 388 462C388 466 383 468 378 468C373 468 368 466 368 462Z" /></g>
  </g>;
}

/** 구름 위의 산: 바람에 날리는 깃발 · 느린 구름 · 보온병과 잔 · 이정표 · 능선 뒤의 해 · 가까운 별 */
function Mountain({ night }: { night: boolean }) {
  const c = night
    ? { sky: "#232a4a", cloud: "#3b4470", back: "#3a4668", mid: "#2f3a5c", snow: "#aab6d6", mist: "#56608a", rock: "#6f6680", rock2: "#5d556e", grass: "#3f6753", wood: "#8a6247" }
    : { sky: "#dcecf5", cloud: "#ffffff", back: "#b7c6dc", mid: "#9db0cb", snow: "#ffffff", mist: "#f3f7fb", rock: "#cbb99f", rock2: "#b9a58a", grass: "#9cc08a", wood: "#c98f5f" };
  return <g>
    <rect x="-10" y="-10" width="500" height="720" fill={c.sky} stroke="none" />
    <Stars at={[[108, 190], [132, 212], [150, 186], [124, 172]]} night={night} />
    {night ? <Moon x={366} y={230} /> : <Sun x={370} y={276} r={24} />}
    <Cloud x={196} y={224} w={84} fill={c.cloud} /><Cloud x={286} y={206} w={52} fill={c.cloud} />
    <path fill={c.back} d="M-10 340L70 286L132 318L212 246L292 306L362 268L432 306L490 286V470H-10Z" />
    <path fill={c.snow} strokeWidth="1.8" d="M212 246L236 264L222 270L210 262L198 272L190 262Z" />
    <path fill={c.mid} d="M-10 396L60 352L128 384L196 336L270 388L338 350L414 392L490 366V480H-10Z" />
    <path fill={c.snow} strokeWidth="1.8" d="M196 336L214 348L204 354L196 348L186 356L180 348Z" />
    <path fill={c.mist} strokeWidth="1.8" d="M-10 430Q20 412 52 424Q74 406 104 420Q128 404 158 420Q184 408 212 422Q240 406 270 422Q298 410 326 424Q356 408 386 424Q414 410 444 424Q470 414 490 424V482H-10Z" />
    <path fill={c.rock} d="M-10 478Q80 458 170 470Q260 482 350 466Q420 454 490 472V710H-10Z" />
    <path stroke={c.rock2} strokeWidth="1.8" d="M40 512Q70 504 100 512M300 530Q330 522 360 530M150 600Q186 592 222 600" />
    <path d="M94 420V482" /><path d="M94 424Q130 446 176 440" strokeWidth="1.6" />
    <g strokeWidth="1.6"><path fill="#f7b6c4" d="M106 430L118 436L108 448Z" /><path fill="#ffe08a" d="M124 437L136 440L128 453Z" /><path fill="#a9d3f2" d="M142 441L154 441L148 455Z" /><path fill="#c7b0f0" d="M159 441L171 439L167 454Z" /></g>
    <path fill="#f7d9a8" d="M172 570Q210 556 250 568Q214 584 172 570Z" /><path stroke="#e8766d" strokeWidth="1.4" d="M190 566Q212 560 234 567M186 572Q212 576 238 571" />
    <g><path fill="#8fb7c9" d="M187 538Q187 533 192 533H202Q207 533 207 538V566Q197 569 187 566Z" /><path fill="#fffaf0" d="M191 524H203V533H191Z" /><path fill="#e8766d" d="M193 518H201V524H193Z" /><path stroke="#fffaf0" strokeWidth="1.6" d="M188 546H206" />
      <path fill="#fffaf0" d="M214 553H227V563Q220.500 568 214 563Z" /><path strokeWidth="1.6" d="M227 555C233 555 233 561 227 561" />
      <path fill="#ffd9d0" d="M232 557H243V565Q237.500 569 232 565Z" /><path strokeWidth="1.6" d="M243 559C248 559 248 564 243 564" />
      <path strokeWidth="1.5" d="M219 548C217 544 222 542 220 538M237 552C236 549 239 548 238 545" /></g>
    <g><path fill={c.wood} d="M348 440H356V498H348Z" /><path fill={c.wood} d="M330 446H372L382 455L372 464H330Z" /><path strokeWidth="1.6" d="M340 455H366" /></g>
    <g fill={c.rock2} strokeWidth="1.8"><path d="M96 540C96 531 106 527 116 529C126 527 134 533 132 541C128 547 100 547 96 540Z" /><path d="M120 546C120 540 127 538 133 540C139 539 143 543 141 548C137 551 122 551 120 546Z" />
      <path d="M306 596C306 589 314 586 322 588C330 587 336 591 334 597C330 601 309 601 306 596Z" /><path d="M392 548C392 541 400 538 408 540C416 539 422 544 420 550C416 554 395 554 392 548Z" /></g>
    <Tufts at={[[70, 500], [270, 498], [420, 512], [120, 570]]} fill={c.grass} />
    <g strokeWidth="1.4">{([[150, 520], [246, 534], [330, 548], [164, 586]] as [number, number][]).map(([x, y], i) => <g key={i}><path d={`M${x} ${y}V${y - 9}`} stroke="#5f8f58" /><circle cx={x} cy={y - 11} r="3.600" fill={i % 2 ? "#ffe08a" : "#fffaf0"} /></g>)}</g>
  </g>;
}
