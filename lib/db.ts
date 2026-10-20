/**
 * PostgreSQL 연결 (서버 전용). .env의 DB_URL을 읽는다.
 * - jdbc:postgresql://host:port/db?user=..&password=..  (Spring 스타일)
 * - postgresql://user:password@host:port/db             (Node 스타일)
 * 둘 다 받아서 pg Pool 설정으로 바꾼다. 비밀번호에 특수문자가 있어도 객체로 넘기므로 안전하다.
 *
 * 풀은 globalThis 에 하나만 둔다. Next.js 개발 서버는 파일이 바뀔 때마다 모듈을 다시 평가하는데,
 * 모듈 변수에 두면 그때마다 새 풀이 생기고 예전 풀의 연결은 반환되지 않아 Supabase 풀러 한도(세션 모드 15개)에 걸린다.
 */
import pg, { Pool, type PoolConfig } from "pg";

// TIMESTAMP(시간대 없음)는 DB가 UTC로 저장하므로 UTC로 해석 (기본은 로컬 시간대로 읽어 9시간 어긋남)
pg.types.setTypeParser(1114, (v: string) => new Date(v.replace(" ", "T") + "Z"));
// DATE 는 'YYYY-MM-DD' 문자열 그대로 (Date 객체로 바꾸면 시간대 때문에 하루가 밀릴 수 있음)
pg.types.setTypeParser(1082, (v: string) => v);

let warnedPort = false;

export function parseDbUrl(raw: string | undefined): PoolConfig | null {
  if (!raw) return null;
  let url = raw.trim();
  if (url.startsWith("jdbc:")) url = url.slice(5);
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const user = u.searchParams.get("user") ?? decodeURIComponent(u.username || "");
  const password = u.searchParams.get("password") ?? decodeURIComponent(u.password || "");
  const sslParam = u.searchParams.get("sslmode") ?? u.searchParams.get("ssl");
  const host = u.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1";
  let port = Number(u.port || 5432);
  // Supabase 풀러의 5432는 세션 모드(동시 15개 한도)라 서버리스·핫리로드에서 금방 꽉 찬다. 6543(트랜잭션 모드)으로 자동 전환.
  // 세션 모드가 꼭 필요하면 DB_KEEP_SESSION_MODE=1
  if (host.endsWith(".pooler.supabase.com") && port === 5432 && process.env.DB_KEEP_SESSION_MODE !== "1") {
    port = 6543;
    if (!warnedPort) {
      warnedPort = true;
      console.warn("[db] Supabase 풀러 5432(세션 모드) → 6543(트랜잭션 모드)으로 바꿔 연결합니다. DB_URL 포트를 6543으로 바꿔 두세요.");
    }
  }
  return {
    host,
    port,
    database: u.pathname.replace(/^\//, "") || "postgres",
    user,
    password,
    // Supabase 등 외부 DB는 SSL 필수. 로컬이거나 sslmode=disable이면 끔.
    ssl: isLocal || sslParam === "disable" ? undefined : { rejectUnauthorized: false },
    // 풀러(세션 모드 15개 한도)를 고려해 작게. 트랜잭션 모드(6543)면 더 넉넉하지만 그래도 소수로 충분
    max: Number(process.env.DB_POOL_MAX ?? 3),
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 10000, // 놀고 있는 연결은 10초 뒤 반환
    allowExitOnIdle: true,
  };
}

const g = globalThis as unknown as { __shuimPool?: Pool; __shuimPoolKey?: string };

export function getPool(): Pool | null {
  const raw = process.env.DB_URL ?? process.env.DATABASE_URL;
  const cfg = parseDbUrl(raw);
  if (!cfg) return null;
  // DB_URL 이 바뀌면 예전 풀을 닫고 새로 만든다
  if (g.__shuimPool && g.__shuimPoolKey !== raw) {
    g.__shuimPool.end().catch(() => {});
    g.__shuimPool = undefined;
  }
  if (!g.__shuimPool) {
    const pool = new Pool(cfg);
    pool.on("error", (e) => console.error("pg pool error", e.message));
    g.__shuimPool = pool;
    g.__shuimPoolKey = raw;
  }
  return g.__shuimPool;
}

export const dbConfigured = () => Boolean(process.env.DB_URL ?? process.env.DATABASE_URL);
