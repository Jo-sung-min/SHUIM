import { Suspense } from "react";
import { IS_AIT } from "@/lib/ait";
import { PLACEHOLDER_PARAM } from "@/lib/route-placeholder";

/** 미니앱 정적 번들에는 자리표시 페이지(/messages/_)만 만든다. 값은 쿼리(?id=)로 온다 (lib/routes.ts) */
export function generateStaticParams() {
  return IS_AIT ? [{ id: PLACEHOLDER_PARAM }] : [];
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
