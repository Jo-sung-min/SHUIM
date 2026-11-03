import type { Metadata } from "next";

/** 바닷가 화면 메타 (제목은 루트 템플릿으로 "바닷가 · 소로우"). 들어가 있는 사람만 의미 있는 화면이라 검색에는 내지 않는다 */
export const metadata: Metadata = {
  title: "바닷가",
  description: "1인칭으로 바닷가에 나란히 모여 말 대신 위로와 포옹을 건네는 곳",
  alternates: { canonical: "/beach" },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
