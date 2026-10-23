"use client";

/**
 * 첫 페인트 전에 실행할 인라인 스크립트 (화면 모드, 시작 화면).
 * 서버 HTML 에서는 text/javascript 로 실행되고, 클라이언트에서 다시 그려질 때(개발 모드 복구·재렌더)는
 * text/plain 이라 다시 실행되지 않고 React 의 "script 태그" 경고도 나지 않는다.
 * (node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md 의 방식)
 */
export default function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
