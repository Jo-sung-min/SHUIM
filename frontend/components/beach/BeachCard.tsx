"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { type Daylight, currentHour, daylightAt } from "@/lib/beach/daylight";
import { CHAR_VIEW } from "@/lib/beach/atlas";
import { fetchBeachCount, type BeachCount } from "@/lib/beach/net";
import type { Circle } from "@/lib/circles";
import { IconChevronR, IconLock, IconUsers } from "@/components/Icons";
import styles from "./BeachCard.module.css";

type BeachCircle = Pick<Circle, "id" | "name" | "slug"> & { primary?: boolean };
const rgb = (c: readonly number[]) => `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;

/** 각 소로우의 멤버만 함께 쉬는 해변. 선택한 소로우의 인원만 표시한다. */
export default function BeachCard({ circles }: { circles: BeachCircle[] }) {
  const selectId = useId();
  const [chosenId, setChosenId] = useState("");
  const [d, setD] = useState<Daylight | null>(null);
  const [occupancy, setOccupancy] = useState<BeachCount | null>(null);
  const [countError, setCountError] = useState(false);
  const chosen = circles.find((c) => c.id === chosenId) ?? circles.find((c) => c.primary) ?? circles[0];
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
      fetchBeachCount(communityId).then((result) => {
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
  }, [communityId]);

  const day = d ?? daylightAt(12);
  const current = occupancy?.communityId === communityId ? occupancy : null;
  const full = current !== null && current.count >= current.capacity;

  return (
    <section className={styles.card} aria-label="소로우 바닷가">
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
          <span className={styles.eyebrow}><IconLock />우리만의 프라이빗 해변</span>
          <h2>소로우 바닷가</h2>
          <p>하얀 모래와 푸른 바다, 포근하게 쉬어가요.</p>
        </div>
        {circles.length > 1 ? (
          <div className={styles.selector}>
            <label htmlFor={selectId}>함께 쉴 소로우</label>
            <select id={selectId} value={chosen.id} onChange={(e) => setChosenId(e.target.value)}>
              {circles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        ) : chosen ? <span className={styles.community}>{chosen.name}</span> : null}
      </div>
      <div className={styles.footer}>
        <div className={styles.details}>
          <span className={styles.count}><IconUsers />{chosen ? current ? <><strong>{current.count}</strong><span>/ {current.capacity}명</span></> : countError ? "인원 확인 불가" : "인원 확인 중…" : "소로우마다 하나의 해변"}</span>
          <small>{chosen ? full ? "지금은 가득 찼어요. 잠시 후 다시 와 주세요." : "멤버 전용 · 최대 100명" : "멤버가 되면 우리만의 해변이 열려요 · 최대 100명"}</small>
        </div>
        {full ? <span className={styles.full}>만석</span> : <Link href={chosen ? `/beach?communityId=${encodeURIComponent(chosen.id)}` : "/c"} className={styles.enter} aria-label={chosen ? `${chosen.name} 바닷가 들어가기` : "소로우 찾기"}>{chosen ? "들어가기" : "소로우 찾기"}<IconChevronR /></Link>}
      </div>
    </section>
  );
}
