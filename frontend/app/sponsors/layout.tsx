import type { Metadata } from "next";

/** 후원 기업 순위 (공개). 제목은 루트 템플릿으로 "후원 기업 · 소로우" */
export const metadata: Metadata = {
  title: "후원 기업",
  description: "소로우 사람들에게 폭죽을 전하는 후원 기업",
  alternates: { canonical: "/sponsors" },
  robots: { index: true, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
