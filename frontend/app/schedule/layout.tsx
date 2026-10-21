import type { Metadata } from "next";

/** 일정 화면 SEO 메타 (제목은 루트 템플릿으로 "일정 · 소로우") */
export const metadata: Metadata = {
  title: "일정",
  description: "다가오는 일정",
  alternates: { canonical: "/schedule" }, // 루트의 "/" 를 자기 경로로
  robots: { index: false, follow: false }, // 로그인한 사람의 개인 화면
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
