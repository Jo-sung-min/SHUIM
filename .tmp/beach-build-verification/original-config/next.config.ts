import type { NextConfig } from "next";

/**
 * /api/* 는 Spring 백엔드로 프록시한다. 같은 출처로 보이므로 세션 쿠키(shuim_session)가 그대로 오간다.
 * 운영(Vercel 등)에서는 BACKEND_ORIGIN 환경변수에 백엔드 주소를 넣는다.
 *
 * 앱인토스 미니앱 빌드(NEXT_PUBLIC_AIT=1, npm run build:ait)는 서버 없이 정적 파일만 낸다 (SSR 금지):
 * 경로마다 index.html, 이미지 최적화 끔, 프록시·헤더 없음 (API 는 lib/ait-fetch.ts 가 백엔드로 바로 보낸다).
 * 결과는 out-ait/ 에 나오고, 그 폴더를 ait build 가 그대로 .ait 로 묶는다.
 */
const backendOrigin = (process.env.BACKEND_ORIGIN ?? "http://localhost:8080").replace(/\/+$/, "");
const ait = process.env.NEXT_PUBLIC_AIT === "1";

const nextConfig: NextConfig = ait
  ? {
      reactStrictMode: true,
      output: "export",
      distDir: "out-ait", // export 모드에서는 정적 결과가 나오는 폴더 (빌드 중간물은 .next, 개발 서버 상태 .next/dev 와 따로)
      trailingSlash: true,
      images: { unoptimized: true },
      // 웹 개발 서버가 .next/dev 에 만든 타입(옮겨 둔 서버 라우트를 가리킨다)을 읽지 않게 따로 둔다
      typescript: { tsconfigPath: "tsconfig.ait.json" },
    }
  : {
      reactStrictMode: true,
      async headers() {
        return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] }];
      },
      async rewrites() {
        return [{ source: "/api/:path*", destination: `${backendOrigin}/api/:path*` }];
      },
    };

export default nextConfig;
