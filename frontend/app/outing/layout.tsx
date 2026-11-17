import type { Metadata } from "next";
export const metadata: Metadata = { title: "우리의 바깥 · 소로우", description: "모루와 함께 공원, 바다, 산으로 떠나는 작은 외출. 하루 한 번, 100일에 걸쳐 가까워지는 우리." };
export default function OutingLayout({ children }: { children: React.ReactNode }) { return children; }
