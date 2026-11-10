import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "치비 캐릭터 뷰어",
  description: "Three.js 코드만으로 빚은 2등신 캐릭터를 360도로 돌려 보는 실험실.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
