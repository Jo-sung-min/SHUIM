"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MAPS } from "@/lib/beach/maps";
import styles from "@/components/beach/beach.module.css";

/** 대나무숲 둘레길: 같은 3D 엔진을 지도만 바꿔 연다. 앱인토스 정적 번들에서도 서버 렌더 없이 동작한다. */
const BeachScene = dynamic(() => import("@/components/beach/BeachScene"), {
  ssr: false,
  loading: () => (
    <div className={styles.root} data-map="bamboo">
      <div className={styles.center} role="status" aria-live="polite">
        <p className={styles.loadingDots}>{MAPS.bamboo.loading}</p>
        <small>{MAPS.bamboo.loadingDetail}</small>
      </div>
    </div>
  ),
});

export default function BambooPage() {
  return <Suspense><ScopedBamboo /></Suspense>;
}

function ScopedBamboo() {
  const search = useSearchParams();
  const communityId = search.get("communityId") ?? "";
  return <BeachScene key={communityId} communityId={communityId} mapId="bamboo" />;
}
