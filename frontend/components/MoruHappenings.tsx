"use client";

import type { CSSProperties } from "react";
import { Sheet } from "./ui";
import {
  BLOOM_WATERS, DRIFT_SECONDS, FLOWER_NAMES, KEEP_ITEMS, PLANT_STAGE_NAMES, flowerColor, keepItem, plantStage, plantStatus, wateredToday,
  type Ask, type AskAnswer, type FlowerColor, type Happenings, type PlantStage,
} from "@/lib/moru-happenings";
import { hasBatchim, subject } from "@/lib/moru-rules";
import room from "./MoruPet.module.css";
import styles from "./MoruHappenings.module.css";

/**
 * 방 안의 작은 사건의 그림과 버튼 (docs/MORU_HAPPENINGS.md). 규칙은 lib/moru-happenings.ts, 언제 무엇이 일어나는지는 MoruPet 이 정한다.
 * 그림은 모두 방과 같은 손그림이다: 짙은 갈색 외곽선, 단색 면, 이모지·글자 기호 없음.
 */
const INK = "#4a3528";
const PETAL: Record<FlowerColor, string> = { pink: "#f6a9b8", yellow: "#ffd98a", violet: "#c7b0f0", sky: "#a9d3f2", white: "#fffaf0" };
const HEART: Record<FlowerColor, string> = { pink: "#ffdd8f", yellow: "#f0a35a", violet: "#ffdd8f", sky: "#ffdd8f", white: "#ffdd8f" };

/** 주운 것 하나의 그림 (32×32). dim 이면 아직 못 본 것: 빛바랜 그림자 */
export function KeepIcon({ id, dim = false }: { id: string; dim?: boolean }) {
  const ink = dim ? "#c4ad8c" : INK;
  const fill = (color: string) => (dim ? "#f1e2c4" : color);
  const line = dim ? "#c4ad8c" : undefined;
  return <svg className={room.handIcon} viewBox="0 0 32 32" fill="none" stroke={ink} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {id === "leaf" && <><path fill={fill("#a9c77d")} d="M6 25C5 13 13 6 26 6C27 18 20 26 8 26Z" /><path stroke={line ?? "#5d7f48"} d="M7 26L22 10M13 20H18M12 15.500V20" /></>}
    {id === "petal" && <><path fill={fill("#f7b6c4")} d="M16 4.500C24 10 25.500 20 16 27.500C6.500 20 8 10 16 4.500Z" /><path stroke={line ?? "#d98197"} d="M16 12V22" /></>}
    {id === "snowflake" && <><circle cx="16" cy="16" r="11.500" fill={fill("#eaf4ff")} /><path stroke={line ?? "#7fa7cf"} strokeWidth="1.6" d="M16 8V24M9 12L23 20M23 12L9 20M13.500 9.500L16 11.500L18.500 9.500M13.500 22.500L16 20.500L18.500 22.500" /></>}
    {id === "starlight" && <path fill={fill("#fff3c4")} d="M16 3C17.300 11 21 14.700 29 16C21 17.300 17.300 21 16 29C14.700 21 11 17.300 3 16C11 14.700 14.700 11 16 3Z" />}
    {id === "acorn" && <><path fill={fill("#e2b77a")} d="M9.500 14H22.500C22.500 21 19.500 26 16 27.500C12.500 26 9.500 21 9.500 14Z" /><path fill={fill("#a9774f")} d="M7.500 14C7.500 9.500 11.500 7 16 7C20.500 7 24.500 9.500 24.500 14Z" /><path d="M16 7V4" /></>}
    {id === "pebble" && <><path fill={fill("#cdc7d3")} d="M5.500 19C5.500 13 11 9 17 9C23.500 9 27.500 13.500 26.500 19C25.500 23.500 21 25.500 15 25.500C9 25.500 5.500 23.500 5.500 19Z" /><path stroke={line ?? "#8f8799"} strokeWidth="1.5" d="M11 14.500C13 13 15.500 12.500 18 12.800" /></>}
    {id === "pinecone" && <><path fill={fill("#b98a5e")} d="M16 4.500C22.500 9 24.500 16.500 21 23.500C19.500 26.500 12.500 26.500 11 23.500C7.500 16.500 9.500 9 16 4.500Z" /><path strokeWidth="1.5" d="M11.500 12L16 15L20.500 12M10 17.500L16 20.800L22 17.500M12 23L16 25L20 23" /></>}
    {id === "shell" && <><path fill={fill("#ffe2d0")} d="M5 20C5 11 10 6 16 6C22 6 27 11 27 20L20.500 25.500H11.500Z" /><path stroke={line ?? "#d99a84"} strokeWidth="1.5" d="M16 7V24.500M10.500 9L13.500 24.500M21.500 9L18.500 24.500" /></>}
    {id === "button" && <><circle cx="16" cy="16" r="11" fill={fill("#a9cdf2")} /><circle cx="16" cy="16" r="7" strokeWidth="1.4" /><path strokeWidth="2.4" d="M13.500 13.500V13.600M18.500 13.500V13.600M13.500 18.500V18.600M18.500 18.500V18.600" /></>}
    {id === "feather" && <><path fill={fill("#fffaf3")} d="M8 25C8 13 14 5.500 24.500 4.500C26 15 20 23.500 10 25.500Z" /><path strokeWidth="1.5" d="M6.500 28L21.500 9M12 21H17M14.500 17.500V13M17.500 14H21" /></>}
    {id === "clover" && <><path d="M16 17C18 22 21 25.500 25 27.500" /><g fill={fill("#8fc98a")}><circle cx="11" cy="10.500" r="5.200" /><circle cx="21" cy="10.500" r="5.200" /><circle cx="11" cy="20" r="5.200" /><circle cx="21" cy="20" r="5.200" /></g><path stroke={line ?? "#4f8a52"} strokeWidth="1.5" d="M12.500 12L19.500 18.500M19.500 12L12.500 18.500" /></>}
  </svg>;
}

