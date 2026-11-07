"use client";

import Link from "next/link";
import { Circle, kindLabel } from "@/lib/circles";
import { IconCheck, IconChevronR } from "./Icons";
import styles from "@/app/c/circle.module.css";
import { route } from "@/lib/routes";
import { CircleMark } from "./CircleMark";

export { circleInitial } from "./CircleMark";

/** 인증 소로우 표시 (학교·회사 메일로 연 사람이 인증을 마친 곳) */
export function Verified() {
  return <span className={styles.verified} title="소속 인증 소로우" aria-label="소속 인증 소로우"><IconCheck aria-hidden="true" /></span>;
}

/** 예시 데이터 소로우 표시 */
export function SampleTag() {
  return <span className={styles.pill} title="예시로 넣어 둔 소로우예요">샘플</span>;
}

/** 둘러보기·따뜻한 소로우 목록 한 줄. rank 가 있으면 순위만 보여 준다 (횟수는 보여 주지 않는다) */
export function CircleRow({ c, rank }: { c: Circle; rank?: number }) {
  return (
    <Link href={route(`/c/${c.slug}`)} className={styles.circleRow}>
      {rank ? <span className={styles.mark} data-rank="" aria-hidden="true">{rank}</span> : <CircleMark c={c} />}
      <span className={styles.circleMain}>
        <b>{c.name}{c.pinned && <span className={styles.pill}>고정</span>}{c.privateTest && <span className={styles.pill}>비공개</span>}{c.verified && <Verified />}{c.sample && <SampleTag />}</b>
        <p>{kindLabel(c.kind)} · 멤버 {c.memberCount}명{c.postCount ? ` · 사연 ${c.postCount}개` : ""}{c.intro ? ` · ${c.intro}` : ""}</p>
      </span>
      <IconChevronR aria-hidden="true" />
    </Link>
  );
}
