"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type Daylight, currentHour, daylightAt } from "@/lib/beach/daylight";
import { fetchBeachCount } from "@/lib/beach/net";
import { IconChevronR, IconUsers } from "@/components/Icons";
import styles from "./BeachCard.module.css";

const rgb = (c: readonly number[]) => `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;

/** 내 소로우 화면의 바닷가 입구. 지금 시각의 하늘색과 몇 명이 있는지를 보여 준다 */
export default function BeachCard() {
  const [d, setD] = useState<Daylight | null>(null);
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    setD(daylightAt(currentHour()));
    let alive = true;
    fetchBeachCount().then((n) => alive && setCount(n));
    const t = window.setInterval(() => setD(daylightAt(currentHour())), 60_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  const day = d ?? daylightAt(12);
  const night = day.sun[1] < 0;
  const background = `linear-gradient(180deg, ${rgb(day.skyTop)} 0%, ${rgb(day.skyHorizon)} 58%, ${rgb(day.seaDeep)} 59%, ${rgb(day.seaShallow)} 100%)`;
  return (
    <Link href="/beach" className={styles.card} style={{ background }} aria-label={`소로우 바닷가, 지금 ${count ?? 0}명`}>
      <span className={`${styles.sun} ${night ? styles.moon : ""}`} aria-hidden="true" />
      <span className={styles.sand} aria-hidden="true" />
      <span className={styles.people} aria-hidden="true">
        {[0, 2, 5].map((skin, i) => (
          <span key={skin} className={styles.person} style={{ backgroundPosition: `${-(i === 1 ? 6 : 0) * 32}px ${-skin * 48}px` }} />
        ))}
      </span>
      <span className={styles.text}>
        <strong>소로우 바닷가</strong>
        <small>{d ? `${day.label}의 바닷가에` : "바닷가에"} 나란히 모여 말 대신 위로를 건네요</small>
      </span>
      <span className={styles.count}><IconUsers />{count === null ? "…" : `${count}명`}<IconChevronR aria-hidden="true" /></span>
    </Link>
  );
}
