"use client";
import { useState } from "react";
import Link from "next/link";
import MoruCompanion from "@/components/MoruCompanion";
import { OUTING_ACTIVITIES, OUTING_MILESTONES, OUTING_PLACES } from "@/lib/outing";
import { useOuting } from "@/lib/use-outing";
import OutingIcon from "./OutingIcon";
import styles from "./Outing.module.css";

export default function OutingHub() {
  const { view, companion, status, error, refresh } = useOuting();
  const [tab, setTab] = useState<"places" | "journey" | "memories">("places");
  const milestone = OUTING_MILESTONES[Math.min(view.level - 1, OUTING_MILESTONES.length - 1)];
  const next = OUTING_MILESTONES.find(m => m.day > view.days);
  return <main className={styles.hub}>
    <header className={styles.hubNav}><Link href="/" aria-label="메인화면으로"><OutingIcon name="back" /></Link><span>함께하는 외출</span><span className={styles.navMark}>SOROW</span></header>
    <section className={styles.intro}>
      <span className={styles.eyebrow}>LITTLE DAYS, TOGETHER</span>
      <h1>멀리 가지 않아도,<br /><em>우리의 바깥.</em></h1>
      <p>오늘은 {companion.name}와 어디에 머물러 볼까요?<br />잠깐의 외출이, 오래 기억할 하루가 될 거예요.</p>
      <div className={styles.introCompanion}><MoruCompanion appearance={companion.appearance} mood="happy" /></div>
    </section>
    <section className={styles.bond} aria-label="외출 호감도와 레벨" aria-busy={status === "loading"}>
      <div className={styles.bondTop}><span><OutingIcon name="heart" size={17} /> {milestone.name}</span><b>Lv.{view.level} <small>외출 레벨</small></b></div>
      <div className={styles.bondNumbers}><strong>{view.days}<small> / 100일</small></strong><span>호감도 <b>{view.affinity.toLocaleString()}</b> / 1,000</span></div>
      <div className={styles.progress} role="progressbar" aria-label="함께한 100일" aria-valuenow={view.days} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${view.days}%` }} /></div>
      <div className={styles.bondFoot}><span>{view.days === 100 ? "백 번의 외출, 이제 오래된 친구예요." : view.rewardedToday ? "오늘의 마음은 차곡차곡 쌓였어요." : "오늘 첫 활동 · 호감도 +10, 경험치 +20"}</span><button onClick={() => setTab("journey")}>{next ? `${next.day}일에 다음 선물` : "우리의 여정"}<OutingIcon name="arrow" size={14} /></button></div>
    </section>
    {status === "guest" && <div className={styles.notice}><span>풍경은 자유롭게 둘러보세요. 함께한 날은 로그인하면 저장돼요.</span><Link href="/auth">로그인 <OutingIcon name="arrow" size={14} /></Link></div>}
    {error && <div className={styles.notice} role="alert"><span>{error}</span><button onClick={() => void refresh()}>다시 연결</button></div>}
    <nav className={styles.tabs} aria-label="외출 메뉴">{([['places', '오늘의 외출'], ['journey', '100일의 여정'], ['memories', '우리의 추억']] as const).map(([id, label]) => <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}>{label}{id === "memories" && view.memories.length > 0 && <small>{view.memories.length}</small>}</button>)}</nav>
    {tab === "places" && <>
      <div className={styles.placeGrid}>{Object.values(OUTING_PLACES).map((place, index) => <Link href={`/outing/space?place=${place.id}`} className={styles.placeCard} key={place.id}>
        <div className={styles.placeImage}><img src={place.image} alt={place.mood} width="1672" height="941" loading={index === 0 ? "eager" : "lazy"} /><span className={styles.placeBadge}>{String(index + 1).padStart(2, "0")} <span>{place.english}</span></span><span className={styles.placeArrow}><OutingIcon name="arrow" /></span></div>
        <div className={styles.placeInfo}><span className={styles.placeMood}>{place.mood}</span><h2>{place.name}</h2><p>{place.description}</p><span className={styles.placeActivities}>{OUTING_ACTIVITIES.filter(a => a.place === place.id && view.unlocked.includes(a.id)).length}개의 작은 즐거움 <span>· 함께 가기</span></span></div>
      </Link>)}</div>
      <Link href="/outing/meet" className={styles.meetCard}><div className={styles.meetOrb}><OutingIcon name="people" size={28} /></div><div><span className={styles.eyebrow}>HELLO, SOMEONE</span><h2>사람들 만나러 가기</h2><p>소로우 통합모임에서, 새로운 안녕.</p><small>비어 있는 맵부터 찾아 바로 연결해요.</small></div><OutingIcon name="arrow" /></Link>
      <p className={styles.quietNote}>매일 한 번이면 충분해요. 쉬어 간 날에도, 우리 사이가 멀어지진 않아요.</p>
    </>}
    {tab === "journey" && <section className={styles.journey} aria-label="콘텐츠 해금 일정"><div className={styles.sectionIntro}><h2>가까워질수록, 더 많은 순간.</h2><p>호감도와 외출 레벨이 함께 자라요.<br />연속 출석이 아닌, 함께 외출한 날을 세어요.</p></div>{OUTING_MILESTONES.map(m => <div className={styles.milestone} data-open={view.days >= m.day} key={m.day}><span className={styles.milestoneDot}><OutingIcon name={view.days >= m.day ? "check" : "lock"} size={16} /></span><div><small>{m.day === 0 ? "첫날부터" : `함께한 ${m.day}일`} · Lv.{m.level}</small><h3>{m.name}</h3><p>{m.gift}</p><span>호감도 {m.day * 10} · 경험치 {m.day * 20}</span></div></div>)}<p className={styles.quietNote}>하루 첫 활동에만 호감도 10, 경험치 20.<br />다른 활동은 얼마든지 즐겨요. 100일 뒤에도 추억은 계속 남아요.</p></section>}
    {tab === "memories" && <section className={styles.memorySection}><div className={styles.sectionIntro}><h2>작은 순간이 모여, 우리.</h2><p>최근 30개의 추억이에요. 편지는 나에게만 보여요.</p></div>{view.memories.length ? <div className={styles.memories}>{view.memories.map(m => { const a = OUTING_ACTIVITIES.find(a => a.id === m.actionId); if (!a) return null; return <article className={styles.memory} key={`${m.day}:${m.actionId}`}><span className={styles.memoryIcon}><OutingIcon name={a.icon} size={22} /></span><div><small>{m.day.replaceAll("-", ".")} · {OUTING_PLACES[a.place].short}</small><h3>{a.keepsake}</h3>{m.note && <p>{m.note}</p>}</div></article>; })}</div> : <div className={styles.emptyMemory}><OutingIcon name="book" size={35} /><h3>아직 비어 있는 첫 장.</h3><p>오늘의 풍경을 하나 골라 볼까요?</p><button onClick={() => setTab("places")}>첫 외출 고르기 <OutingIcon name="arrow" size={17} /></button></div>}</section>}
  </main>;
}
