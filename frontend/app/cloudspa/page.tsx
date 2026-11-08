"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MAPS } from "@/lib/beach/maps";
import styles from "@/components/beach/beach.module.css";

const BeachScene = dynamic(() => import("@/components/beach/BeachScene"), {
  ssr: false,
  loading: () => <div className={styles.root} data-map="cloudspa">
    <div className={styles.center} role="status" aria-live="polite">
      <p className={styles.loadingDots}>{MAPS.cloudspa.loading}</p>
      <small>{MAPS.cloudspa.loadingDetail}</small>
    </div>
  </div>,
});

export default function CloudSpaPage() {
  return <Suspense><ScopedCloudSpa /></Suspense>;
}

function ScopedCloudSpa() {
  const search = useSearchParams();
  const communityId = search.get("communityId") ?? "";
  return <BeachScene key={communityId} communityId={communityId} mapId="cloudspa" />;
}
