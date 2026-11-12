"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Sheet } from "./ui";
import HelpBanner from "./HelpBanner";
import MoruCompanion from "./MoruCompanion";
import { lastNDays, series } from "@/lib/accel";
import { MOOD_BESIDE_LINE, MOOD_NAMES, moodNoteLine, type MoodReading, type MoodStage } from "@/lib/moru";
import type { Journal } from "@/lib/storage";
import styles from "./MoruPet.module.css";

const INK = "#4a3528";
const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);
/** 작은 얼굴의 입: 1 울적해 … 5 행복해 */
const FACE_MOUTH: Record<MoodStage, string> = {
  1: "M5.600 11.500Q8 9.300 10.400 11.500",
  2: "M5.900 11.100Q8 10 10.100 11.100",
  3: "M6.100 10.600H9.900",
  4: "M5.900 10.200Q8 11.700 10.100 10.200",
  5: "M5.400 9.800Q8 12.700 10.600 9.800",
};

/** 상태줄의 기분 딱지에 붙는 작은 얼굴 (손그림 아이콘) */
export function MoodFace({ stage }: { stage: MoodStage }) {
  return <svg className={styles.handIcon} viewBox="0 0 16 16" fill="none" stroke={INK} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="8" cy="8" r="6.600" fill="#fffaf3" />
    {stage === 5 ? <path d="M4.700 7.300Q5.800 5.900 6.900 7.300M9.100 7.300Q10.200 5.900 11.300 7.300" />
      : <path strokeWidth="1.9" d={stage <= 2 ? "M5.700 7.400V7.500M10.300 7.400V7.500" : "M5.700 6.900V7.100M10.300 6.900V7.100"} />}
    <path d={FACE_MOUTH[stage] ?? FACE_MOUTH[3]} />
  </svg>;
}

/**
 * 오늘의 기분 쪽지 (docs/MORU_MOOD_SYNC.md 4.2): 캐릭터가 왜 그런 기분인지 궁금해진 사람이 여기서 자기 기록을 본다.
 * 숫자는 흐름 보기와 같은 것만(전체 평균 위치, 내려간·올라온 날 수) 보여 주고, 문장은 기록을 말할 뿐 사람을 판정하지 않는다.
 * 가라앉은 날에만 작은 권유(숨 고르기)와 도움 연락처를 둔다. 오늘 기록에 많이 힘든 신호가 있으면 연락처를 맨 위에 펼친다
 */
export default function MoruMoodSheet({ open, onClose, name, appearance, level, stage, reading, crisis, journal, onBreathe, onWrite }: {
  open: boolean; onClose: () => void; name: string; appearance: string; level?: number;
  stage: MoodStage; reading: MoodReading | null; crisis: boolean; journal?: Journal | null;
  onBreathe?: () => void; onWrite?: () => void;
}) {
  const recorded = Boolean(reading?.recorded);
  const low = stage <= 2;
  const facts = useMemo(() => {
    if (!open || !journal) return "";
    const points = series(journal, lastNDays(7), "all");
    const days = points.filter((p) => p.level !== null).length;
    if (!days) return "";
    const downs = points.filter((p) => (p.accel ?? 0) < 0).length;
    const ups = points.filter((p) => (p.accel ?? 0) > 0).length;
    const todayLevel = points[points.length - 1]?.level ?? null;
    const moves = `내려간 날 ${downs}일 · 올라온 날 ${ups}일`;
    return todayLevel !== null ? `오늘 전체 평균 ${signed(todayLevel)} · 최근 7일 가운데 ${moves}` : `최근 7일 가운데 기록한 날 ${days}일 · ${moves}`;
  }, [open, journal]);

  return <Sheet open={open} title={`오늘 ${name}의 기분`} onClose={onClose} className={styles.handSheet}>
    <div className={styles.moodNote}>
      {crisis && <HelpBanner alert />}
      <div className={styles.moodHero}><MoruCompanion appearance={appearance} mood="idle" level={level} stage={stage} /></div>
      <h4>{MOOD_NAMES[stage]}</h4>
      <p className={styles.moodSay}>“{crisis ? MOOD_BESIDE_LINE : moodNoteLine(stage, recorded)}”</p>
      {facts && <p className={styles.moodFacts}>{facts}</p>}
      <div className={styles.moodActions}>
        <Link href="/flow" className="btn ghost">흐름 보기</Link>
        {!recorded && onWrite ? <button type="button" className="btn" onClick={onWrite}>마음 들려주기</button>
          : low && onBreathe ? <button type="button" className="btn" onClick={() => { onClose(); onBreathe(); }}>숨 고르기</button> : null}
      </div>
      {low && !crisis && <HelpBanner />}
      {(low || crisis) && <p className={styles.footnote}>소로우는 의료 서비스가 아니에요. 힘든 날이 오래 이어지면 전문가와 이야기해 보세요.</p>}
      <p className={styles.footnote}>{name}의 기분은 내가 들려준 기록을 닮아요. 하트(밥·온기·말끔·기운)는 {name}의 것이에요. 닮기는 방의 ☰ 메뉴에서 끌 수 있어요.</p>
    </div>
  </Sheet>;
}
