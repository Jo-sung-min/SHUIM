import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "바이칼",
  description: "눈보라 치는 얼음 호수와 벽난로가 타는 통창 산장에서 쉬는 소로우만의 쉼터. 멤버 최대 20명이 함께 쉬어요.",
  alternates: { canonical: "/baikal" },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
