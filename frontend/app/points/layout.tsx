import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "온기 포인트",
  description: "마음을 나누며 모은 온기 포인트와 적립 내역",
  alternates: { canonical: "/points" },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) { return children; }
