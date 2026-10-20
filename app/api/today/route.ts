import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { CATEGORIES, MemoCat, memoCatById } from "@/lib/categories";
import { hasCrisisSignal } from "@/lib/crisis";
import type { BriefingData, DayRecord, MomentData, MomentMode, ReviewData } from "@/lib/storage";
import { DEFAULT_PROMPTS, PROMPT_MAX_LEN, PromptKey } from "@/lib/prompts";

export const runtime = "nodejs";

type Mode = "briefing" | MomentMode | "review";

interface DatedMemo {
  date: string; // YYYY-MM-DD
  cat: MemoCat;
  text: string;
  pinned: boolean;
}

interface Body {
  mode?: Mode;
  date: string;
  today: DayRecord;
  todayDid: string[];
  recent: { date: string; record: DayRecord; did: string[] }[]; // 오래된 순, 오늘 제외
  memos: { cat: MemoCat; text: string; pinned: boolean }[];
  goals: { title: string; cat: MemoCat; why: string; due?: string; steps: { text: string; done: boolean }[] }[];
  schedule: { date: string; time?: string; title: string; cat: MemoCat; done: boolean }[];
  /** review 모드: 메모 전체 (오래된 순, 날짜 포함) */
  allMemos?: DatedMemo[];
  /** 관리자가 덮어쓴 시스템 프롬프트 (키별) */
  prompts?: Partial<Record<PromptKey, string>>;
}

const fmtScore = (s: number) => (s > 0 ? `+${s}` : `${s}`);

