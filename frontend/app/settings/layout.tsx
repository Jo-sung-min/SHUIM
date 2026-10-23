import type { Metadata } from "next";

/** 설정 화면 SEO 메타 (제목은 루트 템플릿으로 "설정 · 소로우") */
export const metadata: Metadata = {
  title: "설정",
  description: "계정, 화면 모드, 편의 기능",
  alternates: { canonical: "/settings" }, // 루트의 "/" 를 자기 경로로
  robots: { index: false, follow: false }, // 개인 화면
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
