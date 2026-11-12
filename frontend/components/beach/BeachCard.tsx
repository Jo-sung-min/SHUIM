"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { assetUrl } from "@/lib/assets";
import { fetchBeachCount, type BeachCount } from "@/lib/beach/net";
import { MAPS, mapHref, type MapId } from "@/lib/beach/maps";
import { rememberBeachReturn } from "@/lib/beach/return";
import { requestCommunityConsent, requireCommunityConsent } from "@/lib/consent";
import { showToast } from "@/lib/toast";
import type { Circle, PublicSpace } from "@/lib/circles";
import { IconChevronL, IconChevronR, IconLock, IconUsers } from "@/components/Icons";
import styles from "./BeachCard.module.css";

type BeachCircle = Pick<Circle, "id" | "name" | "slug" | "pinned" | "spaceCapacity" | "privateTest" | "spaceMaps"> & { primary?: boolean };

/**
 * 함께 쉴 풍경 고르기. 사진을 누르면 바로 그 방으로 들어간다.
 *  - publicSpace 가 있으면 공용 공간: 누구나 들어오고 모든 풍경이 열려 있다.
 *  - 없으면 소로우 공간: 둘러싼 화면이 고른 소로우의 멤버만 들어오고, 멤버가 늘수록 풍경이 하나씩 열린다.
 */
