import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { StaticImageData } from "next/image";
import { Sheet } from "./ui";
import type { PetView } from "@/lib/pet";
import frameArt from "./moru-decor/frame.webp";
import clockArt from "./moru-decor/clock.webp";
import wreathArt from "./moru-decor/wreath.webp";
import moonPosterArt from "./moru-decor/moonPoster.webp";
import calendarArt from "./moru-decor/calendar.webp";
import mirrorArt from "./moru-decor/mirror.webp";
import ivyArt from "./moru-decor/ivy.webp";
import mobileArt from "./moru-decor/mobile.webp";
import lanternArt from "./moru-decor/lantern.webp";
import stringLightsArt from "./moru-decor/stringLights.webp";
import heartArt from "./moru-decor/heart.webp";
import bearArt from "./moru-decor/bear.webp";
import catArt from "./moru-decor/cat.webp";
import bunnyArt from "./moru-decor/bunny.webp";
import duckArt from "./moru-decor/duck.webp";
import snowmanArt from "./moru-decor/snowman.webp";
import monsteraArt from "./moru-decor/monstera.webp";
import cactusArt from "./moru-decor/cactus.webp";
import succulentArt from "./moru-decor/succulent.webp";
import tulipsArt from "./moru-decor/tulips.webp";
import sunflowerArt from "./moru-decor/sunflower.webp";
import mushroomArt from "./moru-decor/mushroom.webp";
import starLampArt from "./moru-decor/starLamp.webp";
import candlesArt from "./moru-decor/candles.webp";
import booksArt from "./moru-decor/books.webp";
import yarnArt from "./moru-decor/yarn.webp";
import radioArt from "./moru-decor/radio.webp";
import recordArt from "./moru-decor/record.webp";
import globeArt from "./moru-decor/globe.webp";
import hourglassArt from "./moru-decor/hourglass.webp";
import diaryArt from "./moru-decor/diary.webp";
import cocoaArt from "./moru-decor/cocoa.webp";
import orangesArt from "./moru-decor/oranges.webp";
import rugArt from "./moru-decor/rug.webp";
import bookshelfArt from "./moru-decor/bookshelf.webp";
import beanbagArt from "./moru-decor/beanbag.webp";
import styles from "./MoruPet.module.css";

/**
 * 꾸미기 (V49 서버): 방문포인트로 가구를 사서 방 안 원하는 곳에 끌어다 놓는다.
 * 가구 그림은 OpenAI 이미지로 방과 같은 손그림 판(4×3)을 만들어 잘라 쓴다 (긴 변 160px, 크게 보이는 바닥 가구는 200~240px).
 * 값과 칸은 서버(PetDecor)가 정하고, 여기서는 이름·그림·보이는 크기(무대 px, 긴 변)만 안다. 모르는 가구 id 는 보여 주지 않는다.
 * 그림은 이미지 주소로만 묶여 있어, 방에 놓인 것과 가구 상자에서 지금 보는 칸의 것만 받는다.
 */
