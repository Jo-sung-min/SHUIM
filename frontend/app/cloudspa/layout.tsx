import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "구름미그린 온천",
  description: "다섯 개의 구름 온천과 포근한 먹구름 리조트에서 도시의 야경을 바라보는 소로우만의 쉼터. 멤버 최대 20명이 함께 쉬어요.",
  alternates: { canonical: "/cloudspa" },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
