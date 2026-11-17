"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchBeachCount } from "@/lib/beach/net";
import { MAPS, PUBLIC_SPACE_ID, mapHref, type MapId } from "@/lib/beach/maps";
import { rememberBeachReturnTo } from "@/lib/beach/return";
import { chooseOutingMap } from "@/lib/outing";
import { requireCommunityConsent } from "@/lib/consent";
import OutingIcon from "./OutingIcon";
import styles from "./Outing.module.css";

export default function OutingMeet() {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState("비어 있는 풍경을 찾고 있어요.");
  const [failed, setFailed] = useState(false);
  const run = useRef(0);
  useEffect(() => {
    const ticket = ++run.current;
    let timeout: ReturnType<typeof setTimeout>;
    setFailed(false); setMessage("비어 있는 풍경을 찾고 있어요.");
    async function enter() {
      try {
        await requireCommunityConsent();
        if (run.current !== ticket) return;
        const counts = await Promise.race([
          Promise.allSettled((Object.keys(MAPS) as MapId[]).map(id => fetchBeachCount(PUBLIC_SPACE_ID, id))),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("모임 연결이 늦어지고 있어요. 다시 찾아볼까요?")), 12000); }),
        ]);
        clearTimeout(timeout);
        if (run.current !== ticket) return;
        const available = counts.flatMap(r => r.status === "fulfilled" ? [r.value] : []);
        const selected = chooseOutingMap(available);
        if (!selected) throw new Error(available.length ? "지금은 모든 맵이 가득 찼어요. 잠시 후 다시 찾아볼까요?" : "통합모임에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
        setMessage(`${MAPS[selected.mapId].name}${selected.count === 0 ? "에 빈자리가 있어요." : "의 여유 있는 자리로 가요."}`);
        // Return to the hub, not this automatic redirect page, when leaving a map.
        rememberBeachReturnTo("/outing");
        router.replace(mapHref(selected.mapId, PUBLIC_SPACE_ID));
      } catch (e) { if (run.current === ticket) { setFailed(true); setMessage(e instanceof Error ? e.message : "연결을 확인해 주세요."); } }
    }
    void enter();
    return () => { run.current++; clearTimeout(timeout); };
  }, [attempt, router]);
  return <main className={styles.meetPage}><div className={styles.meetGlow} /><Link href="/outing" className={styles.meetBack}><OutingIcon name="back" /> 외출로 돌아가기</Link><div className={styles.meetCenter}><div className={styles.meetOrb}><OutingIcon name="people" size={40} /></div><span className={styles.eyebrow}>SOROW, TOGETHER</span><h1>혼자가 아닌 풍경으로.</h1><p role={failed ? "alert" : "status"}>{message}</p><small>소로우 통합모임 · 비어 있는 맵 우선 입장</small>{failed ? <button className={styles.primaryButton} onClick={() => setAttempt(v => v + 1)}>다시 찾아보기</button> : <span className={styles.loader} aria-hidden="true" />}<Link href="/c/home">모임 먼저 둘러보기 <OutingIcon name="arrow" size={15} /></Link></div></main>;
}
