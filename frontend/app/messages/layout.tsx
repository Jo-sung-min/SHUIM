import type { Metadata } from "next";

/** 메시지 화면 SEO 메타 (제목은 루트 템플릿으로 "메시지 · 소로우") */
export const metadata: Metadata = {
  title: "메시지",
  description: "1:1 대화",
  alternates: { canonical: "/messages" }, // 루트의 "/" 를 자기 경로로
  robots: { index: false, follow: false }, // 로그인한 사람의 개인 화면
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
