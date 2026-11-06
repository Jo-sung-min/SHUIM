import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "대나무숲",
  description: "댓잎 사이로 난 둘레길을 걷고 정자에 앉아 쉬는 소로우만의 대나무숲. 멤버 최대 20명이 함께 쉬어요.",
  alternates: { canonical: "/bamboo" },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