/** 받침 유무에 따라 조사 선택: josa("막막함", "이라고", "라고") → "막막함이라고" */
function josa(word: string, withBatchim: string, without: string): string {
  const ch = word.trim().replace(/["'”’)\]]+$/, "").slice(-1);
  const code = ch.charCodeAt(0);
  const isHangul = code >= 0xac00 && code <= 0xd7a3;
  const has = isHangul ? (code - 0xac00) % 28 !== 0 : /[0-9]/.test(ch) ? /[013678]/.test(ch) : false;
  return word + (has ? withBatchim : without);
}

function dayLine(date: string, record: DayRecord, did: string[]): string {
  const parts = CATEGORIES.map((c) => {
    const e = record[c.id];
    if (!e) return null;
    return `${c.label} ${fmtScore(e.score)}${e.note ? ` "${e.note.slice(0, 200)}"` : ""}`;
  }).filter(Boolean);
  const didStr = did.length ? ` | 한 행동: ${did.join(", ")}` : "";
  return `${date} | ${parts.join(" / ") || "(점수 없음)"}${didStr}`;
}

function toPlainText(b: Body): string {
  const out: string[] = [];
  out.push(`[오늘 ${b.date}]`);
  out.push(Object.keys(b.today).length || b.todayDid.length ? dayLine(b.date, b.today, b.todayDid) : "(오늘은 아직 기록 전)");
  out.push("", "[최근 기록 (오래된 순)]");
  out.push(b.recent.length ? b.recent.map((r) => dayLine(r.date, r.record, r.did)).join("\n") : "(없음)");
  out.push("", "[메모 (고정 먼저)]");
  out.push(
    b.memos.length
      ? b.memos.map((m) => `${m.pinned ? "📌 " : "- "}[${memoCatById(m.cat).label}] ${m.text.slice(0, 300)}`).join("\n")
      : "(없음)"
  );
  out.push("", "[진행 중 목표]");
  out.push(
    b.goals.length
      ? b.goals
          .map((g) => {
            const done = g.steps.filter((s) => s.done).length;
            const steps = g.steps.map((s) => `${s.done ? "✔" : "○"} ${s.text}`).join(", ");
            return `- [${memoCatById(g.cat).label}] ${g.title} (${done}/${g.steps.length}${g.due ? `, ${g.due}까지` : ""})${g.why ? ` 이유: "${g.why}"` : ""}${steps ? ` 단계: ${steps}` : ""}`;
          })
          .join("\n")
      : "(없음)"
  );
  out.push("", "[일정 (오늘 + 3일)]");
  out.push(
    b.schedule.length
      ? b.schedule
          .map((s) => `- ${s.date}${s.time ? ` ${s.time}` : ""} ${s.done ? "✔ " : ""}${s.title} [${memoCatById(s.cat).label}]`)
          .join("\n")
      : "(없음)"
  );
  return out.join("\n");
}

/* ---------- API 키 없을 때: 규칙 기반 브리핑 ---------- */

function avg(r: DayRecord): number | null {
  const s = CATEGORIES.map((c) => r[c.id]?.score).filter((v): v is number => typeof v === "number");
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
}

function localBriefing(b: Body): BriefingData {
  const todayAvg = avg(b.today);
  const recent = b.recent.filter((r) => avg(r.record) !== null);
  const last = recent[recent.length - 1];
  const lastAvg = last ? avg(last.record) : null;
  const prevAvg = recent.length > 1 ? avg(recent[recent.length - 2].record) : null;

  // 가속도: 오늘 vs 직전, 오늘 기록 없으면 직전 vs 그 전
  let diff: number | null = null;
  let base = "어제";
  if (todayAvg !== null && lastAvg !== null) diff = todayAvg - lastAvg;
  else if (lastAvg !== null && prevAvg !== null) {
    diff = lastAvg - prevAvg;
    base = "그 전날";
  }
  const direction: BriefingData["momentum"]["direction"] = diff === null ? "flat" : diff > 0.3 ? "up" : diff < -0.3 ? "down" : "flat";

  // 가장 많이 움직인 카테고리
  let moved = "";
  if (last) {
    const src = todayAvg !== null ? b.today : recent.length > 1 ? last.record : null;
    const ref = todayAvg !== null ? last.record : recent.length > 1 ? recent[recent.length - 2].record : null;
    if (src && ref) {
      let best: { label: string; d: number } | null = null;
      for (const c of CATEGORIES) {
        const a = src[c.id]?.score;
        const p = ref[c.id]?.score;
        if (typeof a === "number" && typeof p === "number" && (!best || Math.abs(a - p) > Math.abs(best.d))) best = { label: c.label, d: a - p };
      }
      if (best && best.d !== 0) moved = ` 가장 크게 움직인 건 ${best.label}(${fmtScore(best.d)})이에요.`;
    }
  }

  const momentumText =
    diff === null
      ? "아직 비교할 기록이 적어요. 이틀만 쌓이면 흐름이 보이기 시작해요."
      : direction === "up"
      ? `${base}보다 평균 ${fmtScore(Math.round(diff * 10) / 10)} 올라왔어요.${moved}`
      : direction === "down"
      ? `${base}보다 평균 ${Math.round(diff * 10) / 10} 내려갔어요.${moved} 내려간 날도 기록했다는 게 이미 한 걸음이에요.`
      : `${base}와 비슷한 자리를 지키고 있어요.${moved} 흔들리지 않은 것도 힘이에요.`;

  const headline =
    todayAvg === null && !b.todayDid.length
      ? direction === "up"
        ? "올라오던 흐름, 오늘도 이어가 봐요"
        : direction === "down"
        ? "어제 흔들렸어도, 오늘은 새 기록이에요"
        : "오늘 한 걸음만 보면 돼요"
      : direction === "up"
      ? "어제보다 조금 올라온 오늘이에요"
      : direction === "down"
      ? "내려갔지만, 기록은 멈추지 않았어요"
      : "제자리를 지킨 것도 움직임이에요";

  const highlights: string[] = [];
  const didAll = [...b.todayDid, ...recent.slice(-3).flatMap((r) => r.did)];
  if (didAll.length) highlights.push(`최근 한 행동: ${Array.from(new Set(didAll)).slice(0, 4).join(", ")}. 작은 행동이 쌓이면 방향이 바뀌어요.`);
  const rises: { label: string; d: number; note: string }[] = [];
  for (let i = 1; i < recent.length; i++) {
    for (const c of CATEGORIES) {
      const a = recent[i].record[c.id]?.score;
      const p = recent[i - 1].record[c.id]?.score;
      if (typeof a === "number" && typeof p === "number" && a - p >= 2) rises.push({ label: c.label, d: a - p, note: recent[i].record[c.id]?.note ?? "" });
    }
  }
  if (rises.length) {
    const r = rises.sort((a, b) => b.d - a.d)[0];
    highlights.push(`최근 ${r.label}이(가) ${fmtScore(r.d)} 크게 올라온 날이 있었어요${r.note ? `: "${r.note}"` : "."}`);
  }
  const pinned = b.memos.find((m) => m.pinned) ?? b.memos[0];
  if (pinned) highlights.push(`직접 남긴 메모예요: "${pinned.text.slice(0, 80)}"`);
  if (!highlights.length) highlights.push("아직 쌓인 게 적어요. 오늘 한 줄, 행동 하나만 남겨도 내일 브리핑이 달라져요.");

  const todaySched = b.schedule.filter((s) => s.date === b.date);
  const left = todaySched.filter((s) => !s.done);
  const schedule = todaySched.length
    ? `오늘 일정 ${todaySched.length}개${left.length < todaySched.length ? ` 중 ${todaySched.length - left.length}개 완료` : ""}: ${todaySched.map((s) => `${s.time ? s.time + " " : ""}${s.title}`).join(", ")}.`
    : "오늘은 일정이 비어 있어요. 여유도 일정이에요.";

  const goalsText = b.goals.length
    ? b.goals
        .slice(0, 2)
        .map((g) => {
          const done = g.steps.filter((s) => s.done).length;
          return `'${g.title}' ${g.steps.length ? `${done}/${g.steps.length} 단계까지 왔어요` : "아직 시작 단계예요"}`;
        })
        .join(", ") + "."
    : "진행 중인 목표가 없어요. 작게 하나 세워두면 하루에 방향이 생겨요.";

  let nextStep = "오늘 기분을 한 줄만 기록해 봐요.";
  const firstGoalStep = b.goals.flatMap((g) => g.steps.filter((s) => !s.done).map((s) => `'${g.title}'의 다음 단계, ${s.text}`))[0];
  if (left[0]) nextStep = `${left[0].time ? left[0].time + "에 " : ""}${left[0].title}, 이것 하나만 해보는 건 어때요.`;
  else if (firstGoalStep) nextStep = `${firstGoalStep}부터 시작해 보는 건 어때요.`;

  const questions = [
    "오늘 하루 중 가장 작게라도 올라온 순간은 언제였나요?",
    "오늘 내가 지켜낸 원칙이 하나 있다면 무엇인가요?",
    "어제의 나에게 오늘 한 행동 하나를 말해준다면요?",
    "오늘 내려간 게 있다면, 그 옆에 있던 것은 무엇이었나요?",
  ];
  const question = questions[new Date(b.date).getDate() % questions.length];

  return { headline, momentum: { direction, text: momentumText }, highlights: highlights.slice(0, 3), today: { schedule, goals: goalsText }, nextStep, question };
}

/* ---------- API 키 없을 때: 칭찬 / 사랑하기 ---------- */

function localPraise(b: Body): MomentData {
  const lines: string[] = [];
  const recent = b.recent;
  const didAll = Array.from(new Set([...b.todayDid, ...recent.slice(-3).flatMap((r) => r.did)]));
  if (didAll.length) lines.push(`최근 며칠 동안 ${josa(didAll.slice(0, 3).join(", "), "을", "를")} 직접 했어요. 아무도 시키지 않았는데 움직인 거예요.`);
  // 내려간 날에도 기록
  const lowDay = recent.find((r) => (avg(r.record) ?? 0) <= -2);
  if (lowDay) {
    const note = CATEGORIES.map((c) => lowDay.record[c.id]?.note).find(Boolean);
    lines.push(`${lowDay.date.slice(5).replace("-", "/")}처럼 힘든 날에도 기록을 남겼어요${note ? `: "${note}"` : "."} 내려간 날을 적어두는 건 쉬운 일이 아니에요.`);
  }
  // 올라온 날
  for (let i = 1; i < recent.length; i++) {
    for (const c of CATEGORIES) {
      const a = recent[i].record[c.id]?.score;
      const p = recent[i - 1].record[c.id]?.score;
      if (typeof a === "number" && typeof p === "number" && a - p >= 2) {
        const note = recent[i].record[c.id]?.note;
        lines.push(`${c.label}이(가) ${fmtScore(a - p)} 올라온 날이 있었어요${note ? `. 그날 쓴 말: "${note}"` : "."}`);
        i = recent.length;
        break;
      }
    }
  }
  const doneSteps = b.goals.flatMap((g) => g.steps.filter((s) => s.done).map((s) => `'${s.text}'`));
  if (doneSteps.length) lines.push(`목표에서 ${doneSteps.slice(0, 2).join(", ")}까지 끝냈어요. 큰 목표를 작게 쪼개서 실제로 체크한 사람은 생각보다 드물어요.`);
  const doneSched = b.schedule.filter((s) => s.done);
  if (doneSched.length) lines.push(`'${doneSched[0].title}' 일정을 해냈어요. 계획한 걸 실제로 한 거예요.`);
  const pinned = b.memos.find((m) => m.pinned);
  if (pinned) lines.push(`스스로 원칙을 세웠어요: "${pinned.text.slice(0, 60)}". 원칙을 글로 적어둔 것 자체가 자기를 돌보는 일이에요.`);
  if (!lines.length) lines.push("오늘 이 앱을 열고 자기를 돌아보려 한 것, 그게 첫 칭찬거리예요.");
  const recordedDays = recent.length + (Object.keys(b.today).length ? 1 : 0);
  return {
    title: recordedDays >= 3 ? `${recordedDays}일 동안 자기를 들여다본 사람이에요` : "오늘도 자기를 들여다봤어요",
    lines: lines.slice(0, 4),
    closing: "내일의 나는 오늘 한 작은 행동 위에서 시작해요.",
  };
}

function localLove(b: Body): MomentData {
  const lines: string[] = [];
  const bodyNotes = [...b.recent.map((r) => r.record.body?.note), b.today.body?.note].filter((n): n is string => Boolean(n));
  const lowSleep = bodyNotes.find((n) => /잠\s*(못|부족|안|[0-9]\s*시간)|못\s*잠|못\s*잤|피곤|졸려|새벽까지|밤새/.test(n));
  const coffee = bodyNotes.find((n) => /커피|카페인/.test(n));
  if (lowSleep) lines.push(`몸 기록에 ${josa(`"${lowSleep}"`, "이라고", "라고")} 썼어요. 오늘은 10분만 일찍 눕는 걸로 몸한테 미안함을 갚아봐도 좋아요.`);
  else if (coffee) lines.push(`${josa(`"${coffee}"`, "이라고", "라고")} 적어뒀죠. 오늘 커피 한 잔을 물이나 산책으로 바꾸면 그 메모가 몸을 지키는 방법이 돼요.`);
  else lines.push("오늘 밥 한 끼는 폰 없이, 맛을 느끼면서 먹어봐요. 몸한테 '너를 챙기고 있어'라고 말하는 가장 쉬운 방법이에요.");
  const mindNote = [b.today.mind?.note, ...b.recent.slice().reverse().map((r) => r.record.mind?.note)].find((n) => n && /불안|막막|힘들|못하|싫/.test(n));
  if (mindNote) lines.push(`${josa(`"${mindNote}"`, "이라고", "라고")} 쓴 날이 있어요. 친구가 그렇게 말했다면 "그럴 만했어"라고 했을 거예요. 오늘은 그 말을 나한테 해줘요.`);
  const pinned = b.memos.find((m) => m.pinned) ?? b.memos[0];
  if (pinned) lines.push(`직접 정한 원칙이 있어요: "${pinned.text.slice(0, 60)}". 이걸 지키는 건 자기를 통제하는 게 아니라 자기를 지키는 거예요.`);
  const todaySched = b.schedule.filter((s) => s.date === b.date && !s.done);
  if (todaySched.length >= 3) lines.push(`오늘 일정이 ${todaySched.length}개예요. 그중 하나는 못 해도 괜찮다고 미리 정해두면 하루가 덜 무거워요.`);
  else if (todaySched.length === 0) lines.push("오늘은 남은 일정이 없어요. 비어 있는 시간을 '아무것도 안 한 시간'이 아니라 '회복한 시간'이라고 불러줘요.");
  const relNote = [b.today.relation?.note, ...b.recent.slice().reverse().map((r) => r.record.relation?.note)].find(Boolean);
  if (relNote && lines.length < 4) lines.push(`관계 기록에 ${josa(`"${relNote}"`, "이", "가")} 있어요. 나를 사랑하는 건 혼자 버티는 게 아니라 한 사람에게 짧게 연락하는 걸로도 시작돼요.`);
  return {
    title: "오늘은 나를 친구처럼 대해봐요",
    lines: lines.slice(0, 4),
    closing: "잘하고 있어서가 아니라, 나라서 괜찮아요.",
  };
}

/* ---------- 메모로 나를 점검하기 ---------- */

function reviewText(b: Body): string {
  const memos = b.allMemos ?? [];
  const out: string[] = [];
  out.push(`[메모 전체 · ${memos.length}개 · 오래된 순]`);
  out.push(
    memos.length
      ? memos.map((m) => `[${m.date} · ${memoCatById(m.cat).label}${m.pinned ? " · 고정" : ""}] ${m.text.slice(0, 400)}`).join("\n")
      : "(없음)"
  );
  out.push("", `[오늘 ${b.date}]`);
  out.push(Object.keys(b.today).length || b.todayDid.length ? dayLine(b.date, b.today, b.todayDid) : "(오늘은 아직 기록 전)");
  const todayMemos = memos.filter((m) => m.date === b.date);
  if (todayMemos.length) out.push(`오늘 쓴 메모: ${todayMemos.map((m) => `"${m.text.slice(0, 200)}"`).join(" / ")}`);
  out.push("", "[최근 7일 기록]");
  out.push(b.recent.length ? b.recent.map((r) => dayLine(r.date, r.record, r.did)).join("\n") : "(없음)");
  if (b.goals.length) {
    out.push("", "[진행 중 목표]");
    out.push(b.goals.map((g) => `- ${g.title}${g.why ? ` (이유: "${g.why}")` : ""}`).join("\n"));
  }
  return out.join("\n");
}

/** 규칙 기반 점검: 오늘 쓴 글과 과거 메모의 단어 겹침으로 연결되는 다짐을 찾는다 */
function localReview(b: Body): ReviewData {
  const memos = (b.allMemos ?? []).slice().sort((a, c) => (a.date < c.date ? -1 : 1));
  const past = memos.filter((m) => m.date < b.date);
  const todayTexts = [
    ...memos.filter((m) => m.date === b.date).map((m) => m.text),
    ...CATEGORIES.map((c) => b.today[c.id]?.note ?? "").filter(Boolean),
    ...b.todayDid,
  ];
  // 흔한 말은 연결 근거로 삼지 않음
  const STOP = new Set(["오늘", "내일", "어제", "그때", "지금", "생각", "하루", "다시", "보기", "하기", "말기", "것이", "같은데", "같아도", "그냥", "조금", "많이", "정말", "너무", "오늘은", "오늘도", "나를", "내가", "나는", "있다", "없다", "했다", "한다", "것", "수", "더"]);
  const tokens = (t: string) =>
    new Set(
      t
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 2 && !STOP.has(w))
    );
  const todayTok = tokens(todayTexts.join(" "));
  const cautions: ReviewData["cautions"] = [];
  for (const m of past) {
    const common = [...tokens(m.text)].filter((w) => todayTok.has(w));
    if (common.length >= 2 || (common.length === 1 && m.pinned)) {
      const now = todayTexts.find((t) => [...tokens(t)].some((w) => common.includes(w))) ?? todayTexts[0] ?? "";
      cautions.push({
        past: `${m.date}: "${m.text.slice(0, 120)}"`,
        now: now ? `오늘: "${now.slice(0, 120)}"` : "오늘 기록",
        note: `그때 ${josa(`'${common[0]}'`, "을", "를")} 두고 이렇게 적어뒀어요. 오늘의 상황이 그때 정한 기준 안에 있는지 한 번만 확인해 봐요.`,
      });
      if (cautions.length >= 3) break;
    }
  }
  const changes: string[] = [];
  const byCat = new Map<MemoCat, DatedMemo[]>();
  for (const m of memos) byCat.set(m.cat, [...(byCat.get(m.cat) ?? []), m]);
  for (const [cat, list] of byCat) {
    if (list.length < 2) continue;
    const first = list[0];
    const last = list[list.length - 1];
    if (first.date === last.date) continue;
    changes.push(`${memoCatById(cat).label}: ${first.date}엔 "${first.text.slice(0, 50)}", ${last.date}엔 "${last.text.slice(0, 50)}".`);
    if (changes.length >= 3) break;
  }
  const span = memos.length >= 2 ? `${memos[0].date}부터 ${memos[memos.length - 1].date}까지 ${memos.length}개의 메모` : `${memos.length}개의 메모`;
  const growth = memos.length
    ? `${span}가 쌓였어요. ${cautions.length ? "오늘과 맞닿는 과거의 다짐이 있어요. 그 기준을 세운 것도, 오늘 다시 꺼내 본 것도 모두 당신이에요." : "오늘과 직접 맞닿는 과거 메모는 없었어요. 오늘 든 생각을 메모로 남겨두면 다음 점검 때 비교할 수 있어요."}`
    : "아직 메모가 없어요. 다짐이나 원칙을 메모해 두면, 나중에 오늘의 나가 그때의 나와 대화할 수 있어요.";
  return {
    headline: cautions.length ? "그때의 내가 오늘의 나에게 할 말이 있어요" : memos.length ? "오늘은 과거와 충돌하는 게 없어요" : "첫 메모부터 시작해요",
    cautions,
    changes,
    growth,
    question: "오늘 결정한 것 중, 1년 뒤의 나에게 미리 알려주고 싶은 기준이 있나요?",
  };
}

function parseReview(raw: string): ReviewData | null {
  const json = extractJson(raw);
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Partial<ReviewData>;
    if (!o.headline) return null;
    return {
      headline: String(o.headline),
      cautions: Array.isArray(o.cautions)
        ? o.cautions.slice(0, 5).map((c) => ({ past: String(c?.past ?? ""), now: String(c?.now ?? ""), note: String(c?.note ?? "") }))
        : [],
      changes: Array.isArray(o.changes) ? o.changes.map(String).slice(0, 5) : [],
      growth: String(o.growth ?? ""),
      question: String(o.question ?? ""),
    };
  } catch {
    return null;
  }
}

