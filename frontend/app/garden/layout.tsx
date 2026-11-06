import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "봄물 정원",
  description: "버드나무 호수를 걷고 통창 아래 앉아 비 내리는 물을 바라보는 소로우만의 봄물 정원. 멤버 최대 100명이 함께 쉬어요.",
  alternates: { canonical: "/garden" },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
