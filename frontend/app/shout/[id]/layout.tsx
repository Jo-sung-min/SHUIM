import type { Metadata } from "next";

/** 외침 글 하나. 익명 고민 글이라 검색에는 올리지 않는다 (목록 /shout 만 색인) */
export const metadata: Metadata = {
  // 상위 /shout 레이아웃이 제목을 정해 루트 템플릿이 여기까지 내려오지 않아 전체 제목을 직접 쓴다
  title: { absolute: "외침 · 소로우" },
  description: "익명으로 털어놓은 마음과 위로 댓글",
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
