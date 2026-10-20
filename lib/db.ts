/**
 * PostgreSQL 연결 (서버 전용). .env의 DB_URL을 읽는다.
 * - jdbc:postgresql://host:port/db?user=..&password=..  (Spring 스타일)
 * - postgresql://user:password@host:port/db             (Node 스타일)
 * 둘 다 받아서 pg Pool 설정으로 바꾼다. 비밀번호에 특수문자가 있어도 객체로 넘기므로 안전하다.
 */
import pg, { Pool, type PoolConfig } from "pg";

// TIMESTAMP(시간대 없음)는 DB가 UTC로 저장하므로 UTC로 해석 (기본은 로컬 시간대로 읽어 9시간 어긋남)
pg.types.setTypeParser(1114, (v: string) => new Date(v.replace(" ", "T") + "Z"));
// DATE 는 'YYYY-MM-DD' 문자열 그대로 (Date 객체로 바꾸면 시간대 때문에 하루가 밀릴 수 있음)
pg.types.setTypeParser(1082, (v: string) => v);

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
  return {
    host,
    port: Number(u.port || 5432),
    database: u.pathname.replace(/^\//, "") || "postgres",
    user,
    password,
    // Supabase 등 외부 DB는 SSL 필수. 로컬이거나 sslmode=disable이면 끔.
    ssl: isLocal || sslParam === "disable" ? undefined : { rejectUnauthorized: false },
    max: 4,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 30000,
  };
}

let pool: Pool | null = null;

export function getPool(): Pool | null {
  if (pool) return pool;
  const cfg = parseDbUrl(process.env.DB_URL ?? process.env.DATABASE_URL);
  if (!cfg) return null;
  pool = new Pool(cfg);
  return pool;
}

export const dbConfigured = () => Boolean(process.env.DB_URL ?? process.env.DATABASE_URL);
