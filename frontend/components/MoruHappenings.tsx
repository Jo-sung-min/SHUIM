"use client";

import type { CSSProperties } from "react";
import { Sheet } from "./ui";
import {
  BLOOM_WATERS, DRIFT_SECONDS, FLOWER_NAMES, GROWERS, GROW_TOTAL, KEEP_ITEMS, PLANT_STAGE_NAMES, flowerColor, growStage, growStatus, growerOf, keepItem, plantStage, plantStatus, tendedToday, wateredToday,
  type Ask, type AskAnswer, type FlowerColor, type GrowStage, type GrowerId, type Happenings, type PlantStage,
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
/**
 * 물 주기: 물뿌리개가 다가와 기울고, 주둥이 끝에서 물방울이 곧게 아래로 떨어져 흙에 닿는다.
 * 이 요소의 자리가 기울어진 주둥이 끝이다 (가로는 화분의 가운데). top 은 그 높이(버튼 위에서 px), fall 은 흙까지의 거리.
 * flip 이면 물뿌리개가 오른쪽에서 온다 (방 왼쪽 가장자리의 화분은 왼쪽이 잘린다)
 */
function Pour({ top, fall, flip = false }: { top: number; fall: number; flip?: boolean }) {
  return <span className={styles.pour} data-flip={flip ? "" : undefined} style={{ top, "--pour-fall": `${fall}px` } as CSSProperties} aria-hidden="true">
    <span className={styles.pourCan}><CanIcon /></span>
    <i /><i /><i /><i /><i />
  </span>;
}

const LEAF = "#9fd08a";
/** 작은 나무 (44×80): 0 씨앗 · 1 새순 · 2 묘목 · 3 어린 나무 · 4 잎이 무성한 나무 · 5 꽃 핀 나무. 화분은 푸른 유약 */
function TreeArt({ stage }: { stage: GrowStage }) {
  return <svg className={`${room.handIcon} ${styles.growerArt}`} viewBox="0 0 44 80" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <g className={styles.canopy}>
      {stage === 1 && <><path strokeWidth="2.2" d="M22 62V55" /><path fill={LEAF} d="M22 56C25.500 55.500 27 53 26.500 50.500C23.500 51 22 53 22 56Z" /></>}
      {stage === 2 && <><path strokeWidth="2.2" d="M22 62V43" />
        <path fill={LEAF} d="M22 55C17 54.500 15 51 15.500 48C19.500 48 22 51 22 55ZM22 50C27 49.500 29 46 28.500 43C24.500 43 22 46 22 50ZM22 44C19.800 42 19.800 38.500 22 36.500C24.200 38.500 24.200 42 22 44Z" /></>}
      {stage === 3 && <><path fill="#a9774f" d="M20.500 62C21 54 21 47 20.800 41H23.200C23 47 23 54 23.500 62Z" />
        <path fill={LEAF} d="M12 34C9.500 30 12 24.500 16.500 24.500C17.500 20.500 24 19.500 26.500 23C31 22.500 34 27 32 31C34.500 35 31 39.500 27 38.500C24.500 42 18.500 41.500 17 38.500C13.500 39.500 11 37 12 34Z" />
        <path stroke="#5d8f52" strokeWidth="1.4" d="M17 30C18.500 28.500 20.500 28.500 22 30M24 34C25.500 32.800 27.500 33 28.500 34.500" /></>}
      {stage >= 4 && <><path fill="#a9774f" d="M19.500 62C20.500 54 20.500 46 20 38H24C23.500 46 23.500 54 24.500 62Z" />
        <path fill="#8cc67a" d="M8 32C3.500 27 6.500 19 12.500 19C13 12.500 21.500 9 26 13.500C32 11.500 38 17 36 23C41 26.500 39.500 35 33.500 36C32 42 23.500 44 20 39.500C15 43 8 39.500 8 32Z" />
        <path stroke="#5d8f52" strokeWidth="1.4" d="M13.500 27C15.500 25 18.500 25 20.500 27M24 20.500C26 19 29 19.500 30.500 21.500M22 33.500C24 32 27 32.500 28.500 34.500" /></>}
      {stage === 5 && <g strokeWidth="1.2">{[[13, 28], [20.500, 17.500], [30.500, 20], [34, 29.500], [25.500, 28], [16, 36]].map(([x, y]) => <g key={`${x}-${y}`}>
        <circle cx={x} cy={y} r="2.700" fill="#f7b6c4" /><circle cx={x} cy={y} r=".9" fill="#ffdd8f" stroke="none" />
      </g>)}</g>}
    </g>
    <path fill="#6b4a3a" d="M11 62.500C14 60 30 60 33 62.500Z" />
    {stage === 0 && <path fill="#e2b77a" strokeWidth="1.5" d="M20.200 60.700C20.600 59.200 23.400 59.200 23.800 60.700C23.400 61.900 20.600 61.900 20.200 60.700Z" />}
    <path fill="#7f9db3" d="M12.500 66.500H31.500L29.500 78H14.500Z" />
    <path fill="#9bb6c9" d="M10 62H34V66.500H10Z" />
  </svg>;
}
/** 이끼 병 (44×50): 0 빈 병 · 1 이끼 한 점 · 2 이끼 방석 · 3 고사리 싹 · 4 작은 숲 · 5 버섯이 돋은 숲 */
function MossArt({ stage }: { stage: GrowStage }) {
  const moss = "#8fc98a", fern = "#4f8a52";
  return <svg className={`${room.handIcon} ${styles.growerArt}`} viewBox="0 0 44 50" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path fill="#eef7ff" fillOpacity=".72" stroke="none" d="M11.500 8H32.500V11.500C36.500 13 39 16.500 39 21V40.500C39 44 36.500 46.500 33 46.500H11C7.500 46.500 5 44 5 40.500V21C5 16.500 7.500 13 11.500 11.500Z" />
    <path fill="#6b4a3a" stroke="none" d="M5.500 38C12 36 32 36 38.500 38V40.500C38.500 44 36.500 46 33 46H11C7.500 46 5.500 44 5.500 40.500Z" />
    <g fill="#b9a48e" stroke="none"><circle cx="12" cy="42.500" r="1.500" /><circle cx="20" cy="43.500" r="1.200" /><circle cx="30.500" cy="42.500" r="1.500" /></g>
    <g className={styles.canopy} style={{ transformOrigin: "22px 38px" }}>
      {stage === 1 && <path fill={moss} strokeWidth="1.5" d="M18.500 37.500C18.500 34 25.500 34 25.500 37.500Z" />}
      {stage >= 2 && <path fill={moss} strokeWidth="1.5" d="M6.500 38C8.500 33.500 14 33.500 16 36.500C18 32.500 25 32.500 27 36.500C29 33.500 35 33.500 37.500 38Z" />}
      {stage >= 3 && <path stroke={fern} strokeWidth="1.5" d="M22 34.500C22 30 21 27 19 24.500C17.500 23 18.500 21.500 20 22.500M21.700 31.500L18.500 30.300M22 33L25.200 32M21 28.800L18 27.300M21.300 29.300L24.200 27.800" />}
      {stage >= 4 && <><path fill="#7fbf78" strokeWidth="1.5" d="M9.500 36C7.500 32 10.500 28.500 13.500 30.500C15.500 28.500 18.500 31 17 34.500C16 36.500 11 37 9.500 36Z" />
        <path stroke={fern} strokeWidth="1.5" d="M30 35C30.500 30.500 32 27.500 34 25.500M30.300 32L27.500 30.800M30.800 30L33.800 29.500M31.500 27.800L29 26.300" /></>}
      {stage === 5 && <><path fill="#fffaf0" strokeWidth="1.3" d="M25 31.500V36H27.500V31.500" /><path fill="#e8766d" strokeWidth="1.4" d="M22.200 31.500C22.200 27 30.300 27 30.300 31.500Z" />
        <g fill="#fff" stroke="none"><circle cx="24.800" cy="29.800" r=".8" /><circle cx="27.800" cy="29.300" r=".8" /></g>
        <path fill="#fffaf0" strokeWidth="1.2" d="M13.200 33.500V36H14.800V33.500" /><path fill="#e8766d" strokeWidth="1.3" d="M11.300 33.500C11.300 30.500 16.700 30.500 16.700 33.500Z" /></>}
    </g>
    <path d="M11.500 8H32.500V11.500C36.500 13 39 16.500 39 21V40.500C39 44 36.500 46.500 33 46.500H11C7.500 46.500 5 44 5 40.500V21C5 16.500 7.500 13 11.500 11.500Z" />
    <path fill="#cfe3f2" d="M10 4.500H34V8.500H10Z" />
    <path stroke="#fff" strokeWidth="2" opacity=".85" d="M9.500 19V29" />
  </svg>;
}
/** 한 달 키우는 것의 그림 */
export function GrowerArt({ id, stage }: { id: GrowerId; stage: GrowStage }) {
  return id === "tree" ? <TreeArt stage={stage} /> : <MossArt stage={stage} />;
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
    {watering && <Pour top={-6} fall={46} />}
    {thirsty && !watering && !disabled && <span className={styles.thirsty} aria-hidden="true"><DropIcon /></span>}
  </button>;
}

/**
 * 한 달 키우는 것 (작은 나무·이끼 병). 톡 누르면 하루 한 번 돌본다: 서른 번이면 다 자란다. 화분처럼 시들지 않고 기다린다.
 * 아직 안 돌본 날에는 물방울이 까딱이고, 다 자라면 반짝인다
 */
export function MoruGrower({ id, state, today, tending, disabled, onTend }: {
  id: GrowerId; state: Happenings; today: string; tending: boolean; disabled?: boolean; onTend: () => void;
}) {
  const g = growerOf(id);
  if (!g) return null;
  const n = state.grow[id].n, stage = growStage(n), full = n >= GROW_TOTAL;
  const thirsty = !full && !tendedToday(state, id, today);
  const label = full ? `${g.name}, 다 자랐어요. ${g.stages[5]}`
    : thirsty ? `${g.name}에 ${g.verb}. 지금은 ${g.stages[stage]}, 다 자라기까지 ${GROW_TOTAL - n}번` : `${g.name}, 오늘 돌봤어요. 지금은 ${g.stages[stage]}`;
  return <button type="button" className={styles.grower} data-grower={id} data-stage={stage} data-tending={tending ? "" : undefined} data-grown={full ? "" : undefined}
    disabled={disabled} aria-label={label} onClick={onTend}>
    <GrowerArt id={id} stage={stage} />
    {tending && (id === "tree" ? <Pour top={38} fall={24} flip /> : <Pour top={-8} fall={44} />)}
    {thirsty && !tending && !disabled && <span className={styles.thirsty} aria-hidden="true"><DropIcon /></span>}
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

/** 주운 것들: 키우는 것(화분·작은 나무·이끼 병)의 지금, 날아든 것·물어 온 것, 꽃갈피 */
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
      <h4 className={styles.heading}>한 달 키우기 <small>서른 번 돌보면 다 자라요</small></h4>
      {GROWERS.map((g) => {
        const n = state.grow[g.id].n, grown = growStage(n);
        return <section key={g.id} className={styles.pot} data-grower={g.id} aria-label={g.name}>
          <GrowerArt id={g.id} stage={grown} />
          <div>
            <h4>{g.name} · {g.stages[grown]}</h4>
            <p>{growStatus(state, g.id, today)}</p>
            <span className={styles.growBar} role="img" aria-label={`${GROW_TOTAL}번 가운데 ${n}번 돌봤어요`}><i style={{ width: `${(n / GROW_TOTAL) * 100}%` }} /></span>
          </div>
        </section>;
      })}
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
      <p className={room.footnote}>날아든 것은 하루 다섯 개까지, 물어 온 것은 하루 하나예요. 놓쳐도 잃는 것은 없어요. 화분·키우는 것·주운 것들은 지금은 이 기기에 남아요.</p>
    </div>
  </Sheet>;
}
