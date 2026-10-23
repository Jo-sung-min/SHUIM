"use client";

import { useRouter } from "next/navigation";
import { TopBar } from "@/components/ui";
import FlowView from "@/components/FlowView";

/** 흐름 보기: 홈 "나를 위한 시간 › 흐름 보기" 타일에서 들어온다. 본문은 components/FlowView */
export default function FlowPage() {
  const router = useRouter();
  return (
    <>
      <TopBar title="흐름" eyebrow="최근 7·14·30일" />
      <div className="screen">
        <FlowView onWrite={() => router.push("/log")} />
      </div>
    </>
  );
}
