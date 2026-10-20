import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { loadStore } from "@/lib/server/community";
import { dbConfigured } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/community — 현재 유저(없으면 익명 유저 생성) 기준의 커뮤니티 전체 상태 */
export async function GET() {
  if (!dbConfigured()) return NextResponse.json({ error: "DB_URL이 설정되지 않았어요" }, { status: 503 });
  try {
    const me = await requireUser();
    return NextResponse.json(await loadStore(me));
  } catch (e) {
    console.error("community GET failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
