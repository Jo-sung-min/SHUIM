import type { Metadata } from "next";

/** 후원 기업 담당자가 꾸미기 링크로 여는 화면. 검색에 걸리지 않게 한다. */
export const metadata: Metadata = {
  title: "액자 꾸미기",
  description: "후원 기업 순위에 걸리는 액자를 골라요",
  alternates: { canonical: "/sponsors/studio" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
