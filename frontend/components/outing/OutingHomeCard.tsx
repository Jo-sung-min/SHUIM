"use client";
import Link from "next/link";
import { OUTING_PLACES } from "@/lib/outing";
import OutingIcon from "./OutingIcon";
import styles from "./Outing.module.css";

export default function OutingHomeCard({ name = "모루" }: { name?: string }) {
  return <section className={styles.homeCard} aria-labelledby="home-outing-title">
    <Link href="/outing" className={styles.homeHero}>
      <img src="/outing/park.webp" alt="햇살이 비치는 연못과 나무 아래 빈 벤치" loading="lazy" width="1672" height="941" />
      <div><span className={styles.eyebrow}>A LITTLE OUTSIDE</span><h2 id="home-outing-title">우리, 잠깐 나갈까?</h2><p>{name}와 나란히, 마음이 쉬는 풍경으로.</p><span className={styles.homeCta}>함께 외출하기 <OutingIcon name="arrow" size={17} /></span></div>
    </Link>
    <div className={styles.homeDestinations}>
      {Object.values(OUTING_PLACES).map(p => <Link href={`/outing/space?place=${p.id}`} key={p.id}><OutingIcon name={p.id === "park" ? "tree" : p.id === "sea" ? "wave" : "mountain"} size={19} /><span>{p.id === "park" ? "공원" : p.id === "sea" ? "바다" : "산"}</span></Link>)}
      <Link href="/outing/meet"><OutingIcon name="people" size={19} /><span>사람들 만나기</span></Link>
    </div>
  </section>;
}
