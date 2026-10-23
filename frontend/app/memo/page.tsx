"use client";

import { TopBar } from "@/components/ui";
import MemoPad from "@/components/MemoPad";

/** 메모 화면. 본문(메모장)은 기록 화면의 "기록하기" 탭과 같은 components/MemoPad */
export default function MemoPage() {
  return (
    <>
      <TopBar title="메모" />
      <div className="screen">
        <MemoPad hero />
      </div>
    </>
  );
}
