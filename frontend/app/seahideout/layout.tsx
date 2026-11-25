import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "바다아지트",
  description: "절벽 잔교 끝에서 만나는 작은 은신처. 창가에 앉아 바다를 바라봐요.",
  alternates: { canonical: "/seahideout" },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