/** 응답에서 JSON 객체 하나를 최대한 관대하게 꺼낸다 (설명문·코드블록·앞뒤 잡음 허용, 잘린 꼬리는 복구 시도) */
function extractJson(raw: string): string | null {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  // 괄호 균형으로 끝 찾기
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  // 잘린 경우: 열린 문자열·괄호를 닫아서 시도
  let tail = cleaned.slice(start);
  if (inStr) tail += '"';
  tail = tail.replace(/,\s*$/, "");
  const opens = (tail.match(/\[/g) ?? []).length - (tail.match(/\]/g) ?? []).length;
  tail += "]".repeat(Math.max(0, opens));
  tail += "}".repeat(Math.max(0, depth));
  return tail;
}

function parseMoment(raw: string): MomentData | null {
  const json = extractJson(raw);
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Partial<MomentData>;
    if (!o.title || !Array.isArray(o.lines) || !o.lines.length) return null;
    return { title: String(o.title), lines: o.lines.map(String).slice(0, 5), closing: String(o.closing ?? "") };
  } catch {
    return null;
  }
}

/* ---------- 응답 검증 ---------- */

function parseBriefing(raw: string): BriefingData | null {
  const json = extractJson(raw);
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Partial<BriefingData>;
    if (!o.headline || !o.momentum?.text || !Array.isArray(o.highlights)) return null;
    const dir = o.momentum.direction;
    return {
      headline: String(o.headline),
      momentum: { direction: dir === "up" || dir === "down" ? dir : "flat", text: String(o.momentum.text) },
      highlights: o.highlights.map(String).slice(0, 4),
      today: { schedule: String(o.today?.schedule ?? ""), goals: String(o.today?.goals ?? "") },
      nextStep: String(o.nextStep ?? ""),
      question: String(o.question ?? ""),
    };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않아요" }, { status: 400 });
  }
  body.today ??= {};
  body.todayDid ??= [];
  body.recent = (body.recent ?? []).slice(-7);
  body.memos = (body.memos ?? []).slice(0, 20);
  body.goals = (body.goals ?? []).slice(0, 8);
  body.schedule = (body.schedule ?? []).slice(0, 20);

  body.allMemos = (body.allMemos ?? []).slice(-300);

  const mode: Mode = body.mode === "praise" || body.mode === "love" || body.mode === "review" ? body.mode : "briefing";
  const text = mode === "review" ? reviewText(body) : toPlainText(body);
  const crisis = hasCrisisSignal(text);

  const local = () =>
    mode === "praise"
      ? { moment: localPraise(body) }
      : mode === "love"
      ? { moment: localLove(body) }
      : mode === "review"
      ? { review: localReview(body) }
      : { briefing: localBriefing(body) };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ...local(), source: "local", crisis });
  }

  // 관리자가 덮어쓴 프롬프트가 있으면 사용 (길이 제한)
  const override = body.prompts?.[mode];
  const system = typeof override === "string" && override.trim() ? override.slice(0, PROMPT_MAX_LEN) : DEFAULT_PROMPTS[mode];
  const ask =
    mode === "praise"
      ? "기록을 읽고 나를 칭찬해줘."
      : mode === "love"
      ? "기록을 읽고 오늘 나를 사랑하는 방법을 알려줘."
      : mode === "review"
      ? "메모 전체와 오늘 기록을 읽고, 과거의 다짐과 오늘을 대조해 점검해줘."
      : "오늘의 나 브리핑을 만들어줘.";

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: mode === "review" ? 3000 : 2000,
      system,
      messages: [{ role: "user", content: `${ask}\n\n${text}` }],
    });
    const raw = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");
    if (mode === "briefing") {
      const briefing = parseBriefing(raw);
      if (!briefing) throw new Error(`JSON 파싱 실패: ${raw.slice(0, 200)}`);
      return NextResponse.json({ briefing, source: "ai", crisis });
    }
    if (mode === "review") {
      const review = parseReview(raw);
      if (!review) throw new Error(`JSON 파싱 실패: ${raw.slice(0, 200)}`);
      return NextResponse.json({ review, source: "ai", crisis });
    }
    const moment = parseMoment(raw);
    if (!moment) throw new Error(`JSON 파싱 실패: ${raw.slice(0, 200)}`);
    return NextResponse.json({ moment, source: "ai", crisis });
  } catch (e) {
    console.error(`today ${mode} failed`, e);
    return NextResponse.json({ ...local(), source: "local", crisis });
  }
}
