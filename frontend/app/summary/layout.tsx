import type { Metadata } from "next";

/** 흐름 정리 화면 SEO 메타 (제목은 루트 템플릿으로 "흐름 정리 · 소로우") */
export const metadata: Metadata = {
  title: "흐름 정리",
  description: "기록의 흐름을 정리해요",
  alternates: { canonical: "/summary" }, // 루트의 "/" 를 자기 경로로
  robots: { index: false, follow: false }, // 로그인한 사람의 개인 화면
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
