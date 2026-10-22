import type { Metadata } from "next";

/** 불행 모금 화면 SEO 메타 (제목은 루트 템플릿으로 "불행 모금 · 소로우") */
export const metadata: Metadata = {
  title: "불행 모금",
  description: "서로에게 마음을 보태는 소로우 모금 체험. 실제 결제는 이루어지지 않습니다.",
  alternates: { canonical: "/fund" }, // 루트의 "/" 를 자기 경로로
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
