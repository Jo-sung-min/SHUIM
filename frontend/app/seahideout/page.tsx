"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MAPS } from "@/lib/beach/maps";
import styles from "@/components/beach/beach.module.css";

const BeachScene = dynamic(() => import("@/components/beach/BeachScene"), {
  ssr: false,
  loading: () => <div className={styles.root} data-map="seahideout">
    <div className={styles.center} role="status" aria-live="polite">
      <p className={styles.loadingDots}>{MAPS.seahideout.loading}</p>
      <small>{MAPS.seahideout.loadingDetail}</small>
    </div>
  </div>,
});

export default function SeaHideoutPage() {
  return <Suspense><ScopedSeaHideout /></Suspense>;
}

function ScopedSeaHideout() {
  const search = useSearchParams();
  const communityId = search.get("communityId") ?? "";
  return <BeachScene key={communityId} communityId={communityId} mapId="seahideout" />;
}
