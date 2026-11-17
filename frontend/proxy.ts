import { NextResponse, type NextRequest } from "next/server";

/**
 * /api/* 를 백엔드로 넘기기 전에 "프런트를 거쳐 온 요청"이라는 표시를 붙인다.
 * ORIGIN_SHARED_SECRET 이 있으면 X-Sorow-Origin-Secret 헤더로 실어 보내고 (next.config 의 rewrite 가 그대로 전달한다),
 * 브라우저가 직접 보낸 같은 이름의 헤더는 언제나 지운다. 값이 없으면 요청을 건드리지 않는다.
 * 앱인토스 정적 번들(npm run build:ait)에는 서버가 없으므로 빌드 동안 이 파일을 치워 둔다 (scripts/build-ait.mjs).
 */
const HEADER = "x-sorow-origin-secret";

export function proxy(request: NextRequest) {
  const secret = process.env.ORIGIN_SHARED_SECRET?.trim();
  if (!secret && !request.headers.has(HEADER)) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.delete(HEADER);
  if (secret) headers.set(HEADER, secret);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
