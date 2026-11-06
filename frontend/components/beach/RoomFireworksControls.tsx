"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconHeart, IconLock, IconLotus, IconMoon, IconRain, IconSmile, IconSparkle, IconStar } from "@/components/Icons";
import type { FireworkVariant } from "@/lib/beach/net";
import type { MapId } from "@/lib/beach/maps";
import styles from "./beach.module.css";

const GRAND_STYLES = [
  { variant: "festival", label: "축제", description: "밤하늘 가득, 함께 터지는 불꽃", Icon: IconSparkle, adminOnly: false },
  { variant: "bloom", label: "겹꽃", description: "색색의 꽃잎이 겹겹이 피어나요", Icon: IconLotus, adminOnly: false },
  { variant: "saturn", label: "별고리", description: "빛나는 고리가 하늘에 퍼져요", Icon: IconMoon, adminOnly: false },
  { variant: "willow", label: "황금비", description: "금빛 불씨가 비처럼 쏟아져요", Icon: IconRain, adminOnly: false },
  { variant: "stardust", label: "별무리", description: "작은 별꽃이 다시 터져 반짝여요", Icon: IconStar, adminOnly: false },
  { variant: "songi", label: "송이 안녕?", Icon: IconSmile, description: "불꽃이 지나간 자리에 빛나는 인사", adminOnly: true },
  { variant: "love", label: "사랑해", Icon: IconHeart, description: "분홍빛 하트가 차례로 피어나요", adminOnly: false },
] as const;

/**
 * 불꽃놀이 버튼. 관리자(tickets === null)는 무료로 전 종류, 회원은 이용권을 한 장씩 쓴다.
 * 상태 우선순위: 준비 중 > 방 쿨타임(모두 같은 시각) > 잠김(이용권 0장 → onUnlock) > 열림.
 */
export default function RoomFireworksControls({ deadline, busy, disabled, onLaunch, tickets = null, onUnlock }: {
  deadline: number; busy: boolean; disabled: boolean; onLaunch: (variant: FireworkVariant) => void; mapId?: MapId;
  tickets?: number | null; onUnlock?: () => void;
}) {
  const [now, setNow] = useState(Date.now);
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    setNow(Date.now());
    if (deadline <= Date.now()) return;
    const timer = window.setInterval(() => {
      const current = Date.now(); setNow(current);
      if (current >= deadline) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [deadline]);
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  const free = tickets === null;
  const locked = !free && tickets <= 0;
  const unavailable = disabled || busy || remaining > 0;
  useEffect(() => { if (unavailable || locked) setOpen(false); }, [unavailable, locked]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); setOpen(false); trigger.current?.focus();
    };
    container.current?.querySelector<HTMLButtonElement>("[data-firework-variant]")?.focus();
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  const styleList = GRAND_STYLES.filter((style) => free || !style.adminOnly);
  const label = busy ? "준비 중…" : remaining ? `${remaining}초 후` : locked ? "불꽃놀이" : free ? "불꽃놀이" : `불꽃놀이 · ${tickets}장`;
  const ariaLabel = busy ? "불꽃놀이 준비 중" : remaining ? `불꽃놀이 ${remaining}초 후 가능` : locked ? "불꽃놀이 잠김 · 이용권이 필요해요" : free ? "불꽃놀이 고르기" : `불꽃놀이 고르기 · 이용권 ${tickets}장`;
  return <div ref={container} className={styles.fireworksControl}>
    <button ref={trigger} type="button" className={styles.glass + " " + styles.fireworksTrigger} data-action="fireworks" data-locked={locked || undefined}
      disabled={unavailable} aria-busy={busy} aria-expanded={locked ? undefined : open} aria-controls={locked ? undefined : panelId} aria-haspopup={locked ? "dialog" : undefined}
      aria-label={ariaLabel} onClick={() => { if (locked) onUnlock?.(); else setOpen(!open); }}>
      {locked ? <IconLock /> : <IconSparkle />}<span>{label}</span>
    </button>
    {open && !locked && <div id={panelId} className={styles.fireworksPanel} data-grand="true" role="group" aria-label="불꽃놀이 종류">
      <strong>하늘에 띄우고 싶은 마음</strong>
      {styleList.map(({ variant, label: name, description, Icon }) => <button key={variant} type="button"
        data-firework-variant={variant} disabled={unavailable}
        onClick={() => { setOpen(false); trigger.current?.focus(); onLaunch(variant); }}>
        <Icon /><span><strong>{name}</strong><small>{description}</small></span>
      </button>)}
      <small>{free ? "약 12초, 고르면 바로 시작해요." : `약 12초, 고르면 이용권 1장을 쓰고 바로 시작해요. 남은 이용권 ${tickets}장.`}</small>
    </div>}
  </div>;
}
