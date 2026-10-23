import type { Metadata } from "next";

/** 흐름 보기 화면 SEO 메타 (제목은 루트 템플릿으로 "흐름 · 소로우") */
export const metadata: Metadata = {
  title: "흐름",
  description: "최근 7·14·30일의 마음 흐름",
  alternates: { canonical: "/flow" }, // 루트의 "/" 를 자기 경로로
  robots: { index: false, follow: false }, // 로그인한 사람의 개인 화면
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
