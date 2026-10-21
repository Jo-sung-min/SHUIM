import type { Metadata } from "next";

/** 기록 화면 SEO 메타 (제목은 루트 템플릿으로 "기록 · 소로우") */
export const metadata: Metadata = {
  title: "기록",
  description: "어제보다 얼마나 움직였는지 기록해요",
  alternates: { canonical: "/log" }, // 루트의 "/" 를 자기 경로로
  robots: { index: false, follow: false }, // 로그인한 사람의 개인 화면
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
