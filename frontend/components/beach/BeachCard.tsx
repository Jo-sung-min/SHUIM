"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { assetUrl } from "@/lib/assets";
import { fetchBeachCount, type BeachCount } from "@/lib/beach/net";
import { MAPS, mapHref, type MapId } from "@/lib/beach/maps";
import type { Circle } from "@/lib/circles";
import { IconUsers } from "@/components/Icons";
import styles from "./BeachCard.module.css";

type BeachCircle = Pick<Circle, "id" | "name" | "slug" | "pinned" | "spaceCapacity" | "privateTest"> & { primary?: boolean };

/** The surrounding page chooses the community; every photo goes directly to its room. */
export default function BeachCard({ circles }: { circles: BeachCircle[] }) {
  const [failedPhotos, setFailedPhotos] = useState<Partial<Record<MapId, boolean>>>({});
  const [occupancy, setOccupancy] = useState<Partial<Record<MapId, BeachCount>>>({});
  const chosen = circles.find((circle) => circle.pinned) ?? circles.find((circle) => circle.primary) ?? circles[0];
  const communityId = chosen?.id;

  useEffect(() => {
    setOccupancy({});
    if (!communityId) return;
    let alive = true, generation = 0;
    const refresh = () => {
      if (document.hidden) return;
      const currentGeneration = ++generation;
      for (const mapId of Object.keys(MAPS) as MapId[]) {
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
  }, [communityId]);

  return (
    <section className={styles.card} aria-label="소로우에서 함께 쉬기">
      <h2 className={styles.heading}>만나서 위로하기</h2>
      <div className={styles.mapChoices} role="group" aria-label="함께 쉴 풍경">
        {Object.values(MAPS).map((choice, index) => {
          const count = occupancy[choice.id];
          const current = count?.communityId === communityId && count?.mapId === choice.id ? count : undefined;
          const capacity = Math.min(20, current?.capacity ?? chosen?.spaceCapacity ?? 20);
          const full = current !== undefined && current.count >= capacity;
          const content = <>
            {!failedPhotos[choice.id] && <img className={styles.photo} src={assetUrl(`/beach/places/${choice.id}-v1.webp`)}
              alt="" width={960} height={640} loading={index < 2 ? "eager" : "lazy"} decoding="async"
              onError={() => setFailedPhotos((previous) => ({ ...previous, [choice.id]: true }))} />}
            <span className={styles.photoShade} aria-hidden="true" />
            <span className={styles.count} aria-live="polite" aria-label={current ? `${current.count}명, 정원 ${capacity}명${full ? ", 만석" : ""}` : `인원 확인 중, 정원 ${capacity}명`}>
              <IconUsers /><strong>{current ? current.count : "—"}</strong><span>/ {capacity}</span>{full && <b>만석</b>}
            </span>
            <span className={styles.placeCopy}>
              <span className={styles.placeTitle}>{choice.name}</span>
              <span className={styles.placeCaption}>{failedPhotos[choice.id] ? "사진을 불러오지 못했어요" : choice.description}</span>
            </span>
          </>;
          return full ? <button key={choice.id} type="button" className={styles.placeCard} data-place={choice.id}
            disabled aria-label={`${choice.name}, 만석`}>{content}</button>
            : <Link key={choice.id} className={styles.placeCard} data-place={choice.id}
              prefetch={false}
              href={chosen ? mapHref(choice.id, chosen.id) : "/c"}
              aria-label={chosen ? `${chosen.name} ${choice.name} 들어가기` : `${choice.name}, 소로우 찾기`}>{content}</Link>;
        })}
      </div>
    </section>
  );
}
