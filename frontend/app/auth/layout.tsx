import type { Metadata } from "next";

/** 계정 화면 SEO 메타 (제목은 루트 템플릿으로 "계정 · 소로우") */
export const metadata: Metadata = {
  title: "계정",
  description: "이메일 또는 카카오로 소로우를 시작해요",
  alternates: { canonical: "/auth" }, // 루트의 "/" 를 자기 경로로
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
