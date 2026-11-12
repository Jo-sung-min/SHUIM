import type { StaticImageData } from "next/image";
import { Sheet } from "./ui";
import type { PetView } from "@/lib/pet";
import frameArt from "./moru-decor/frame.webp";
import clockArt from "./moru-decor/clock.webp";
import wreathArt from "./moru-decor/wreath.webp";
import ivyArt from "./moru-decor/ivy.webp";
import mobileArt from "./moru-decor/mobile.webp";
import lanternArt from "./moru-decor/lantern.webp";
import heartArt from "./moru-decor/heart.webp";
import bearArt from "./moru-decor/bear.webp";
import yarnArt from "./moru-decor/yarn.webp";
import monsteraArt from "./moru-decor/monstera.webp";
import mushroomArt from "./moru-decor/mushroom.webp";
import booksArt from "./moru-decor/books.webp";
import styles from "./MoruPet.module.css";

/**
 * 꾸미기 (V47 서버): 방문포인트로 가구를 사서 공간마다 정해진 자리 다섯 곳에 놓는다.
 * 가구 그림은 OpenAI 이미지로 방과 같은 손그림 판 한 장을 만들어 잘라 쓴다 (긴 변 160px, 무대에서는 32~48px).
 * 값과 종류는 서버(PetDecor)가 정하고, 여기서는 이름·그림과 그림 속 자리만 안다. 모르는 가구 id 는 보여 주지 않는다.
 */
export const FURNITURE: Record<string, { name: string; art: StaticImageData }> = {
  frame: { name: "풍경 액자", art: frameArt }, clock: { name: "둥근 시계", art: clockArt }, wreath: { name: "꽃 리스", art: wreathArt },
  ivy: { name: "아이비 화분", art: ivyArt }, mobile: { name: "별 모빌", art: mobileArt }, lantern: { name: "종이 등", art: lanternArt },
  heart: { name: "하트 쿠션", art: heartArt }, bear: { name: "곰 인형", art: bearArt }, yarn: { name: "털실 바구니", art: yarnArt },
  monstera: { name: "몬스테라", art: monsteraArt }, mushroom: { name: "버섯 스탠드", art: mushroomArt }, books: { name: "책과 찻잔", art: booksArt },
};
/** 자리 → 종류 (서버 PetDecor.SLOTS 와 같다) */
export const SLOT_KIND: Record<string, string> = { wallL: "wall", wallR: "wall", hang: "hang", bedL: "soft", bedR: "side" };
const KIND_NAMES: Record<string, string> = { wall: "벽에 거는 것", hang: "매다는 것", soft: "이불 위에 두는 것", side: "곁에 두는 것" };

/** 무대(480×700) 위의 자리. anchor: 벽은 가운데, 매다는 것은 위 끝(cord 만큼 줄이 위로), 놓는 것은 아래 끝 */
interface Slot { id: string; label: string; x: number; y: number; size: number; anchor: "center" | "top" | "bottom"; cord?: number }
const SLOTS: Slot[][] = [
  [ // 기차 침대칸: 커튼 바깥 좁은 벽 둘, 화분이 걸린 못, 펼친 책 자리, 베개 옆
    { id: "wallL", label: "왼쪽 벽", x: 100, y: 300, size: 32, anchor: "center" },
    { id: "wallR", label: "오른쪽 벽", x: 381, y: 300, size: 32, anchor: "center" },
    { id: "hang", label: "벽의 못", x: 380, y: 384, size: 42, anchor: "top" },
    { id: "bedL", label: "이불 위", x: 136, y: 516, size: 46, anchor: "bottom" },
    { id: "bedR", label: "베개 옆", x: 376, y: 514, size: 44, anchor: "bottom" },
  ],
  [ // 다락방: 지붕 아래 양쪽 벽, 둥근 창 위, 등 앞의 요, 오른쪽 선반
    { id: "wallL", label: "왼쪽 벽", x: 108, y: 366, size: 34, anchor: "center" },
    { id: "wallR", label: "오른쪽 벽", x: 372, y: 372, size: 34, anchor: "center" },
    { id: "hang", label: "창 위", x: 240, y: 236, size: 46, anchor: "top" },
    { id: "bedL", label: "요 위", x: 112, y: 524, size: 44, anchor: "bottom" },
    { id: "bedR", label: "선반 위", x: 381, y: 449, size: 40, anchor: "bottom" },
  ],
  [ // 창가 침대방: 왼쪽 벽의 액자 두 자리, 큰 창 앞, 이불 위, 창턱
    { id: "wallL", label: "위 액자 자리", x: 113, y: 283, size: 48, anchor: "center" },
    { id: "wallR", label: "아래 액자 자리", x: 113, y: 356, size: 42, anchor: "center" },
    { id: "hang", label: "창 앞", x: 300, y: 236, size: 48, anchor: "top", cord: 106 },
    { id: "bedL", label: "이불 위", x: 110, y: 532, size: 44, anchor: "bottom" },
    { id: "bedR", label: "창턱", x: 372, y: 469, size: 44, anchor: "bottom" },
  ],
];
/** MoruHomeScene 과 같은 갈래: 0 기차 침대칸, 1 다락방, 나머지는 창가 침대방 */
const sceneOf = (homeId: number) => (homeId === 0 ? 0 : homeId === 1 ? 1 : 2);
export const decorSlots = (homeId: number) => SLOTS[sceneOf(homeId)];

