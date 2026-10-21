import type { Metadata } from "next";

/** 불행 랭킹 화면 SEO 메타 (제목은 루트 템플릿으로 "불행 랭킹 · 소로우") */
export const metadata: Metadata = {
  title: "불행 랭킹",
  description: "이번 주 가장 많은 힘내요를 받은 외침",
  alternates: { canonical: "/ranking" }, // 루트의 "/" 를 자기 경로로
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
