import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "우유니",
  description: "하늘과 별빛이 발끝에 비치는 소로우만의 우유니. 멤버 최대 20명이 함께 쉬어요.",
  alternates: { canonical: "/uyuni" },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
