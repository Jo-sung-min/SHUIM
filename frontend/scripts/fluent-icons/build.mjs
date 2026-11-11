#!/usr/bin/env node
/**
 * picks.mjs 에서 고른 Microsoft Fluent UI System Icons(MIT, github.com/microsoft/fluentui-system-icons)를
 * GitHub 의 고정 커밋에서 받아 소로우 아이콘 찾기용 조각으로 만든다.
 *
 *   node frontend/scripts/fluent-icons/build.mjs [--ref <commit|branch>] [--cache <dir>]
 *
 * 만드는 것
 *   frontend/lib/fluent-icons/data/<분류>.ts   분류별 path 데이터 (아이콘 찾기·표시할 때만 동적 import)
 *   frontend/lib/fluent-icons/manifest.ts      분류 이름, 이름 → 분류, 분류별 로더 (작다: 표시 경로에 번들된다)
 *   frontend/lib/fluent-icons/LICENSE           원본 MIT 라이선스
 *   backend/src/main/resources/circle-fluent-icons.txt   서버가 받아 줄 이름 목록
 *
 * 받은 SVG 는 글자로만 읽고(path 의 d 만 뽑는다) 실행하지 않는다.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { CATEGORIES } from "./picks.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, "../..");
const repoRoot = resolve(frontend, "..");
const outDir = join(frontend, "lib/fluent-icons");
const REPO = "microsoft/fluentui-system-icons";

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };

async function fetchText(url, cacheFile) {
  if (cacheFile && existsSync(cacheFile)) return readFile(cacheFile, "utf8");
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": "fluent-icons-build", Accept: "application/vnd.github+json" } });
    if (res.status === 404) return null;
    if (res.ok) {
      const text = await res.text();
      if (cacheFile) { await mkdir(dirname(cacheFile), { recursive: true }); await writeFile(cacheFile, text); }
      return text;
    }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  throw new Error(`받지 못했어요: ${url}`);
}

function parsePicks() {
  const seen = new Map();
  return CATEGORIES.map((c) => {
    const icons = c.icons.trim().split("\n").map((line) => {
      const [name, label, keywords = ""] = line.split("|").map((s) => s.trim());
      if (!/^[a-z0-9_]{2,45}$/.test(name) || !label) throw new Error(`잘못된 줄: ${line}`);
      if (seen.has(name)) throw new Error(`${name} 이(가) ${seen.get(name)} 과 ${c.id} 에 두 번 들어 있어요`);
      seen.set(name, c.id);
      return { name, label, keywords };
    });
    return { ...c, icons };
  });
}

/** 좌표를 소수 둘째 자리로 (24px 격자에서 0.01px, 화면에서는 차이가 없다): 데이터가 절반 가까이 준다 */
function compactPath(d) {
  return d.replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi, (n) => {
    const r = Number(Number(n).toFixed(2));
    const s = String(Object.is(r, -0) ? 0 : r);
    return s.replace(/^(-?)0\./, "$1.");
  }).replace(/\s+/g, " ").replace(/ ?([A-Za-z]) ?/g, "$1").replace(/ -/g, "-").trim();
}

/** <path d="…" fill-rule="…"> 들만 뽑는다. 다른 요소가 있으면 멈춘다 (모양이 빠지지 않게) */
function parseSvg(svg, name) {
  const view = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (!view || view[1] !== view[2]) throw new Error(`${name}: viewBox 를 읽지 못했어요`);
  const body = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim();
  const paths = [];
  const rest = body.replace(/<path\b([^>]*?)\/>/g, (_, attrs) => {
    const d = attrs.match(/\sd="([^"]+)"/)?.[1];
    if (!d || !/^[MmLlHhVvCcSsQqTtAaZzEe0-9.,\s+\-]+$/.test(d)) throw new Error(`${name}: path 를 읽지 못했어요`);
    const evenodd = /fill-rule="evenodd"/.test(attrs);
    paths.push(evenodd ? { d: compactPath(d), e: 1 } : compactPath(d));
    return "";
  }).trim();
  if (rest) throw new Error(`${name}: path 밖의 요소가 있어요 (${rest.slice(0, 60)})`);
  if (!paths.length) throw new Error(`${name}: path 가 없어요`);
  return { size: Number(view[1]), paths };
}

const tsString = (s) => JSON.stringify(s);

