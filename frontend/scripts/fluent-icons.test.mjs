// 소로우 아이콘 찾기(Fluent UI System Icons) 생성물이 서로 맞는지: picks.mjs ↔ lib/fluent-icons ↔ 서버 목록
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CATEGORIES } from "./fluent-icons/picks.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const picks = CATEGORIES.map((c) => ({ id: c.id, names: c.icons.trim().split(/\r?\n/).map((l) => l.split("|")[0].trim()) }));

test("picks have unique names and categories", () => {
  const all = picks.flatMap((c) => c.names);
  assert.equal(new Set(all).size, all.length);
  assert.equal(new Set(picks.map((c) => c.id)).size, picks.length);
  assert.ok(all.length >= 200, "아이콘 찾기에 고를 만큼 있어야 한다");
});

test("generated data matches picks and the server allowlist", async () => {
  const manifest = await read("lib/fluent-icons/manifest.ts");
  const server = (await read("../backend/src/main/resources/circle-fluent-icons.txt")).split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
  const all = picks.flatMap((c) => c.names).sort();
  assert.deepEqual(server, all, "서버 목록을 build.mjs 로 다시 만들어야 한다");
  for (const c of picks) {
    assert.match(manifest, new RegExp(`  ${c.id}: "${c.names.join(" ")}",`), `${c.id} 이름 목록`);
    const data = await read(`lib/fluent-icons/data/${c.id}.ts`);
    const rows = [...data.matchAll(/^ {2}\["([a-z0-9_]+)", "[^"]+", "[^"]*", (24|20), \[/gm)].map((m) => m[1]);
    assert.deepEqual(rows, c.names, `${c.id} 조각`);
    assert.doesNotMatch(data.slice(data.indexOf("const icons")), /<[a-z/!]|javascript:/i, "path 데이터에 태그가 섞이면 안 된다");
  }
  assert.match(await read("lib/fluent-icons/LICENSE"), /MIT License/);
});
