"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { type Daylight, currentHour, daylightAt } from "@/lib/beach/daylight";
import { CHAR_VIEW } from "@/lib/beach/atlas";
import { fetchBeachCount, type BeachCount } from "@/lib/beach/net";
import { MAPS, mapHref, type MapId } from "@/lib/beach/maps";
import type { Circle } from "@/lib/circles";
import { IconChevronR, IconLock, IconUsers } from "@/components/Icons";
import styles from "./BeachCard.module.css";

type BeachCircle = Pick<Circle, "id" | "name" | "slug" | "pinned" | "spaceCapacity" | "privateTest"> & { primary?: boolean };
const rgb = (c: readonly number[]) => `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;

/** 선택한 소로우와 풍경의 인원만 표시한다. */
export default function BeachCard({ circles }: { circles: BeachCircle[] }) {
  const selectId = useId();
  const [chosenId, setChosenId] = useState("");
  const [mapId, setMapId] = useState<MapId>("beach");
  const map = MAPS[mapId];
  const [d, setD] = useState<Daylight | null>(null);
  const [occupancy, setOccupancy] = useState<BeachCount | null>(null);
  const [countError, setCountError] = useState(false);
  const ordered = [...circles].sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true));
  const chosen = ordered.find((c) => c.id === chosenId) ?? ordered.find((c) => c.pinned) ?? ordered.find((c) => c.primary) ?? ordered[0];
  const communityId = chosen?.id;

  useEffect(() => {
    setD(daylightAt(currentHour()));
    const timer = window.setInterval(() => setD(daylightAt(currentHour())), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setOccupancy(null);
    setCountError(false);
    if (!communityId) return;
    let alive = true;
    const refresh = () => {
      if (document.hidden) return;
      fetchBeachCount(communityId, mapId).then((result) => {
        if (alive) { setOccupancy(result); setCountError(false); }
      }).catch(() => {
        if (alive) { setOccupancy(null); setCountError(true); }
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [communityId, mapId]);

  const day = d ?? daylightAt(12);
  const current = occupancy && occupancy.communityId === communityId && occupancy.mapId === mapId ? occupancy : null;
  const full = current !== null && current.count >= current.capacity;

  return (
    <section className={styles.card} data-map={mapId} aria-label="소로우에서 함께 쉬기">
      <div className={styles.mapChoices} role="group" aria-label="함께 쉴 풍경">
        {Object.values(MAPS).map((choice) => <button key={choice.id} type="button" aria-pressed={mapId === choice.id}
          onClick={() => setMapId(choice.id)}><span aria-hidden="true">{choice.id === "beach" ? "◡" : "◇"}</span>{choice.name}</button>)}
      </div>
      <div className={styles.scene}>
        <div className={styles.landscape} aria-hidden="true">
          <span className={styles.timeTint} style={{ backgroundColor: rgb(day.skyTop), opacity: 0.06 + day.stars * 0.48 }} />
          <span className={styles.people}>
            {[0, 1].map((skin, i) => (
              <span key={skin} className={styles.person} style={{ backgroundPosition: `${-(i === 1 ? CHAR_VIEW.left : CHAR_VIEW.front) * 36}px ${-skin * 52}px` }} />
            ))}
          </span>
        </div>
        <div className={styles.text}>
          <span className={styles.eyebrow}><IconLock />{map.eyebrow}</span>
          <h2>소로우 {map.name}</h2>
          <p>{map.description}</p>
        </div>
        {circles.length > 1 ? (
          <div className={styles.selector}>
            <label htmlFor={selectId}>함께 쉴 소로우</label>
            <select id={selectId} value={chosen.id} onChange={(e) => setChosenId(e.target.value)}>
              {ordered.map((c) => <option key={c.id} value={c.id}>{c.pinned ? "고정 · " : ""}{c.name}</option>)}
            </select>
          </div>
        ) : chosen ? <span className={styles.community}>{chosen.name}</span> : null}
      </div>
      <div className={styles.footer}>
        <div className={styles.details}>
          <span className={styles.count} aria-live="polite"><IconUsers />{chosen ? current ? <><strong>{current.count}</strong><span>/ {current.capacity}명</span></> : countError ? "인원 확인 불가" : "인원 확인 중…" : "소로우마다 우리만의 풍경"}</span>
          <small>{chosen ? full ? "지금은 가득 찼어요. 잠시 후 다시 와 주세요." : `${chosen.privateTest ? "초대된 두 사람만" : "멤버 전용"} · 최대 ${current?.capacity ?? chosen.spaceCapacity ?? 100}명` : "멤버가 되면 함께 쉴 곳이 열려요 · 최대 100명"}</small>
        </div>
        {full ? <span className={styles.full}>만석</span> : <Link href={chosen ? mapHref(mapId, chosen.id) : "/c"} className={styles.enter} aria-label={chosen ? `${chosen.name} ${map.name} 들어가기` : "소로우 찾기"}>{chosen ? "들어가기" : "소로우 찾기"}<IconChevronR /></Link>}
      </div>
    </section>
  );
}
