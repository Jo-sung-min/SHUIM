import type { Metadata } from "next";

/** 바닷가 화면 메타 (제목은 루트 템플릿으로 "바닷가 · 소로우"). 들어가 있는 사람만 의미 있는 화면이라 검색에는 내지 않는다 */
export const metadata: Metadata = {
  title: "바닷가",
  description: "큰 절벽 아래 모닥불 곁에서 쉬는 소로우별 프라이빗 해변. 멤버 최대 20명이 함께해요.",
  alternates: { canonical: "/beach" },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
