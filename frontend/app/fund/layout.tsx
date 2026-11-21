import type { Metadata } from "next";

/** 불행 모금 화면 SEO 메타 (제목은 루트 템플릿으로 "불행 모금 · 소로우") */
export const metadata: Metadata = {
  title: "불행 모금",
  description: "하루 한 번 무료로 받은 별을 글쓴이에게 건네고, 서로 주고받은 응원을 확인하세요.",
  alternates: { canonical: "/fund" }, // 루트의 "/" 를 자기 경로로
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