function box(slot: Slot, art: StaticImageData) {
  const scale = slot.size / Math.max(art.width, art.height);
  const w = art.width * scale, h = art.height * scale;
  return { x: slot.x - w / 2, y: slot.anchor === "top" ? slot.y : slot.anchor === "bottom" ? slot.y - h : slot.y - h / 2, w, h };
}
/** 자리의 가운데 (꾸미는 중에 누르는 동그라미). 360px 폭 휴대폰에서 방에 보이는 무대는 가로 81~399 라, 동그라미가 잘리지 않게 안쪽으로 당긴다 */
function middle(slot: Slot) {
  return { x: Math.min(376, Math.max(104, slot.x)), y: slot.anchor === "top" ? slot.y + slot.size / 2 : slot.anchor === "bottom" ? slot.y - slot.size / 2 : slot.y };
}

/** 방에 놓인 가구. 꾸미는 중에는 자리마다 누를 수 있는 동그라미가 뜬다 (빈 자리는 +) */
export function DecorLayer({ homeId, decor, editing, onPick }: { homeId: number; decor: Record<string, string>; editing: boolean; onPick: (slot: string) => void }) {
  const slots = decorSlots(homeId);
  return <div className={styles.decor} data-editing={editing ? "" : undefined}>
    <svg className={styles.decorArt} viewBox="0 0 480 700" width="480" height="700" aria-hidden="true">
      {slots.map((slot) => {
        const item = FURNITURE[decor[slot.id]];
        if (!item) return null;
        const b = box(slot, item.art);
        return <g key={slot.id}>
          {slot.cord ? <path d={`M${slot.x} ${slot.y - slot.cord}V${slot.y + 3}`} fill="none" stroke="#4a3528" strokeWidth="1.6" strokeLinecap="round" /> : null}
          <image href={item.art.src} x={b.x} y={b.y} width={b.w} height={b.h} />
        </g>;
      })}
    </svg>
    {editing && slots.map((slot) => {
      const item = FURNITURE[decor[slot.id]];
      const m = middle(slot), size = Math.max(40, slot.size + 6);
      return <button key={slot.id} type="button" className={styles.decorSlot} data-filled={item ? "" : undefined}
        style={{ left: m.x - size / 2, top: m.y - size / 2, width: size, height: size }}
        aria-label={`${slot.label}: ${item ? item.name : "비어 있어요"}`} onClick={() => onPick(slot.id)}>
        {!item && <span aria-hidden="true">+</span>}
      </button>;
    })}
  </div>;
}

/** 자리 하나를 눌렀을 때: 그 자리에 맞는 가구들. 가진 것은 그냥 놓고, 없는 것은 방문포인트로 사서 놓는다 */
export function DecorSheet({ open, slot, homeId, pet, busy, error, onPlace, onClose }: {
  open: boolean; slot: string | null; homeId: number; pet: PetView | null; busy: boolean; error: string;
  onPlace: (slot: string, item: string | null) => void; onClose: () => void;
}) {
  const spot = slot ? decorSlots(homeId).find((s) => s.id === slot) : undefined;
  const kind = slot ? SLOT_KIND[slot] : undefined;
  const items = (pet?.furniture ?? []).filter((f) => f.kind === kind && FURNITURE[f.id]);
  const owned = pet?.ownedFurniture ?? [];
  const current = slot ? pet?.decor?.[slot] : undefined;
  const points = pet?.points ?? 0;
  return <Sheet open={open} title={spot?.label ?? "꾸미기"} onClose={onClose} className={styles.handSheet}>
    <div className={styles.decorShop}>
      <p className={styles.shopBalance}>방문포인트 <b>{points} P</b><small>{kind ? KIND_NAMES[kind] : ""} · 산 가구는 어느 공간에나 놓아요</small></p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <ul className={styles.decorGrid}>
        {items.map((f) => {
          const have = owned.includes(f.id), here = current === f.id, short = Math.max(0, f.cost - points);
          const elsewhere = Object.entries(pet?.decor ?? {}).some(([at, id]) => id === f.id && at !== slot); // 같은 공간의 다른 자리에 있으면 이리로 옮긴다
          const label = here ? "놓여 있어요" : have ? (elsewhere ? "옮기기" : "놓기") : short ? `${short} P 부족` : "사서 놓기";
          return <li key={f.id} data-here={here ? "" : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={FURNITURE[f.id].art.src} alt="" width={64} height={64} />
            <b>{FURNITURE[f.id].name}</b>
            <small>{have ? "가지고 있어요" : `${f.cost} P`}</small>
            <button type="button" aria-label={`${FURNITURE[f.id].name} ${label}`} disabled={busy || here || (!have && short > 0) || !slot} onClick={() => slot && onPlace(slot, f.id)}>{label}</button>
          </li>;
        })}
      </ul>
      {current && slot && <button type="button" className={styles.secondary} disabled={busy} onClick={() => onPlace(slot, null)}>자리 비우기</button>}
    </div>
  </Sheet>;
}
