import assert from "node:assert/strict";

const origin = new URL(process.argv[2] || "https://www.sorow.co.kr");
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
  if (expectedPackage === "kr.co.sorow.app") {
    assert.ok(match.target.sha256_cert_fingerprints.includes("11:8F:0E:2F:B8:6E:E7:5C:36:A3:F0:92:B3:84:A5:81:AD:1E:68:50:CF:48:9E:FE:B7:6D:1D:BD:C6:73:F1:1B"), "Play 앱 서명 키 인증서 불일치");
  }
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
for (const path of ["/privacy", "/terms", "/account-deletion", "/child-safety"]) await check(`공개 안내 ${path}`, async () => {
  const html = await (await get(path, "text/html")).text();
  assert.ok(html.includes("소로우") && html.includes("루체"));
  assert.ok(html.includes("developer@lucelab.co.kr"), "지원 연락처 확인 필요");
  if (path === "/account-deletion") {
    assert.match(html, /<time\b[^>]*dateTime="\d{4}-\d{2}-\d{2}"/i, "삭제 안내 갱신일 없음");
    assert.ok(html.includes("계정 삭제 요청") && html.includes("mailto:"), "계정 삭제 요청 경로 확인 필요");
  } else {
    assert.ok(html.includes('data-policy-status="published"'), "운영 안내 배포·승인 상태 확인 필요");
  }
});
console.log(results.join("\n"));
console.log("이 점검은 공개 웹 경로만 확인합니다. 로그인·삭제·차단·실기기·Play 정책 심사는 별도 검증이 필요합니다.");
process.exitCode = failed ? 1 : 0;
