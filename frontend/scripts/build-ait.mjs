#!/usr/bin/env node
/**
 * 앱인토스 미니앱 번들 만들기: npm run build:ait  (정적 번들까지만: npm run build:ait -- --skip-ait)
 *   1. .env.ait 를 읽는다 (NEXT_PUBLIC_API_ORIGIN 필수, NEXT_PUBLIC_AIT_APP_NAME 선택)
 *   2. 정적으로 내보낼 수 없는 라우트(서버에서만 도는 것)를 잠시 app/ 밖으로 옮기고 next build (output: export → out-ait/)
 *   3. 옮긴 것을 되돌리고, 미니앱에 필요 없는 서비스 워커를 뺀 뒤 ait build 로 <appName>.ait 를 만든다
 * 웹 빌드(npm run build)와 웹 개발 서버 상태(.next/dev)는 건드리지 않는다.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stash = path.join(root, ".ait-stash");
const outDir = path.join(root, "out-ait");

/** 서버가 있어야 하거나 미니앱에는 필요 없는 라우트 */
const SERVER_ONLY = [
  "app/.well-known", // 안드로이드 앱 링크 확인 파일 (요청 때 환경변수를 읽는다)
  "app/sitemap.ts",
  "app/robots.ts",
  "app/manifest.ts", // 홈 화면에 추가(PWA) 정보
  "app/og", // 공유 이미지를 그리는 라우트
  "proxy.ts", // /api 요청에 백엔드 확인 헤더를 붙이는 프록시 (정적 export 에는 프록시가 있을 수 없다)
];

/**
 * 운영자 연락처 같은 환경변수를 요청 때 읽으려고 force-dynamic 인 안내 페이지들.
 * 미니앱 번들은 서버가 없으니 빌드 때 값으로 굳힌다 (빌드 동안만 force-static 으로 바꿨다가 되돌린다)
 */
const FORCE_STATIC = ["app/account-deletion/page.tsx", "app/info/page.tsx", "app/privacy/page.tsx", "app/terms/page.tsx"];
const DYNAMIC = `export const dynamic = "force-dynamic";`;

function loadEnv(file) {
  const env = {};
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith("#")) env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return env;
}

/**
 * 옮긴 파일·바꾼 파일을 .ait-stash/manifest.json 에 적어 두고, 끝나면(오류·Ctrl+C 포함) 되돌린다.
 * 지난 빌드가 강제로 끊겨 stash 가 남아 있으면 지우지 않고 먼저 되돌린다.
 */
const manifestFile = path.join(stash, "manifest.json");
const manifest = { moved: [], rewritten: [] }; // moved: [stash 안 이름, 원래 상대 경로], rewritten: [상대 경로, stash 안 원본 사본]

function saveManifest() {
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
}

/** stash 에 적힌 것을 모두 제자리로. 되돌리지 못한 것이 있으면 stash 를 남기고 false */
function restoreStash() {
  if (!existsSync(stash)) return true;
  let saved;
  try {
    saved = JSON.parse(readFileSync(manifestFile, "utf8"));
  } catch {
    if (readdirSync(stash).length === 0) {
      rmSync(stash, { recursive: true, force: true });
      return true;
    }
    console.error(".ait-stash 에 목록(manifest.json)이 없어요. 안의 파일을 직접 제자리로 되돌린 뒤 폴더를 지워 주세요.");
    return false;
  }
  let ok = true;
  for (const [rel, copy] of saved.rewritten ?? []) {
    const original = path.join(stash, copy);
    if (existsSync(original)) writeFileSync(path.join(root, rel), readFileSync(original));
  }
  for (const [name, rel] of [...(saved.moved ?? [])].reverse()) {
    const from = path.join(stash, name);
    const to = path.join(root, rel);
    if (!existsSync(from)) continue;
    if (existsSync(to)) {
      console.error(`되돌릴 자리에 이미 파일이 있어요: ${rel} (옮겨 둔 것은 .ait-stash/${name} 에 남겨 둡니다)`);
      ok = false;
      continue;
    }
    renameSync(from, to);
  }
  if (ok) rmSync(stash, { recursive: true, force: true });
  return ok;
}

let restored = true;
function restoreOnce() {
  if (restored) return;
  restored = restoreStash();
}
process.on("exit", restoreOnce);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  try {
    process.on(signal, () => {
      restoreOnce();
      process.exit(130);
    });
  } catch {}
}
process.on("uncaughtException", (error) => {
  console.error(error);
  restoreOnce();
  process.exit(1);
});

function run(cmd, args, env) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", env, shell: process.platform === "win32" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} 실패 (${r.status})`);
}

const env = { ...process.env, ...loadEnv(path.join(root, ".env.ait")), NEXT_PUBLIC_AIT: "1" };
const api = env.NEXT_PUBLIC_API_ORIGIN ?? "";
// 미니앱은 HTTPS API 만 부를 수 있다. localhost 는 브라우저로 번들을 확인할 때만
if (!/^https:\/\/[^/]+$/.test(api) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(api)) {
  console.error("NEXT_PUBLIC_API_ORIGIN 을 .env.ait 에 넣어 주세요 (예: https://api.sorow.co.kr). 끝에 / 없이, HTTPS 로.");
  process.exit(1);
}

if (!restoreStash()) {
  console.error("지난 빌드에서 옮겨 둔 파일을 다 되돌리지 못했어요. 위 안내대로 정리한 뒤 다시 실행해 주세요.");
  process.exit(1);
}
mkdirSync(stash, { recursive: true });
restored = false;
try {
  saveManifest();
  for (const rel of FORCE_STATIC) {
    const file = path.join(root, rel);
    const text = readFileSync(file, "utf8");
    if (!text.includes(DYNAMIC)) continue;
    const copy = `original__${rel.replace(/[\\/]/g, "__")}`;
    writeFileSync(path.join(stash, copy), text); // 원본 사본을 먼저 남기고 목록에 적은 뒤 바꾼다
    manifest.rewritten.push([rel, copy]);
    saveManifest();
    writeFileSync(file, text.replace(DYNAMIC, `export const dynamic = "force-static";`));
  }
  for (const rel of SERVER_ONLY) {
    const from = path.join(root, rel);
    if (!existsSync(from)) continue;
    const name = rel.replace(/[\\/]/g, "__");
    manifest.moved.push([name, rel]);
    saveManifest(); // 옮기기 전에 적는다: 옮기다 끊겨도 다음 실행이 찾아서 되돌린다
    renameSync(from, path.join(stash, name));
  }
  rmSync(outDir, { recursive: true, force: true });
  run("npx", ["next", "build"], env);
} finally {
  restoreOnce();
}
if (!restored) {
  console.error("옮겨 둔 파일을 다 되돌리지 못했어요. .ait-stash 를 확인해 주세요.");
  process.exit(1);
}

if (!existsSync(path.join(outDir, "index.html"))) {
  console.error("정적 번들(out-ait/index.html)이 만들어지지 않았어요.");
  process.exit(1);
}
for (const file of ["sw.js", "offline.html"]) rmSync(path.join(outDir, file), { force: true }); // 미니앱은 서비스 워커를 쓰지 않는다
console.log("정적 번들: out-ait/");

if (!process.argv.includes("--skip-ait")) run("npx", ["ait", "build"], env);
