import type { Metadata } from "next";

/** 위로 화면 SEO 메타 (제목은 루트 템플릿으로 "위로 · 소로우") */
export const metadata: Metadata = {
  title: "위로",
  description: "사진과 글로 서로를 위로하는 세로 스냅 피드",
  alternates: { canonical: "/feed" }, // 루트의 "/" 를 자기 경로로
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
