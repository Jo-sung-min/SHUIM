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
    const msg = err.message ?? String(e);
    const hint = /max clients reached in session mode/i.test(msg)
      ? "Supabase 풀러 5432(세션 모드)는 동시 접속 15개 한도예요. DB_URL 포트를 6543(트랜잭션 모드)으로 바꾸고 다시 배포하세요."
      : /ENOTFOUND|EAI_AGAIN/.test(msg)
      ? "호스트 이름을 찾지 못했어요. DB_URL의 호스트를 확인하세요."
      : /password authentication failed/i.test(msg)
      ? "비밀번호가 틀렸어요. Supabase › Settings › Database에서 재설정한 값인지 확인하세요."
      : /timeout/i.test(msg)
      ? "연결 시간 초과예요. 네트워크/방화벽 또는 리전을 확인하세요."
      : undefined;
    return NextResponse.json({ ok: false, configured: true, latencyMs: Date.now() - t0, error: msg, code: err.code, hint }, { status: 500 });
  }
}
