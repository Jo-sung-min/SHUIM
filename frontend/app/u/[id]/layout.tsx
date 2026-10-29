import type { Metadata } from "next";
import { Suspense } from "react";
import { IS_AIT } from "@/lib/ait";
import { PLACEHOLDER_PARAM } from "@/lib/route-placeholder";

/** 공개 프로필 SEO 메타. canonical 은 프로필마다 자기 주소 (루트의 "/" 를 덮어쓴다) */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return {
    title: "프로필",
    description: "소로우에서 나눈 위로글과 외침",
    alternates: { canonical: `/u/${encodeURIComponent(id)}` },
  };
}

/** 미니앱 정적 번들에는 자리표시 페이지(/u/_)만 만든다. 값은 쿼리(?id=)로 온다 (lib/routes.ts) */
export function generateStaticParams() {
  return IS_AIT ? [{ id: PLACEHOLDER_PARAM }] : [];
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
