import type { Metadata } from "next";

/** 새 외침 쓰기 (홈 오른쪽 위 + 버튼, 외침 목록의 쓰기 버튼) */
export const metadata: Metadata = {
  title: "새 외침",
  description: "사진과 함께 마음을 털어놓아요",
  alternates: { canonical: "/write" },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
