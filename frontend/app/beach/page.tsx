"use client";

import dynamic from "next/dynamic";
import styles from "@/components/beach/beach.module.css";

/**
 * 소로우 바닷가: 1인칭으로 모여 있는 공간. 3D 엔진(three.js)은 이 화면을 열 때만 내려받고 서버에서는 그리지 않는다
 * (앱인토스 미니앱 정적 번들에서도 그대로 돈다)
 */
const BeachScene = dynamic(() => import("@/components/beach/BeachScene"), {
  ssr: false,
  loading: () => (
    <div className={styles.root}>
      <div className={styles.center} role="status" aria-live="polite">
        <p className={styles.loadingDots}>바닷가로 가는 중</p>
        <small>파도 소리가 들리는 곳으로</small>
      </div>
    </div>
  ),
});

export default function BeachPage() {
  return <BeachScene />;
}