export const FURNITURE: Record<string, { name: string; art: StaticImageData; size: number; flat?: boolean }> = {
  frame: { name: "풍경 액자", art: frameArt, size: 40 }, clock: { name: "둥근 시계", art: clockArt, size: 38 },
  wreath: { name: "꽃 리스", art: wreathArt, size: 42 }, moonPoster: { name: "달 포스터", art: moonPosterArt, size: 42 },
  calendar: { name: "달력", art: calendarArt, size: 38 }, mirror: { name: "작은 거울", art: mirrorArt, size: 40 },
  ivy: { name: "아이비 화분", art: ivyArt, size: 50 }, mobile: { name: "별 모빌", art: mobileArt, size: 48 },
  lantern: { name: "종이 등", art: lanternArt, size: 44 }, stringLights: { name: "줄 전구", art: stringLightsArt, size: 96 },
  heart: { name: "하트 쿠션", art: heartArt, size: 46 }, bear: { name: "곰 인형", art: bearArt, size: 46 },
  cat: { name: "고양이 인형", art: catArt, size: 44 }, bunny: { name: "토끼 인형", art: bunnyArt, size: 46 },
  duck: { name: "오리 인형", art: duckArt, size: 42 }, snowman: { name: "눈사람 인형", art: snowmanArt, size: 46 },
  monstera: { name: "몬스테라", art: monsteraArt, size: 56 }, cactus: { name: "선인장", art: cactusArt, size: 40 },
  succulent: { name: "다육이", art: succulentArt, size: 46 }, tulips: { name: "튤립 꽃병", art: tulipsArt, size: 46 },
  sunflower: { name: "해바라기", art: sunflowerArt, size: 52 },
  mushroom: { name: "버섯 스탠드", art: mushroomArt, size: 46 }, starLamp: { name: "별 전등", art: starLampArt, size: 46 },
  candles: { name: "촛대", art: candlesArt, size: 44 },
  books: { name: "책과 찻잔", art: booksArt, size: 44 }, yarn: { name: "털실 바구니", art: yarnArt, size: 46 },
  radio: { name: "라디오", art: radioArt, size: 44 }, record: { name: "레코드 플레이어", art: recordArt, size: 52 },
  globe: { name: "지구본", art: globeArt, size: 44 }, hourglass: { name: "모래시계", art: hourglassArt, size: 36 },
  diary: { name: "일기장과 펜", art: diaryArt, size: 38 }, cocoa: { name: "코코아와 쿠키", art: cocoaArt, size: 44 },
  oranges: { name: "귤 바구니", art: orangesArt, size: 44 },
  rug: { name: "둥근 러그", art: rugArt, size: 124, flat: true }, bookshelf: { name: "작은 책장", art: bookshelfArt, size: 76 },
  beanbag: { name: "빈백 의자", art: beanbagArt, size: 64 },
};
/** 가구 상자의 칸 (서버 PetDecor.Item.kind) */
const KINDS: [string, string][] = [["wall", "벽"], ["hang", "매달기"], ["soft", "인형"], ["plant", "식물"], ["light", "빛"], ["small", "작은 것"], ["floor", "바닥"]];
/** 한 공간에 놓을 수 있는 수와 가구 가운데가 들어갈 상자 (서버 PetDecor 와 같은 값): 360px 폭에서 방에 보이는 무대 */
export const DECOR_MAX = 12;
const X_MIN = 90, X_MAX = 390, Y_MIN = 225, Y_MAX = 575;
const clampX = (x: number) => Math.round(Math.min(X_MAX, Math.max(X_MIN, x)));
const clampY = (y: number) => Math.round(Math.min(Y_MAX, Math.max(Y_MIN, y)));

export interface Placed { item: string; x: number; y: number }
/** V47 서버(자리 다섯)가 준 배치를 위치로 바꾼다 (V49 마이그레이션과 같은 값). 그 서버에서는 보여 주기만 한다 */
const LEGACY: Record<number, Record<string, [number, number]>> = {
  0: { wallL: [100, 300], wallR: [381, 300], hang: [380, 405], bedL: [136, 493], bedR: [376, 492] },
  1: { wallL: [108, 366], wallR: [372, 372], hang: [240, 259], bedL: [112, 502], bedR: [381, 429] },
  2: { wallL: [113, 283], wallR: [113, 356], hang: [300, 260], bedL: [110, 510], bedR: [372, 447] },
};
export function placedOf(pet: PetView | null, homeId: number): Placed[] {
  if (!pet || pet.homeId !== homeId) return [];
  if (pet.placed) return pet.placed;
  const table = LEGACY[homeId === 0 ? 0 : homeId === 1 ? 1 : 2];
  return Object.entries(pet.decor ?? {}).flatMap(([slot, item]) => (table[slot] ? [{ item, x: table[slot][0], y: table[slot][1] }] : []));
}
/** 새로 놓을 때의 첫 자리: 모루를 가리지 않게 왼쪽·오른쪽을 번갈아, 높이는 칸에 맞게 (그다음 끌어서 옮긴다) */
export function firstSpot(kind: string, count: number): { x: number; y: number } {
  const x = count % 2 ? 350 : 130;
  if (kind === "floor") return { x: 240, y: 548 };
  if (kind === "wall") return { x, y: 300 };
  if (kind === "hang") return { x: count % 2 ? 300 : 180, y: 270 };
  return { x, y: 480 };
}
function dims(f: { art: StaticImageData; size: number }) {
  const scale = f.size / Math.max(f.art.width, f.art.height);
  return { w: Math.round(f.art.width * scale), h: Math.round(f.art.height * scale) };
}
/** 그리는 순서: 바닥에 까는 것 먼저, 그다음 아래 끝이 위에 있는 것부터 (아래쪽 가구가 앞에 보인다) */
function inOrder(list: Placed[]) {
  return list.filter((p) => FURNITURE[p.item]).map((p) => ({ ...p, f: FURNITURE[p.item], ...dims(FURNITURE[p.item]) }))
    .sort((a, b) => Number(Boolean(b.f.flat)) - Number(Boolean(a.f.flat)) || a.y + a.h / 2 - (b.y + b.h / 2));
}