/** 다섯 장 꽃: 가운데 (cx, cy), 꽃잎이 놓이는 거리 d, 꽃잎 반지름 r */
function Bloom({ cx, cy, d, r, color, thin = false }: { cx: number; cy: number; d: number; r: number; color: FlowerColor; thin?: boolean }) {
  return <g strokeWidth={thin ? 1.4 : 1.8}>
    {[-90, -18, 54, 126, 198].map((deg) => <circle key={deg} cx={cx + d * Math.cos(deg * Math.PI / 180)} cy={cy + d * Math.sin(deg * Math.PI / 180)} r={r} fill={PETAL[color]} />)}
    <circle cx={cx} cy={cy} r={r * 0.72} fill={HEART[color]} />
  </g>;
}

/** 화분 (48×64): 0 씨앗 · 1 싹 · 2 잎 · 3 봉오리 · 4 꽃 */
export function PlantArt({ stage, color }: { stage: PlantStage; color: FlowerColor }) {
  const top = stage === 1 ? 31 : stage === 2 ? 24 : stage === 3 ? 17 : 21; // 줄기 끝
  return <svg className={`${room.handIcon} ${styles.plantArt}`} viewBox="0 0 48 64" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <g className={styles.sprout}>
      {stage >= 1 && <path strokeWidth="2.2" d={`M24 40V${top}`} />}
      {stage === 1 && <path fill="#9fd08a" d="M24 32C20 31 18.500 28 19 26C22 26 24 28.500 24 32ZM24 32C28 31 29.500 28 29 26C26 26 24 28.500 24 32Z" />}
      {stage >= 2 && <path fill="#9fd08a" d="M24 34C17 33 14 28 15 24C20 24 24 28 24 34ZM24 29C31 28 34 23 33 19C28 19 24 23 24 29Z" />}
      {stage === 3 && <><path fill={PETAL[color]} d="M24 18.500C20.200 15.500 20.200 10 24 6.500C27.800 10 27.800 15.500 24 18.500Z" /><path fill="#9fd08a" d="M20 15C21 19 27 19 28 15C26.500 17 21.500 17 20 15Z" /></>}
      {stage === 4 && <Bloom cx={24} cy={13.500} d={6.300} r={4.800} color={color} />}
    </g>
    <path fill="#6b4a3a" d="M10.500 41C15 37.500 33 37.500 37.500 41Z" />
    {stage === 0 && <path fill="#e2b77a" strokeWidth="1.5" d="M22 38.200C22.500 36.400 25.500 36.400 26 38.200C25.500 39.600 22.500 39.600 22 38.200Z" />}
    <path fill="#c9744f" d="M11.500 45H36.500L33.500 60.500H14.500Z" />
    <path fill="#d98a63" d="M8.500 40.500H39.500V45.500H8.500Z" />
  </svg>;
}

