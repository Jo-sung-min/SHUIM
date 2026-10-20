#!/usr/bin/env node
/**
 * Flyway 호환 마이그레이션 실행기 (Node 전용, Java 불필요)
 *
 *   npm run db:migrate          db/migration/V*__*.sql 중 아직 적용 안 된 것을 순서대로 적용
 *   npm run db:status           적용 상태 출력
 *   node scripts/migrate.mjs --validate   파일 체크섬과 DB 기록 비교
 *
 * - 기록 테이블 flyway_schema_history 를 Flyway와 같은 컬럼·체크섬(CRC32, 줄 단위, 줄바꿈 제외)으로 남기므로
 *   나중에 Spring Boot(Flyway)에 같은 파일을 넣어도 "이미 적용됨"으로 인식한다.
 * - 각 마이그레이션은 트랜잭션 안에서 실행. 실패하면 롤백하고 멈춘다.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION_DIR = path.join(root, "db", "migration");
const HISTORY = "flyway_schema_history";

function loadEnv() {
  for (const f of [".env", ".env.local"]) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
    }
  }
}

function parseDbUrl(raw) {
  let url = raw.trim();
  if (url.startsWith("jdbc:")) url = url.slice(5);
  const u = new URL(url);
  const host = u.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1";
  const sslmode = u.searchParams.get("sslmode");
  return {
    host,
    port: Number(u.port || 5432),
    database: u.pathname.replace(/^\//, "") || "postgres",
    user: u.searchParams.get("user") ?? decodeURIComponent(u.username),
    password: u.searchParams.get("password") ?? decodeURIComponent(u.password),
    ssl: isLocal || sslmode === "disable" ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  };
}

/** Flyway 체크섬: 각 줄(줄바꿈 제외, 첫 줄 BOM 제거)의 UTF-8 바이트를 순서대로 CRC32, signed int32 */
function flywayChecksum(text) {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length && lines[0].charCodeAt(0) === 0xfeff) lines[0] = lines[0].slice(1);
  let crc = 0;
  for (const line of lines) crc = zlib.crc32(Buffer.from(line, "utf8"), crc);
  return crc | 0;
}

function listMigrations() {
  if (!fs.existsSync(MIGRATION_DIR)) return [];
  return fs
    .readdirSync(MIGRATION_DIR)
    .filter((f) => /^V\d+(?:[._]\d+)*__.+\.sql$/i.test(f))
    .map((f) => {
      const m = f.match(/^V([^_]+(?:[._]\d+)*)__(.+)\.sql$/i);
      const version = m[1].replace(/_/g, ".");
      const description = m[2].replace(/_/g, " ");
      const sql = fs.readFileSync(path.join(MIGRATION_DIR, f), "utf8");
      return { file: f, version, description, sql, checksum: flywayChecksum(sql), sortKey: version.split(".").map(Number) };
    })
    .sort((a, b) => {
      for (let i = 0; i < Math.max(a.sortKey.length, b.sortKey.length); i++) {
        const d = (a.sortKey[i] ?? 0) - (b.sortKey[i] ?? 0);
        if (d) return d;
      }
      return 0;
    });
}

async function ensureHistory(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${HISTORY} (
      installed_rank INTEGER NOT NULL PRIMARY KEY,
      version VARCHAR(50),
      description VARCHAR(200) NOT NULL,
      type VARCHAR(20) NOT NULL,
      script VARCHAR(1000) NOT NULL,
      checksum INTEGER,
      installed_by VARCHAR(100) NOT NULL,
      installed_on TIMESTAMP NOT NULL DEFAULT now(),
      execution_time INTEGER NOT NULL,
      success BOOLEAN NOT NULL
    )`);
  await client.query(`CREATE INDEX IF NOT EXISTS ${HISTORY}_s_idx ON ${HISTORY} (success)`);
}

async function main() {
  loadEnv();
  const raw = process.env.DB_URL ?? process.env.DATABASE_URL;
  if (!raw) {
    console.error("DB_URL 이 .env 에 없어요");
    process.exit(1);
  }
  const mode = process.argv.includes("--status") ? "status" : process.argv.includes("--validate") ? "validate" : "migrate";
  const cfg = parseDbUrl(raw);
  console.log(`DB ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
  const client = new pg.Client(cfg);
  await client.connect();
  try {
    await ensureHistory(client);
    const applied = (await client.query(`SELECT installed_rank, version, description, script, checksum, installed_on, success FROM ${HISTORY} ORDER BY installed_rank`)).rows;
    const files = listMigrations();
    const byVersion = new Map(applied.map((r) => [r.version, r]));

    if (mode === "status" || mode === "validate") {
      let bad = 0;
      for (const f of files) {
        const r = byVersion.get(f.version);
        const state = !r ? "Pending" : !r.success ? "Failed" : r.checksum === f.checksum ? "Success" : "Checksum MISMATCH";
        if (state.includes("MISMATCH") || state === "Failed") bad++;
        console.log(`  ${f.version.padEnd(6)} ${state.padEnd(18)} ${f.file}${r ? `  (${new Date(r.installed_on).toISOString().slice(0, 19)})` : ""}`);
      }
      for (const r of applied) if (!files.some((f) => f.version === r.version)) console.log(`  ${String(r.version).padEnd(6)} Missing file      ${r.script}`);
      if (mode === "validate") process.exit(bad ? 2 : 0);
      return;
    }

    const failed = applied.find((r) => !r.success);
    if (failed) {
      console.error(`이전에 실패한 마이그레이션이 있어요: ${failed.script}. 원인을 고친 뒤 ${HISTORY} 에서 해당 행을 지우고 다시 실행해요.`);
      process.exit(1);
    }
    for (const f of files) {
      const r = byVersion.get(f.version);
      if (r) {
        if (r.checksum !== f.checksum) console.warn(`  ! ${f.file} 체크섬이 DB 기록과 달라요 (파일이 바뀜). Flyway라면 validate 실패. 필요하면 --repair 대신 기록을 갱신하세요.`);
        continue;
      }
      const rank = (applied.length ? Math.max(...applied.map((x) => x.installed_rank)) : 0) + 1;
      process.stdout.write(`  → ${f.file} 적용 중… `);
      const t0 = Date.now();
      await client.query("BEGIN");
      try {
        await client.query(f.sql);
        await client.query(
          `INSERT INTO ${HISTORY} (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success)
           VALUES ($1, $2, $3, 'SQL', $4, $5, current_user, $6, true)`,
          [rank, f.version, f.description, f.file, f.checksum, Date.now() - t0]
        );
        await client.query("COMMIT");
        applied.push({ installed_rank: rank, version: f.version, success: true });
        console.log(`완료 (${Date.now() - t0} ms)`);
      } catch (e) {
        await client.query("ROLLBACK");
        console.log("실패");
        console.error(e.message);
        process.exit(1);
      }
    }
    console.log("모든 마이그레이션이 적용되어 있어요.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
