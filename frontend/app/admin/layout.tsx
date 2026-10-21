import type { Metadata } from "next";

/** 관리자 화면 SEO 메타 (제목은 루트 템플릿으로 "관리자 · 소로우") */
export const metadata: Metadata = {
  title: "관리자",
  description: "신고 검토와 사이트 설정",
  alternates: { canonical: "/admin" }, // 루트의 "/" 를 자기 경로로
  robots: { index: false, follow: false }, // 로그인한 사람의 개인 화면
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
