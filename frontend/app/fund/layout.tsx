import type { Metadata } from "next";

/** 불행 모금 화면 SEO 메타 (제목은 루트 템플릿으로 "불행 모금 · 소로우") */
export const metadata: Metadata = {
  title: "불행 모금",
  description: "힘내요를 많이 받은 사람에게 모금을 나누는 프로토타입",
  alternates: { canonical: "/fund" }, // 루트의 "/" 를 자기 경로로
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
