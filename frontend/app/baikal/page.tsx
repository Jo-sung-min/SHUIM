"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MAPS } from "@/lib/beach/maps";
import styles from "@/components/beach/beach.module.css";

const BeachScene = dynamic(() => import("@/components/beach/BeachScene"), {
  ssr: false,
  loading: () => <div className={styles.root} data-map="baikal">
    <div className={styles.center} role="status" aria-live="polite">
      <p className={styles.loadingDots}>{MAPS.baikal.loading}</p>
      <small>{MAPS.baikal.loadingDetail}</small>
    </div>
  </div>,
});

export default function BaikalPage() {
  return <Suspense><ScopedBaikal /></Suspense>;
}

function ScopedBaikal() {
  const search = useSearchParams();
  const communityId = search.get("communityId") ?? "";
  return <BeachScene key={communityId} communityId={communityId} mapId="baikal" />;
}