/** 꽃갈피: 종이 갈피에 눌러 둔 꽃 한 송이 */
export function PressedIcon({ color }: { color: FlowerColor }) {
  return <svg className={room.handIcon} viewBox="0 0 32 40" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path fill="#fffaf0" d="M6 3.500H26V36.500L16 31.500L6 36.500Z" />
    <path stroke="#7a9a5c" d="M16 17V26M16 23C13.500 22.500 12.500 21 12.500 19.500" />
    <Bloom cx={16} cy={12.500} d={4} r={3} color={color} thin />
  </svg>;
}

function CanIcon() {
  return <svg className={room.handIcon} viewBox="0 0 34 28" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 10C3.500 9 3.500 20 10 20" />
    <path fill="#a9cdf2" d="M10 7.500H22V23.500H10Z" />
    <path fill="#a9cdf2" d="M22 13L31 6.500L32.500 9L22 18Z" />
  </svg>;
}
function DropIcon() {
  return <svg className={room.handIcon} viewBox="0 0 14 18" fill="#a9d3f2" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M7 1.500C10 5.500 12 8.300 12 11A5 5 0 0 1 2 11C2 8.300 4 5.500 7 1.500Z" /></svg>;
}
/** 메뉴의 "주운 것들": 작은 유리병 */
export function JarIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 3.500h8v3H8ZM7.500 6.500C5.500 8 5 9.500 5 11.500v6.500a2.500 2.500 0 0 0 2.500 2.500h9A2.500 2.500 0 0 0 19 18v-6.500c0-2-.5-3.500-2.500-5" /><path d="M9.500 15.500 12 13l2.500 2.500L12 18Z" />
  </svg>;
}

/**
 * 방의 화분. 톡 누르면 하루 한 번 물을 준다. 아직 안 준 날에는 물방울이 까딱이고, 꽃이 피면 반짝인다.
 * 꾸미는 중에는 가구를 가리지 않게 눌리지 않는다
 */
export function MoruPlant({ state, today, who, watering, disabled, onPress }: {
  state: Happenings; today: string; who: string; watering: boolean; disabled?: boolean; onPress: () => void;
}) {
  const stage = plantStage(state.waters);
  const thirsty = stage < 4 && !wateredToday(state, today);
  const label = stage === 4 ? "화분, 꽃이 폈어요. 눌러서 간직하기" : thirsty ? `화분에 물 주기. 지금은 ${PLANT_STAGE_NAMES[stage]}, 꽃까지 ${BLOOM_WATERS - state.waters}번` : `화분, 오늘 물을 줬어요. 지금은 ${PLANT_STAGE_NAMES[stage]}`;
  return <button type="button" className={styles.plant} data-stage={stage} data-watering={watering ? "" : undefined} data-bloom={stage === 4 ? "" : undefined}
    disabled={disabled} aria-label={label} onClick={onPress}>
    <PlantArt stage={stage} color={flowerColor(who, state.seed)} />
    {watering && <span className={styles.can} aria-hidden="true"><CanIcon /><i /><i /><i /></span>}
    {thirsty && !watering && !disabled && <span className={styles.thirsty} aria-hidden="true"><DropIcon /></span>}
  </button>;
}

/** 창 쪽에서 날아드는 것 하나. 방을 가로질러 천천히 내려오고, 톡 누르면 잡힌다. 그냥 두면 사라진다 */
export function MoruDrift({ kind, x, sway, onCatch, onGone }: { kind: string; x: number; sway: number; onCatch: () => void; onGone: () => void }) {
  const name = keepItem(kind)?.name ?? "날아든 것";
  return <button type="button" className={styles.drift} data-kind={kind} style={{ left: `${x}%`, "--sway": `${sway}px`, animationDuration: `${DRIFT_SECONDS}s` } as CSSProperties}
    aria-label={`날아든 ${name} 잡기`} onClick={onCatch} onAnimationEnd={(e) => { if (e.target === e.currentTarget) onGone(); }}>
    <span><KeepIcon id={kind} /></span>
  </button>;
}

