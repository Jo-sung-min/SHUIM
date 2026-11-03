#!/usr/bin/env node
/** Build the approved pixel artwork with Aseprite. No procedural character illustration. */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHARACTER } from "./beach-character.config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "scripts/aseprite/base-characters");
const candidates = [process.env.ASEPRITE, "aseprite", "C:/Program Files/Aseprite/Aseprite.exe"].filter(Boolean);
const exe = candidates.find((bin) => (bin === "aseprite" || existsSync(bin)) && spawnSync(bin, ["--version"], { stdio: "ignore" }).status === 0);
if (!exe) throw new Error("Aseprite 실행 파일을 ASEPRITE 환경변수로 지정해 주세요.");
function run(args) {
  const result = spawnSync(exe, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Aseprite failed (${result.status})`);
}
const work = mkdtempSync(path.join(tmpdir(), "sorow-beach-character-"));
try {
  const config = path.join(work, "config.json");
  writeFileSync(config, JSON.stringify(CHARACTER));
  for (const { id } of CHARACTER.variants) {
    run(["-b", path.join(sourceRoot, id, "front.aseprite"), "--save-as", path.join(sourceRoot, id, "front.png")]);
  }
  run(["-b", "--script-param", `config=${config}`, "--script-param", `root=${root.replaceAll("\\", "/")}`,
    "--script", path.join(root, "scripts/aseprite/beach-character.lua")]);
  // Compatibility export and legacy editor entry point; runtime uses the versioned atlas.
  copyFileSync(path.join(root, "public/beach/chars-v2.png"), path.join(root, "public/beach/chars.png"));
  copyFileSync(path.join(sourceRoot, "male/animated.aseprite"), path.join(root, "scripts/aseprite/beach-character.aseprite"));
  for (const { id } of CHARACTER.variants) {
    run(["-b", "--frame-range", "4,9", path.join(sourceRoot, id, "animated.aseprite"), "--scale", "4",
      "--save-as", path.join(sourceRoot, `${id}-walk.gif`)]);
  }
} finally {
  const resolvedWork = path.resolve(work);
  const resolvedTemp = path.resolve(tmpdir());
  if (!resolvedWork.startsWith(resolvedTemp + path.sep) || !path.basename(resolvedWork).startsWith("sorow-beach-character-")) throw new Error("Unexpected temporary directory");
  rmSync(resolvedWork, { recursive: true, force: true });
}
console.log("→ public/beach/chars-v2.png (male / female, 4 directions), editable Aseprite originals and previews");
