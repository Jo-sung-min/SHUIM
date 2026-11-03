#!/usr/bin/env node
/**
 * 소로우 바닷가 도트 캐릭터 시트를 Aseprite 로 만든다:  node scripts/gen-beach-character.mjs
 *
 * scripts/aseprite/beach-character.lua 를 Aseprite 배치 모드로 돌려
 *   public/beach/chars.png            캐릭터 아틀라스 (72×104 칸, 앞·뒤·왼·오른 × 서있기 4·걷기 6 × 색 변형 8줄)
 *   public/beach/chars.json           위 시트의 배치 정보
 *   scripts/aseprite/beach-character.aseprite   변형 0 의 프레임·태그가 붙은 편집용 원본
 *   scripts/aseprite/beach-character-preview.png   8가지 색상의 3배 확대 미리보기
 * 을 만든다. 색·칸 크기·프레임 수는 scripts/beach-character.config.mjs 한 곳에서 정한다 (atlas.ts 도 같은 값을 쓴다).
 *
 * Aseprite 는 PATH 의 `aseprite` 나 ASEPRITE 환경변수, 없으면 C:\Program Files\Aseprite\Aseprite.exe 를 쓴다.
 * 시트를 바꾼 뒤에는 `node scripts/gen-beach-sprites.mjs` 로 atlas.ts 를 다시 만든다.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHARACTER } from "./beach-character.config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [process.env.ASEPRITE, "aseprite", "C:\\Program Files\\Aseprite\\Aseprite.exe"].filter(Boolean);
const aseprite = candidates.find((bin) => (bin === "aseprite" || existsSync(bin)) && spawnSync(bin, ["--version"], { stdio: "ignore" }).status === 0);
if (!aseprite) {
  console.error("Aseprite 를 찾지 못했어요. ASEPRITE 환경변수로 실행 파일 경로를 알려 주세요.");
  process.exit(1);
}

const work = mkdtempSync(path.join(tmpdir(), "sorow-beach-character-"));
const configPath = path.join(work, "config.json");
writeFileSync(configPath, JSON.stringify(CHARACTER));
const out = path.join(root, "public", "beach", "chars.png");
const json = path.join(root, "public", "beach", "chars.json");
const ase = path.join(root, "scripts", "aseprite", "beach-character.aseprite");
const args = [
  "-b",
  "--script-param", `config=${configPath}`,
  "--script-param", `out=${out}`,
  "--script-param", `json=${json}`,
  "--script-param", `ase=${ase}`,
  "--script-param", `art=${path.join(root, "scripts", "aseprite", "beach-character-art.lua")}`,
  "--script", path.join(root, "scripts", "aseprite", "beach-character.lua"),
];
const result = spawnSync(aseprite, args, { stdio: "inherit" });
rmSync(work, { recursive: true, force: true });
if (result.status !== 0) {
  console.error(`Aseprite 가 실패했어요 (exit ${result.status})`);
  process.exit(result.status ?? 1);
}
const preview = spawnSync(aseprite, [
  "-b", "--script-param", `sheet=${out}`,
  "--script-param", `out=${path.join(root, "scripts", "aseprite", "beach-character-preview.png")}`,
  "--script", path.join(root, "scripts", "aseprite", "preview-character.lua"),
], { stdio: "inherit" });
if (preview.status !== 0) process.exit(preview.status ?? 1);
console.log(`→ ${path.relative(root, out)}, ${path.relative(root, json)}, ${path.relative(root, ase)}`);