/** 친구가 물어다 발치에 놓아 둔 것. 톡 누르면 받는다 */
export function MoruGift({ id, friend, onTake }: { id: string; friend: string; onTake: () => void }) {
  const name = keepItem(id)?.name ?? "작은 것";
  return <button type="button" className={styles.gift} aria-label={`${subject(friend)} 물어 온 ${name} 받기`} onClick={onTake}>
    <KeepIcon id={id} /><i aria-hidden="true" />
  </button>;
}

/**
 * 친구가 먼저 묻는 한마디: 물음과 답 둘. 답하지 않아도 조용히 사라진다.
 * 방(.room)에 바로 놓는다(키워지는 월드 밖): 꽉 찬 화면에서도 글자 크기가 그대로이고 상태 하트 줄 위에 보인다. 자리는 친구의 머리 위를 따라간다
 */
export function MoruAsk({ ask, friend, full = false, onAnswer }: { ask: Ask; friend: string; full?: boolean; onAnswer: (answer: AskAnswer) => void }) {
  return <div className={styles.ask} data-full={full ? "" : undefined} role="group" aria-label={`${friend}의 물음`}>
    <i aria-hidden="true" />
    <p aria-live="polite">{ask.text}</p>
    <div>{ask.answers.map((answer) => <button key={answer.label} type="button" onClick={() => onAnswer(answer)}>{answer.label}</button>)}</div>
  </div>;
}

/** 주운 것들: 화분의 지금, 날아든 것·물어 온 것, 꽃갈피 */
export function FoundThingsSheet({ open, onClose, friend, state, today, who, onPress }: {
  open: boolean; onClose: () => void; friend: string; state: Happenings; today: string; who: string; onPress: () => void;
}) {
  const stage = plantStage(state.waters);
  const found = KEEP_ITEMS.filter((item) => (state.shelf[item.id] ?? 0) > 0).length;
  return <Sheet open={open} title={`${friend}${hasBatchim(friend) ? "과" : "와"} 주운 것들`} onClose={onClose} className={room.handSheet}>
    <div className={styles.foundThings}>
      <section className={styles.pot} aria-label="화분">
        <PlantArt stage={stage} color={flowerColor(who, state.seed)} />
        <div>
          <h4>화분 · {stage === 4 ? FLOWER_NAMES[flowerColor(who, state.seed)] : PLANT_STAGE_NAMES[stage]}</h4>
          <p>{plantStatus(state, today)}</p>
          <span className={styles.waters} role="img" aria-label={`물 ${state.waters}번, 꽃까지 ${BLOOM_WATERS}번`}>{Array.from({ length: BLOOM_WATERS }, (_, i) => <i key={i} data-on={i < state.waters ? "" : undefined} />)}</span>
        </div>
      </section>
      {stage === 4
        ? <button type="button" className="btn" onClick={onPress}>꽃갈피로 간직하고 새 씨앗 심기</button>
        : <p className={styles.hint}>방의 화분을 톡 누르면 하루 한 번 물을 줘요. 물을 거른 날에도 시들지 않고 그 자리에서 기다려요.</p>}
      <h4 className={styles.heading}>주운 것들 <small>{found}/{KEEP_ITEMS.length}</small></h4>
      <ul className={styles.shelf}>
        {KEEP_ITEMS.map((item) => {
          const count = state.shelf[item.id] ?? 0;
          return <li key={item.id} data-found={count ? "" : undefined}>
            <KeepIcon id={item.id} dim={!count} />
            <b>{count ? item.name : "아직"}</b>
            <small>{count ? `${count}개` : item.from}</small>
          </li>;
        })}
      </ul>
      <h4 className={styles.heading}>꽃갈피 <small>{state.flowers.length}장</small></h4>
      {state.flowers.length
        ? <ul className={styles.pressed}>{state.flowers.map((flower, i) => <li key={`${flower.day}-${i}`} title={`${flower.day} · ${FLOWER_NAMES[flower.color]}`}><PressedIcon color={flower.color} /><span className="sr-only">{flower.day} {FLOWER_NAMES[flower.color]}</span></li>)}</ul>
        : <p className={styles.hint}>꽃이 피면 눌러서 간직할 수 있어요.</p>}
      <p className={room.footnote}>날아든 것은 하루 다섯 개까지, 물어 온 것은 하루 하나예요. 놓쳐도 잃는 것은 없어요. 화분과 주운 것들은 지금은 이 기기에 남아요.</p>
    </div>
  </Sheet>;
}
