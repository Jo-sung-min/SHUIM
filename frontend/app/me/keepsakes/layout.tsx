import type { Metadata } from "next";

/** 보관함 화면 메타 (제목은 루트 템플릿으로 "보관함 · 소로우") */
export const metadata: Metadata = {
  title: "보관함",
  description: "맵에서 주운 감정구슬과 맵 앨범",
  alternates: { canonical: "/me/keepsakes" },
  robots: { index: false, follow: false }, // 로그인한 사람의 개인 화면
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
