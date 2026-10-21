import type { NextConfig } from "next";

/**
 * /api/* 는 Spring 백엔드로 프록시한다. 같은 출처로 보이므로 세션 쿠키(shuim_session)가 그대로 오간다.
 * 운영(Vercel 등)에서는 BACKEND_ORIGIN 환경변수에 백엔드 주소를 넣는다.
 */
const backendOrigin = (process.env.BACKEND_ORIGIN ?? "http://localhost:8080").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] }];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendOrigin}/api/:path*` }];
  },
};

export default nextConfig;
