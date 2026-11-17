"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 외출은 이제 홈의 방 안에서 나간다 (방의 "나가기"). 예전 주소로 오면 홈으로 보낸다 */
export default function OutingPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/"); }, [router]);
  return <p role="status" style={{ padding: 24 }}>방으로 돌아가는 중이에요.</p>;
}