/**
 * 방에 놓인 가구. 꾸미는 중에는 가구를 손가락으로 끌어 옮기고(이 가구 위에서만 스크롤을 막는다), 톡 누르면 고르고, 고른 가구는 "넣어 두기".
 * 놓은 곳은 손을 뗄 때 한 번 저장한다(onDrop). 꽉 찬 화면에서 방이 커져도 손가락 이동을 무대 px 로 바꿔 쓴다.
 */
export function DecorLayer({ placed, editing, selected, onSelect, onDrop, onPutAway }: {
  placed: Placed[]; editing: boolean; selected: string | null;
  onSelect: (item: string | null) => void; onDrop: (item: string, x: number, y: number) => void; onPutAway: (item: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Placed | null>(null);
  const dragRef = useRef<Placed | null>(null);
  const press = useRef<{ item: string; pointer: number; px: number; py: number; x: number; y: number; scale: number; moved: boolean } | null>(null);
  useEffect(() => { if (!editing) { press.current = null; dragRef.current = null; setDrag(null); } }, [editing]);
  // 순서는 놓인 자리로 정하고 끄는 동안에는 바꾸지 않는다 (요소가 DOM 에서 옮겨지면 손가락 잡기가 풀린다). 끄는 가구는 CSS 로 맨 앞에
  const items = inOrder(placed).map((p) => (drag && drag.item === p.item ? { ...p, x: drag.x, y: drag.y } : p));
  const chosen = editing && selected ? items.find((p) => p.item === selected) : undefined;
  const down = (e: PointerEvent<HTMLButtonElement>, p: Placed) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const scale = (box.current?.getBoundingClientRect().width ?? 480) / 480 || 1;
    press.current = { item: p.item, pointer: e.pointerId, px: e.clientX, py: e.clientY, x: p.x, y: p.y, scale, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 이미 끝난 포인터 */ }
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const s = press.current;
    if (!s || s.pointer !== e.pointerId) return;
    const dx = (e.clientX - s.px) / s.scale, dy = (e.clientY - s.py) / s.scale;
    if (!s.moved && Math.hypot(dx, dy) < 6) return;
    s.moved = true;
    const next = { item: s.item, x: clampX(s.x + dx), y: clampY(s.y + dy) };
    dragRef.current = next; setDrag(next);
  };
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    const s = press.current;
    if (!s || s.pointer !== e.pointerId) return;
    press.current = null;
    const end = dragRef.current;
    dragRef.current = null; setDrag(null);
    if (!s.moved || !end) { onSelect(selected === s.item ? null : s.item); return; }
    onSelect(s.item);
    onDrop(s.item, end.x, end.y);
  };
  const cancel = () => { press.current = null; dragRef.current = null; setDrag(null); };
  /** 키보드·보조 기기: 화살표로 10px 씩 옮긴다 */
  const key = (e: KeyboardEvent<HTMLButtonElement>, p: Placed) => {
    const step: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
    const d = step[e.key];
    if (!d) return;
    e.preventDefault();
    onSelect(p.item);
    onDrop(p.item, clampX(p.x + d[0]), clampY(p.y + d[1]));
  };
  return <div ref={box} className={styles.decor} data-editing={editing ? "" : undefined}>
    {items.map((p) => {
      const style = { left: p.x - p.w / 2, top: p.y - p.h / 2, width: p.w, height: p.h };
      // eslint-disable-next-line @next/next/no-img-element
      const art = <img src={p.f.art.src} alt="" width={p.w} height={p.h} draggable={false} decoding="async" />;
      if (!editing) return <span key={p.item} className={styles.decorItem} style={style} aria-hidden="true">{art}</span>;
      return <button key={p.item} type="button" className={styles.decorItem} style={style}
        data-selected={selected === p.item ? "" : undefined} data-dragging={drag?.item === p.item ? "" : undefined}
        aria-label={`${p.f.name}, 끌어서 옮기기`} aria-pressed={selected === p.item}
        onPointerDown={(e) => down(e, p)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel}
        onKeyDown={(e) => key(e, p)} onContextMenu={(e) => e.preventDefault()}>{art}</button>;
    })}
    {chosen && !drag && <div className={styles.decorTools} style={{ left: Math.min(X_MAX - 20, Math.max(X_MIN + 20, chosen.x)), top: Math.max(Y_MIN - 10, chosen.y - chosen.h / 2 - 8) }}>
      <button type="button" onClick={() => onPutAway(chosen.item)}>넣어 두기</button>
    </div>}
  </div>;
}

