import assert from "node:assert/strict";

const origin = new URL(process.argv[2] || "https://sorow.co.kr");
if (origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname)) throw new Error("배포 주소는 HTTPS여야 합니다.");
const expectedPackage = process.env.ANDROID_PACKAGE_NAME || "kr.co.sorow.app";
let failed = 0;
const results = [];

async function check(label, action) {
  try { await action(); results.push(`PASS ${label}`); }
  catch (error) { failed++; results.push(`FAIL ${label}: ${error.message}`); }
}
async function get(path, type) {
  const response = await fetch(new URL(path, origin), { redirect: "manual", signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, `${path} HTTP ${response.status} (리디렉션도 확인 필요)`);
  if (type) assert.ok(response.headers.get("content-type")?.includes(type), `${path} Content-Type 확인 필요`);
  return response;
}

await check("앱 연결(Play 앱 서명 인증서)", async () => {
  const links = await (await get("/.well-known/assetlinks.json", "application/json")).json();
  const match = links.find((item) => item.target?.package_name === expectedPackage && item.target.namespace === "android_app" && item.relation?.includes("delegate_permission/common.handle_all_urls"));
  assert.ok(match, `${expectedPackage} 연결 항목 없음`);
  assert.ok(match.target.sha256_cert_fingerprints?.length, "인증서 지문 없음");
  for (const fingerprint of match.target.sha256_cert_fingerprints) assert.match(fingerprint, /^([A-F0-9]{2}:){31}[A-F0-9]{2}$/);
});
await check("웹 앱 매니페스트·아이콘", async () => {
  const manifest = await (await get("/manifest.webmanifest")).json();
  assert.equal(manifest.id, "/"); assert.equal(manifest.scope, "/"); assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons?.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
  for (const icon of manifest.icons) await get(icon.src, "image/");
});
await check("오프라인 화면·서비스워커", async () => {
  const worker = await get("/sw.js", "javascript");
  assert.match(worker.headers.get("cache-control") || "", /no-cache|no-store/);
  const html = await (await get("/offline.html", "text/html")).text();
  assert.ok(html.includes("다시 연결하기"));
});
for (const path of ["/privacy", "/terms", "/account-deletion"]) await check(`공개 안내 ${path}`, async () => {
  const html = await (await get(path, "text/html")).text();
  assert.ok(html.includes("소로우") && html.includes("루체"));
  assert.ok(html.includes("developer@lucelab.co.kr"), "지원 연락처 확인 필요");
  assert.ok(!html.includes("배포 준비용 안내입니다"), "운영 정보·보유기간·위탁/국외이전 검토 및 승인 필요");
});
console.log(results.join("\n"));
console.log("이 점검은 공개 웹 경로만 확인합니다. 로그인·삭제·차단·실기기·Play 정책 심사는 별도 검증이 필요합니다.");
process.exitCode = failed ? 1 : 0;