export default function BeachCard({ circles = [], publicSpace }: { circles?: BeachCircle[]; publicSpace?: PublicSpace }) {
  const router = useRouter();
  const [failedPhotos, setFailedPhotos] = useState<Partial<Record<MapId, boolean>>>({});
  const [occupancy, setOccupancy] = useState<Partial<Record<MapId, BeachCount>>>({});
  const chosen = publicSpace ? undefined : circles.find((circle) => circle.pinned) ?? circles.find((circle) => circle.primary) ?? circles[0];
  const communityId = publicSpace?.id ?? chosen?.id;
  // 소로우 공간에서 아직 닫힌 풍경. 서버가 목록을 주지 않으면(옛 서버) 모두 열린 것으로 본다.
  const lockOf = (mapId: MapId) => chosen?.spaceMaps?.find((map) => map.id === mapId && !map.open);
  const lockedMaps = (Object.keys(MAPS) as MapId[]).filter((mapId) => lockOf(mapId)).join(",");
  // 넓은 화면에선 옆 카드가 가려지므로 제목 옆 화살표로 한 장씩 넘긴다 (좁은 화면은 손가락으로 넘긴다).
  const rail = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: true });
  const syncEdge = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    syncEdge();
    const observer = new ResizeObserver(syncEdge);
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncEdge]);
  const slide = (direction: -1 | 1) => {
    const el = rail.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-place]");
    el.scrollBy({ left: direction * (card ? card.offsetWidth + 14 : el.clientWidth * .6), behavior: "smooth" });
  };

  useEffect(() => {
    setOccupancy({});
    if (!communityId) return;
    const closed = new Set(lockedMaps.split(","));
    let alive = true, generation = 0;
    const refresh = () => {
      if (document.hidden) return;
      const currentGeneration = ++generation;
      for (const mapId of Object.keys(MAPS) as MapId[]) {
        if (closed.has(mapId)) continue; // 닫힌 풍경은 방도 인원수도 없다
        fetchBeachCount(communityId, mapId).then((result) => {
          if (alive && currentGeneration === generation) setOccupancy((previous) => ({ ...previous, [mapId]: result }));
        }).catch(() => {
          if (alive && currentGeneration === generation) setOccupancy((previous) => {
            const next = { ...previous }; delete next[mapId]; return next;
          });
        });
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [communityId, lockedMaps]);

  // 공용 공간은 처음 보는 사람들과 만나는 곳이라, 소로우에 가입할 때처럼 함께 지킬 약속에 먼저 동의받는다.
  const entering = useRef(false);
  const enterShared = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button > 0) return; // 새 탭으로 열면 서버가 확인한다
    event.preventDefault();
    if (entering.current) return;
    entering.current = true;
    requestCommunityConsent().then(async (accepted) => {
      // 약속 시트를 닫은 것은 오류가 아니다: 잠깐 안내만 하고 사라진다.
      if (!accepted) { showToast("함께 지킬 약속에 동의하면 들어갈 수 있어요.", { kind: "info" }); return; }
      await requireCommunityConsent();
      rememberBeachReturn();
      router.push(href);
    }).catch((cause) => showToast(cause instanceof Error ? cause.message : "잠시 후 다시 시도해 주세요."))
      .finally(() => { entering.current = false; });
  };

  const nextLocked = chosen?.spaceMaps?.find((map) => !map.open && map.id in MAPS);
  const note = publicSpace ? "누구나 들어올 수 있어요. 우리끼리 쉬는 공간은 소로우 안에 있어요."
    : !chosen ? null
    : nextLocked ? `멤버만 들어와요. 멤버 ${nextLocked.members}명부터 ${MAPS[nextLocked.id as MapId].name}도 열려요.`
    : "우리 소로우 멤버만 들어오는 공간이에요.";

  return (
    <section className={styles.card} aria-label={publicSpace ? "공용 공간에서 함께 쉬기" : "소로우에서 함께 쉬기"}>
      <div className={styles.head}>
        <h2 className={styles.heading}>만나서 위로하기{(publicSpace || chosen) && <span className={styles.scope}>{publicSpace ? publicSpace.name : "우리 소로우"}</span>}</h2>
        <div className={styles.arrows}>
          <button type="button" className={styles.arrow} aria-label="이전 풍경 보기" disabled={edge.start} onClick={() => slide(-1)}><IconChevronL /></button>
          <button type="button" className={styles.arrow} aria-label="다음 풍경 보기" disabled={edge.end} onClick={() => slide(1)}><IconChevronR /></button>
        </div>
      </div>
      {note && <p className={styles.note}>{note}</p>}
      <div ref={rail} className={styles.mapChoices} role="group" aria-label="함께 쉴 풍경" onScroll={syncEdge}>
        {Object.values(MAPS).map((choice, index) => {
          const lock = lockOf(choice.id);
          const count = occupancy[choice.id];
          const current = count?.communityId === communityId && count?.mapId === choice.id ? count : undefined;
          const capacity = Math.min(20, current?.capacity ?? publicSpace?.capacity ?? chosen?.spaceCapacity ?? 20);
          const full = current !== undefined && current.count >= capacity;
          const content = <>
            {!failedPhotos[choice.id] && <img className={styles.photo} src={assetUrl(choice.id === "cloudspa" ? "/cloudspa/art/city-nw-card-v2.webp" : `/beach/places/${choice.id}-v1.webp`)}
              alt="" width={960} height={640} loading={index < 2 ? "eager" : "lazy"} decoding="async"
              onError={() => setFailedPhotos((previous) => ({ ...previous, [choice.id]: true }))} />}
            <span className={styles.photoShade} aria-hidden="true" />
            {lock ? <span className={styles.count} data-lock=""><IconLock />멤버 {lock.members}명부터</span>
              : <span className={styles.count} aria-live="polite" aria-label={current ? `${current.count}명, 정원 ${capacity}명${full ? ", 만석" : ""}` : `인원 확인 중, 정원 ${capacity}명`}>
                <IconUsers /><strong>{current ? current.count : "—"}</strong><span>/ {capacity}</span>{full && <b>만석</b>}
              </span>}
            <span className={styles.placeCopy}>
              <span className={styles.placeTitle}>{choice.name}</span>
              <span className={styles.placeCaption}>{failedPhotos[choice.id] ? "사진을 불러오지 못했어요" : choice.description}</span>
            </span>
          </>;
          if (lock) return <button key={choice.id} type="button" className={styles.placeCard} data-place={choice.id} data-locked=""
            disabled aria-label={`${choice.name}, 멤버 ${lock.members}명부터 열려요`}>{content}</button>;
          if (full) return <button key={choice.id} type="button" className={styles.placeCard} data-place={choice.id}
            disabled aria-label={`${choice.name}, 만석`}>{content}</button>;
          const href = communityId ? mapHref(choice.id, communityId) : "/c";
          return <Link key={choice.id} className={styles.placeCard} data-place={choice.id}
            prefetch={false} onClick={publicSpace ? (event) => enterShared(event, href) : rememberBeachReturn}
            href={href}
            aria-label={publicSpace ? `${publicSpace.name} ${choice.name} 들어가기` : chosen ? `${chosen.name} ${choice.name} 들어가기` : `${choice.name}, 소로우 찾기`}>{content}</Link>;
        })}
      </div>
    </section>
  );
}
