"use client";

import { useEffect, useState, type SVGProps } from "react";
import { Sheet } from "./ui";
import { CARE_CATALOG, type CareIconName } from "@/lib/care";
import { IconBook, IconBubble, IconCalendar, IconChart, IconCheck, IconFlag, IconHeart, IconLeaf, IconLotus, IconNote, IconReels, IconSparkle, IconStar } from "./Icons";
import styles from "./CareSheets.module.css";

const ICONS: Record<CareIconName, (p: SVGProps<SVGSVGElement>) => React.JSX.Element> = {
  sparkle: IconSparkle, star: IconStar, heart: IconHeart, note: IconNote, flag: IconFlag, calendar: IconCalendar,
  bubble: IconBubble, reels: IconReels, chart: IconChart, lotus: IconLotus, leaf: IconLeaf, book: IconBook,
};

/** lib/care.ts 의 아이콘 이름 → 선형 아이콘 */
export function CareIcon({ name, ...p }: { name: CareIconName } & SVGProps<SVGSVGElement>) {
  const Icon = ICONS[name] ?? IconSparkle;
  return <Icon {...p} />;
}

/** "나를 위한 시간" 에 칸 추가/빼기 */
export function CareAddSheet({ open, selected, onToggle, onClose }: { open: boolean; selected: string[]; onToggle: (id: string) => void; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="나를 위한 시간 추가">
      <p className="tiny muted" style={{ margin: "0 2px 12px" }}>정리·칭찬·사랑·분석 옆에 둘 칸을 골라요. 오늘 아직 안 한 칸에는 빨간 점이 와요.</p>
      <div className="stack" style={{ gap: 8 }}>
        {CARE_CATALOG.map((a) => {
          const on = selected.includes(a.id);
          return (
            <button key={a.id} type="button" className={`reason glass ${on ? "on" : ""}`} aria-pressed={on} onClick={() => onToggle(a.id)}>
              <span className={styles.pickIcon} aria-hidden="true"><CareIcon name={a.icon} /></span>
              <span><b>{a.label}</b><small>{a.desc}</small></span>
              {on && <span className={styles.pickCheck} aria-hidden="true"><IconCheck /></span>}
            </button>
          );
        })}
      </div>
      <p className="tiny muted" style={{ margin: "12px 2px 0" }}>고른 칸은 이 기기에 저장돼요.</p>
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onClose}>완료</button>
      </div>
    </Sheet>
  );
}

const BREATH_TOTAL = 60;
const BREATH_IN = 4; // 들이쉬기 4초 · 내쉬기 6초 = 한 호흡 10초

/** 1분 숨 고르기. 끝까지 하면 onDone (오늘 했음으로 기록) */
export function BreathSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!open) { setElapsed(0); return; }
    const started = Date.now();
    const timer = window.setInterval(() => {
      const s = Math.min(BREATH_TOTAL, Math.round((Date.now() - started) / 1000));
      setElapsed(s);
      if (s >= BREATH_TOTAL) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [open]);
  const finished = elapsed >= BREATH_TOTAL;
  useEffect(() => { if (finished) onDone(); }, [finished, onDone]);
  const inhale = elapsed % 10 < BREATH_IN;
  return (
    <Sheet open={open} onClose={onClose} title="숨 고르기">
      <div className={styles.breath} role="timer" aria-live="polite" aria-label={finished ? "끝났어요" : `${inhale ? "들이쉬기" : "내쉬기"}, ${BREATH_TOTAL - elapsed}초 남음`}>
        <div className={`${styles.breathCircle} ${open && !finished ? styles.breathing : ""}`} aria-hidden="true" />
        <b>{finished ? "잘했어요" : inhale ? "들이쉬기" : "내쉬기"}</b>
        <small>{finished ? "1분 동안 숨에 집중했어요." : `${BREATH_TOTAL - elapsed}초 · 코로 천천히 들이쉬고 입으로 길게 내쉬어요`}</small>
      </div>
      <div className="sheet-actions">
        <button type="button" className={finished ? "btn" : "btn ghost"} onClick={onClose}>{finished ? "완료" : "그만하기"}</button>
      </div>
    </Sheet>
  );
}
