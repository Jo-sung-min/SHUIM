"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconCheck, IconChevronR, IconSparkle } from "@/components/Icons";
import { advanceBaikalJourney, baikalJourneyDistance, baikalJourneyKey, BAIKAL_JOURNEY_STOPS, readBaikalJourney, saveBaikalJourney, type BaikalJourneyPosition, type BaikalJourneyStage, type BaikalJourneyStorage } from "@/lib/beach/baikal-journey";
import styles from "./BaikalJourney.module.css";

interface JourneyEngine {
  getSelf(): BaikalJourneyPosition;
  setBaikalJourney(stage: number): void;
}
function localStore(): BaikalJourneyStorage | null {
  try { return window.localStorage; } catch { return null; }
}

/** A small, optional guide. It observes a walk without moving the avatar or changing the room's clock. */
export default function BaikalJourney({ engine, userId, communityId, hidden = false, paused = false, night }: {
  engine: JourneyEngine; userId: string; communityId: string; hidden?: boolean; paused?: boolean; night: boolean;
}) {
  const [stage, setStage] = useState<BaikalJourneyStage>(0);
  const [distance, setDistance] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [celebrating, setCelebrating] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const detailsId = useId();

  useEffect(() => {
    const storage = localStore();
    let current = readBaikalJourney(userId, communityId, storage);
    let celebrationTimer = 0;
    setStage(current);
    setAnnouncement("");
    setCelebrating(false);
    engine.setBaikalJourney(current);
    const sample = () => {
      if (document.hidden || pausedRef.current) return;
      const position = engine.getSelf();
      const next = advanceBaikalJourney(current, position);
      if (next !== current) {
        current = saveBaikalJourney(userId, communityId, next, storage);
        setStage(current);
        engine.setBaikalJourney(current);
        setAnnouncement(current === 3 ? "세 쉼터를 모두 만났어요. 오로라 여행을 완주했어요." : `${BAIKAL_JOURNEY_STOPS[current - 1].name}에 도착했어요.`);
        setCelebrating(true);
        window.clearTimeout(celebrationTimer);
        celebrationTimer = window.setTimeout(() => setCelebrating(false), 6500);
      }
      setDistance(baikalJourneyDistance(current, position));
    };
    const synchronize = (event: StorageEvent) => {
      if (event.key !== baikalJourneyKey(userId, communityId)) return;
      const saved = readBaikalJourney(userId, communityId, storage);
      if (saved <= current) return;
      current = saved;
      setStage(saved);
      engine.setBaikalJourney(saved);
      setDistance(baikalJourneyDistance(saved, engine.getSelf()));
    };
    sample();
    const timer = window.setInterval(sample, 350);
    window.addEventListener("storage", synchronize);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(celebrationTimer);
      window.removeEventListener("storage", synchronize);
    };
  }, [engine, userId, communityId]);

  const complete = stage === 3;
  return <aside className={styles.journey} hidden={hidden} data-complete={complete} aria-label="바이칼의 세 쉼터 여행">
    <button type="button" className={styles.summary} onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-controls={detailsId}>
      <span className={styles.mark} aria-hidden="true">{complete ? <IconSparkle /> : <span>{stage + 1}<small>/ 3</small></span>}</span>
      <span className={styles.heading}><small>{complete ? "세 쉼터에 남긴 발자국" : "오로라를 만나는 길"}</small><strong>{complete ? "오로라 여행 완주" : BAIKAL_JOURNEY_STOPS[stage].name}</strong></span>
      {!complete && distance !== null && <span className={styles.distance}>약 {distance}m</span>}
      <span className={styles.chevron} aria-hidden="true"><IconChevronR /></span>
    </button>
    <div className={styles.progress} aria-hidden="true">{BAIKAL_JOURNEY_STOPS.map((stop, index) => <i key={stop.id} data-done={index < stage} data-next={index === stage} />)}</div>
    <div id={detailsId} className={styles.details} hidden={!expanded}>
      <ol>{BAIKAL_JOURNEY_STOPS.map((stop, index) => <li key={stop.id} data-done={index < stage} aria-current={index === stage ? "step" : undefined}>
        <span aria-hidden="true">{index < stage ? <IconCheck /> : index + 1}</span>{stop.name}<small>{index < stage ? "다녀왔어요" : index === stage ? "다음 쉼터" : ""}</small>
      </li>)}</ol>
      <p>{complete ? night ? "관측소의 통창 너머, 나만의 오로라를 천천히 바라보세요." : "밤이 오면 관측소 너머로 오로라가 펼쳐져요." : "오두막 안이나 현관에 도착하면 발자국이 남아요. 원하는 만큼 쉬어 가세요."}</p>
    </div>
    {celebrating && !expanded && <p className={styles.arrival}>{complete ? night ? "눈길 끝에서 만난, 당신의 오로라" : "밤이 오면 오로라가 펼쳐져요" : "잠시 온기를 채우고, 천천히 출발해요"}</p>}
    <span className={styles.live} role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
  </aside>;
}