/** 가구 상자: 칸마다 가구. 가진 것은 "놓기", 없는 것은 방문포인트로 "사서 놓기". 놓으면 방에 나타나고, 그다음 끌어서 옮긴다 */
export function DecorBox({ open, pet, placed, busy, error, onPick, onClose }: {
  open: boolean; pet: PetView | null; placed: Placed[]; busy: boolean; error: string;
  onPick: (item: string, kind: string) => void; onClose: () => void;
}) {
  const [kind, setKind] = useState("soft");
  const owned = pet?.ownedFurniture ?? [];
  const points = pet?.points ?? 0;
  const full = placed.length >= DECOR_MAX;
  const items = (pet?.furniture ?? []).filter((f) => f.kind === kind && FURNITURE[f.id]);
  const kinds = KINDS.filter(([id]) => (pet?.furniture ?? []).some((f) => f.kind === id && FURNITURE[f.id]));
  return <Sheet open={open} title="가구 상자" onClose={onClose} className={styles.handSheet}>
    <div className={styles.decorShop}>
      <p className={styles.shopBalance}>방문포인트 <b>{points} P</b><small>이 방에 {placed.length}/{DECOR_MAX}개 · 산 가구는 어느 공간에나 놓아요</small></p>
      <div className={styles.decorKinds} role="tablist" aria-label="가구 칸">
        {kinds.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={kind === id} onClick={() => setKind(id)}>{label}</button>)}
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <ul className={styles.decorGrid}>
        {items.map((f) => {
          const have = owned.includes(f.id), here = placed.some((p) => p.item === f.id), short = Math.max(0, f.cost - points);
          const label = here ? "방에 있어요" : full ? `${DECOR_MAX}개까지` : have ? "놓기" : short ? `${short} P 부족` : "사서 놓기";
          return <li key={f.id} data-here={here ? "" : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={FURNITURE[f.id].art.src} alt="" width={56} height={56} loading="lazy" decoding="async" />
            <b>{FURNITURE[f.id].name}</b>
            <small>{have ? "가지고 있어요" : `${f.cost} P`}</small>
            <button type="button" aria-label={`${FURNITURE[f.id].name} ${label}`} disabled={busy || here || full || (!have && short > 0)} onClick={() => onPick(f.id, f.kind)}>{label}</button>
          </li>;
        })}
      </ul>
    </div>
  </Sheet>;
}
