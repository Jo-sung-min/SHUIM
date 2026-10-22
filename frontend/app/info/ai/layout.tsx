import type { Metadata } from "next";
export const metadata: Metadata = { title: "AI 이용 안내", robots: { index: false, follow: false } };
export default function AiPreferencesLayout({ children }: { children: React.ReactNode }) { return children; }
