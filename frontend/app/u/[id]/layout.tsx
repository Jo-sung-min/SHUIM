import type { Metadata } from "next";

/** 공개 프로필 SEO 메타. canonical 은 프로필마다 자기 주소 (루트의 "/" 를 덮어쓴다) */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return {
    title: "프로필",
    description: "소로우에서 나눈 위로글과 외침",
    alternates: { canonical: `/u/${encodeURIComponent(id)}` },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
