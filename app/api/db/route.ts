import { NextResponse } from "next/server";
import { dbConfigured, getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/db — DB 연결 상태 확인 (연결 여부, 서버 버전, 지연 시간). 비밀번호는 절대 반환하지 않음. */
export async function GET() {
  if (!dbConfigured()) return NextResponse.json({ ok: false, configured: false, error: "DB_URL이 .env에 없어요" }, { status: 503 });
  const pool = getPool();
  if (!pool) return NextResponse.json({ ok: false, configured: true, error: "DB_URL 형식을 읽지 못했어요" }, { status: 503 });
  const t0 = Date.now();
  try {
    const r = await pool.query<{ now: string; version: string; db: string; usr: string }>(
      "select now()::text as now, version() as version, current_database() as db, current_user as usr"
    );
    const row = r.rows[0];
    return NextResponse.json({
      ok: true,
      configured: true,
      latencyMs: Date.now() - t0,
      host: pool.options.host,
      database: row.db,
      user: row.usr,
      serverTime: row.now,
      version: row.version.split(" on ")[0],
    });
  } catch (e) {
    const err = e as { message?: string; code?: string };
    return NextResponse.json({ ok: false, configured: true, latencyMs: Date.now() - t0, error: err.message ?? String(e), code: err.code }, { status: 500 });
  }
}
