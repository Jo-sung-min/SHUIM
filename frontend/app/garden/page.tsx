"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MAPS } from "@/lib/beach/maps";
import styles from "@/components/beach/beach.module.css";

/** 봄물 정원: 같은 3D 엔진을 지도만 바꿔 연다. 앱인토스 정적 번들에서도 서버 렌더 없이 동작한다. */
const BeachScene = dynamic(() => import("@/components/beach/BeachScene"), {
  ssr: false,
  loading: () => (
    <div className={styles.root} data-map="garden">
      <div className={styles.center} role="status" aria-live="polite">
        <p className={styles.loadingDots}>{MAPS.garden.loading}</p>
        <small>{MAPS.garden.loadingDetail}</small>
      </div>
    </div>
  ),
});

export default function GardenPage() {
  return <Suspense><ScopedGarden /></Suspense>;
}

function ScopedGarden() {
  const search = useSearchParams();
  const communityId = search.get("communityId") ?? "";
  return <BeachScene key={communityId} communityId={communityId} mapId="garden" />;
}