async function main() {
  const categories = parsePicks();
  const ref = arg("--ref", "main");
  const commit = JSON.parse(await fetchText(`https://api.github.com/repos/${REPO}/commits/${encodeURIComponent(ref)}`));
  const sha = commit.sha;
  if (!/^[0-9a-f]{40}$/.test(sha ?? "")) throw new Error("커밋을 찾지 못했어요");
  const cache = resolve(arg("--cache", join(tmpdir(), "fluent-icons-cache")), sha);
  console.log(`Fluent UI System Icons @ ${sha}`);

  const root = JSON.parse(await fetchText(`https://api.github.com/repos/${REPO}/git/trees/${sha}`, join(cache, "tree-root.json")));
  const assetsSha = root.tree.find((t) => t.path === "assets" && t.type === "tree")?.sha;
  const assets = JSON.parse(await fetchText(`https://api.github.com/repos/${REPO}/git/trees/${assetsSha}`, join(cache, "tree-assets.json")));
  if (assets.truncated) throw new Error("assets 목록이 잘렸어요");
  const folders = new Map(assets.tree.filter((t) => t.type === "tree").map((t) => [t.path.toLowerCase().replace(/[\s-]+/g, "_"), t.path]));
  const license = await fetchText(`https://raw.githubusercontent.com/${REPO}/${sha}/LICENSE`, join(cache, "LICENSE"));

  const raw = (path) => `https://raw.githubusercontent.com/${REPO}/${sha}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const built = [];
  for (const c of categories) {
    const icons = [];
    for (let i = 0; i < c.icons.length; i += 8) {
      const batch = await Promise.all(c.icons.slice(i, i + 8).map(async (pick) => {
        const folder = folders.get(pick.name);
        if (!folder) throw new Error(`${pick.name}: assets 폴더가 없어요`);
        for (const size of [24, 20]) {
          const file = `ic_fluent_${pick.name}_${size}_regular.svg`;
          const svg = await fetchText(raw(`assets/${folder}/SVG/${file}`), join(cache, "svg", file));
          if (svg) return { ...pick, ...parseSvg(svg, pick.name) };
        }
        throw new Error(`${pick.name}: 24·20px Regular SVG 가 없어요`);
      }));
      icons.push(...batch);
    }
    built.push({ ...c, icons });
    console.log(`  ${c.id} ${icons.length}`);
  }

  const header = `// 생성 파일: frontend/scripts/fluent-icons/build.mjs 로 다시 만든다. 손으로 고치지 않는다.\n// Microsoft Fluent UI System Icons (MIT) — https://github.com/${REPO}/tree/${sha}\n`;
  await mkdir(join(outDir, "data"), { recursive: true });
  for (const c of built) {
    const rows = c.icons.map((icon) =>
      `  [${tsString(icon.name)}, ${tsString(icon.label)}, ${tsString(icon.keywords)}, ${icon.size}, ${JSON.stringify(icon.paths)}],`);
    await writeFile(join(outDir, "data", `${c.id}.ts`),
      `${header}import type { FluentIconRow } from "../types";\n\nconst icons: FluentIconRow[] = [\n${rows.join("\n")}\n];\nexport default icons;\n`);
  }
  const ids = built.map((c) => c.id);
  await writeFile(join(outDir, "manifest.ts"), `${header}import type { FluentIconRow } from "./types";

export const FLUENT_SOURCE = { repo: ${tsString(REPO)}, commit: ${tsString(sha)} };
export type FluentCategoryId = ${ids.map(tsString).join(" | ")};
/** 아이콘 찾기의 분류 (picks.mjs 순서) */
export const FLUENT_CATEGORIES: { id: FluentCategoryId; label: string; count: number }[] = [
${built.map((c) => `  { id: ${tsString(c.id)}, label: ${tsString(c.label)}, count: ${c.icons.length} },`).join("\n")}
];
/** 분류별 아이콘 이름 (표시할 때 어느 조각을 받을지 찾는 데만 쓴다) */
export const FLUENT_NAMES: Record<FluentCategoryId, string> = {
${built.map((c) => `  ${c.id}: ${tsString(c.icons.map((i) => i.name).join(" "))},`).join("\n")}
};
/** 분류 조각을 따로따로 받는다 (번들러가 분류마다 청크를 나눈다) */
export function importFluentCategory(id: FluentCategoryId): Promise<{ default: FluentIconRow[] }> {
  switch (id) {
${ids.map((id) => `    case ${tsString(id)}: return import("./data/${id}");`).join("\n")}
  }
}
`);
  await writeFile(join(outDir, "LICENSE"), `Icons in this folder (data/*.ts) are converted from Microsoft Fluent UI System Icons\nhttps://github.com/${REPO} (commit ${sha})\n\n${license}`);
  const names = built.flatMap((c) => c.icons.map((i) => i.name)).sort();
  await writeFile(join(repoRoot, "backend/src/main/resources/circle-fluent-icons.txt"),
    `# 생성 파일: frontend/scripts/fluent-icons/build.mjs. 소로우 아이콘으로 받을 Fluent 아이콘 이름 ("fl:" 뒤)\n${names.join("\n")}\n`);
  console.log(`${names.length} icons`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
