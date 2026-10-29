import type { Metadata } from "next";
import { Suspense } from "react";
import { IS_AIT } from "@/lib/ait";
import { PLACEHOLDER_PARAM } from "@/lib/route-placeholder";

/** 외침 글 하나. 익명 고민 글이라 검색에는 올리지 않는다 (목록 /shout 만 색인) */
export const metadata: Metadata = {
  // 상위 /shout 레이아웃이 제목을 정해 루트 템플릿이 여기까지 내려오지 않아 전체 제목을 직접 쓴다
  title: { absolute: "외침 · 소로우" },
  description: "익명으로 털어놓은 마음과 위로 댓글",
  robots: { index: false, follow: true },
};

/** 미니앱 정적 번들에는 자리표시 페이지(/shout/_)만 만든다. 값은 쿼리(?id=)로 온다 (lib/routes.ts) */
export function generateStaticParams() {
  return IS_AIT ? [{ id: PLACEHOLDER_PARAM }] : [];
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
