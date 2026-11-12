"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import EmotionOrb from "@/components/EmotionOrb";
import { Sheet } from "@/components/ui";
import { MAPS, type MapId } from "@/lib/beach/maps";
import { ORB_KINDS, orbCompanionNote, orbDayLabel, orbPlaceLabel, orbSpaceLabel } from "@/lib/emotion-orbs";
import type { FoundOrb } from "./useEmotionOrb";
import styles from "./OrbFound.module.css";

/**
 * 구슬을 주운 순간의 카드 (docs/EMOTION_ORBS.md 2.1장): 구슬, 이름, 그날의 기분, 어디서, 누구와.
 * 처음 주운 날에만 구슬이 무엇인지 한 줄을 더한다. 그 전에는 어디에도 설명이 없다.
 */
export default function OrbFound({ found, onClose }: { found: FoundOrb; onClose: () => void }) {
  const { orb, first } = found;
  const kind = ORB_KINDS[orb.mood];
  const mapName = MAPS[orb.mapId as MapId]?.name ?? "소로우 맵";
  const note = orbCompanionNote(orb);
  return createPortal(<div className={styles.scope}><Sheet open onClose={onClose} title="반짝이는 것을 주웠어요">
    <div className={styles.card}>
      <div className={styles.orb}><EmotionOrb mood={orb.mood} size={132} /></div>
      <p className={styles.name}>{kind.name}</p>
      <p className={styles.feeling}>오늘의 기분 · {kind.feeling}</p>
      <p className={styles.line}>{kind.line}</p>
      <dl className={styles.memo}>
        <div><dt>언제</dt><dd>{orbDayLabel(orb.day)}</dd></div>
        <div><dt>어디서</dt><dd>{orbPlaceLabel(mapName, orb.spotName)}<small>{orbSpaceLabel(orb)}</small></dd></div>
        <div><dt>함께</dt><dd>
          {orb.companions.length > 0 && <span className={styles.people}>{orb.companions.map((c) => <b key={c.id}>{c.nick}</b>)}</span>}
          {note && <small>{note}</small>}
        </dd></div>
      </dl>
      {first && <p className={styles.intro}>맵에 머물다 보면 하루에 하나, 어딘가에 구슬이 생겨요. 그날의 마음을 닮은 빛깔로 보관함에 남아요.</p>}
      <div className={styles.actions}>
        <Link href="/me/keepsakes" className={styles.keep}>보관함 보기</Link>
        <button type="button" className={styles.stay} onClick={onClose}>계속 머물기</button>
      </div>
    </div>
  </Sheet></div>, document.body);
}
