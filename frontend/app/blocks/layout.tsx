import type { Metadata } from "next";
export const metadata: Metadata = { title: "차단한 사용자", robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
