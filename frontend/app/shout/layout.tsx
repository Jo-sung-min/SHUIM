import type { Metadata } from "next";

/** 외침 화면 SEO 메타 (제목은 루트 템플릿으로 "외침 · 소로우") */
export const metadata: Metadata = {
  title: "외침",
  description: "익명으로 슬픔을 털어놓고 위로 댓글과 힘내요를 받는 공간",
  alternates: { canonical: "/shout" }, // 루트의 "/" 를 자기 경로로
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
