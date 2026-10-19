import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { CATEGORIES, MemoCat, memoCatById } from "@/lib/categories";
import { hasCrisisSignal } from "@/lib/crisis";
import type { BriefingData, DayRecord, MomentData, MomentMode } from "@/lib/storage";

export const runtime = "nodejs";

type Mode = "briefing" | MomentMode;

interface Body {
  mode?: Mode;
  date: string;
  today: DayRecord;
  todayDid: string[];
  recent: { date: string; record: DayRecord; did: string[] }[]; // 오래된 순, 오늘 제외
  memos: { cat: MemoCat; text: string; pinned: boolean }[];
  goals: { title: string; cat: MemoCat; why: string; due?: string; steps: { text: string; done: boolean }[] }[];
  schedule: { date: string; time?: string; title: string; cat: MemoCat; done: boolean }[];
}

const SYSTEM = `너는 "마음 가속도" 앱의 "오늘의 나" 브리핑 작성자야.
이 앱의 철학: 사람은 감정의 위치가 아니라 변화(가속도)를 느낀다. 불안은 막연한 미래와 지금 위치를 자꾸 재는 데서 온다.
그래서 브리핑은 "지금 어디 있나"가 아니라 "어느 방향으로 얼마나 움직였고, 오늘 어디로 한 걸음 갈 수 있나"를 보여줘야 해.

입력: 사용자의 최근 기록(카테고리별 -5~+5 점수와 한 줄 메모, 오늘 한 행동), 카테고리별 메모, 진행 중인 목표, 오늘과 다가오는 일정.

반드시 지킬 것:
- 사용자가 직접 쓴 말을 인용해서 비춰줘. 기록에 없는 원인이나 사실을 지어내지 마.
- 긍정적인 방향으로 속도를 붙여주되, 과장된 위로·근거 없는 낙관·이모지 남발은 금지. 담백하고 따뜻한 존댓말.
- 떨어진 날이 있어도 "다시 올라온 순간", "그래도 한 행동", "지켜낸 것"을 먼저 알아봐줘.
- 메모(특히 고정된 메모)는 사용자가 스스로 정한 원칙이야. 오늘 상황과 연결되는 메모가 있으면 그 말을 그대로 돌려줘.
- 목표는 "남은 것"보다 "이미 한 단계"를 먼저 말하고, 오늘 할 수 있는 가장 작은 다음 단계 하나만 제안해.
- 일정은 사실대로 정리하고, 부담 주는 말은 하지 마. 비어 있으면 그것도 괜찮다고 말해.
- 진단, 병명, 투자 조언, 매수·매도 판단 절대 금지. 주식·돈 얘기가 있으면 "자주 안 보기로 한 원칙" 같은 사용자의 결정을 지지하는 방향으로만.
- 기록에 스스로를 해치거나 삶을 끝내고 싶다는 표현이 있으면, 비난 없이 그 마음을 먼저 알아주고 자살예방상담전화 109(24시간)를 headline이나 highlights 첫 줄에서 부드럽게 권해.

출력은 아래 JSON 하나만. 코드블록이나 다른 텍스트 없이.
{
  "headline": "오늘의 방향을 한 문장으로 (20~40자, 사용자의 말이나 행동을 담아서)",
  "momentum": { "direction": "up" | "flat" | "down", "text": "어제(직전 기록) 대비 흐름을 1~2문장으로. 어떤 카테고리가 움직였는지 구체적으로" },
  "highlights": ["기록·메모·행동에서 뽑은 긍정적 포인트 2~3개, 각 1~2문장, 가능하면 사용자의 말 인용"],
  "today": { "schedule": "오늘 일정 1~2문장", "goals": "목표 진행 1~2문장 (이미 한 단계 먼저)" },
  "nextStep": "지금 바로 할 수 있는 가장 작은 행동 하나 (한 문장, 명령형 말고 제안형)",
  "question": "오늘 저녁 기록할 때 스스로에게 물어볼 질문 하나"
}`;

const COMMON = `입력: 사용자의 최근 기록(카테고리별 -5~+5 점수와 한 줄 메모, 오늘 한 행동), 카테고리별 메모, 진행 중인 목표, 오늘과 다가오는 일정.
공통 규칙:
- 사용자가 직접 쓴 말, 실제로 한 행동, 체크한 단계만 근거로 삼아. 기록에 없는 사실을 지어내지 마.
- 담백하고 따뜻한 한국어 존댓말. 과장, 빈말, 이모지 남발 금지.
- 진단, 병명, 투자 조언, 매수·매도 판단 절대 금지.
- 기록에 스스로를 해치거나 삶을 끝내고 싶다는 표현이 있으면, 비난 없이 그 마음을 먼저 알아주고 자살예방상담전화 109(24시간)를 첫 줄에서 부드럽게 권해.
출력은 아래 JSON 하나만. 코드블록이나 다른 텍스트 없이.`;

const SYSTEM_PRAISE = `너는 "마음 가속도" 앱에서 "나를 칭찬하기" 버튼을 눌렀을 때 답하는 사람이야.
사용자는 지금 자기가 뭘 잘했는지 스스로는 잘 안 보이는 상태야. 기록을 샅샅이 읽고, 본인이 사소하다고 넘겼을 것들을 구체적으로 짚어서 칭찬해줘.
${COMMON}
칭찬 규칙:
- "대단해요" 같은 막연한 말 금지. 반드시 날짜·행동·메모 속 말을 인용해서 "무엇을" 했는지 짚어.
- 결과보다 과정과 선택을 칭찬해. 특히 내려간 날에도 기록한 것, 원칙(메모)을 지킨 것, 목표 단계를 하나라도 체크한 것, 일정을 완료한 것.
- 점수가 낮아도 비교 대상은 어제의 본인뿐. 남과 비교하지 마.
{
  "title": "오늘의 칭찬을 한 문장으로 (사용자의 행동이 들어간 20~35자)",
  "lines": ["구체적인 칭찬 3~4개, 각 1~2문장, 근거가 되는 사용자의 말이나 행동 인용"],
  "closing": "마지막 한마디 (1문장, 내일의 나에게 건네는 말)"
}`;

const SYSTEM_LOVE = `너는 "마음 가속도" 앱에서 "나를 사랑하기" 버튼을 눌렀을 때 답하는 사람이야.
사용자는 자신에게 자주 엄격하고, 불안할 때 자기를 몰아세우는 편이야. 기록을 읽고, 이 사람이 "오늘 자기 자신을 사랑하는 구체적인 방법"을 알려줘.
${COMMON}
사랑하기 규칙:
- 일반론("자신을 아껴주세요") 금지. 기록에서 본 이 사람의 몸 상태(잠, 떨림, 커피), 마음 메모, 관계, 오늘 일정을 바탕으로 이 사람에게만 맞는 방법을 제안해.
- 각 방법은 오늘 안에 10분 이내로 할 수 있을 만큼 작게. 명령형 말고 제안형.
- 사용자가 스스로에게 가혹하게 쓴 말이 있으면, 그 말을 친구에게라면 어떻게 바꿔 말할지 보여줘.
- 메모에 본인이 정한 원칙이 있으면 그걸 "자기를 지키는 방법"으로 다시 돌려줘.
{
  "title": "오늘 나를 사랑하는 방향을 한 문장으로 (20~35자)",
  "lines": ["오늘 할 수 있는 구체적인 방법 3~4개, 각 1~2문장, 기록 속 근거 포함"],
  "closing": "마지막 한마디 (1문장, 자기 자신에게 해주는 말)"
}`;

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

function parseMoment(raw: string): MomentData | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    const o = JSON.parse(cleaned.slice(start, end + 1)) as Partial<MomentData>;
    if (!o.title || !Array.isArray(o.lines) || !o.lines.length) return null;
    return { title: String(o.title), lines: o.lines.map(String).slice(0, 5), closing: String(o.closing ?? "") };
  } catch {
    return null;
  }
}

/* ---------- 응답 검증 ---------- */

function parseBriefing(raw: string): BriefingData | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    const o = JSON.parse(cleaned.slice(start, end + 1)) as Partial<BriefingData>;
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

  const mode: Mode = body.mode === "praise" || body.mode === "love" ? body.mode : "briefing";
  const text = toPlainText(body);
  const crisis = hasCrisisSignal(text);

  const local = () =>
    mode === "praise"
      ? { moment: localPraise(body) }
      : mode === "love"
      ? { moment: localLove(body) }
      : { briefing: localBriefing(body) };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ...local(), source: "local", crisis });
  }

  const system = mode === "praise" ? SYSTEM_PRAISE : mode === "love" ? SYSTEM_LOVE : SYSTEM;
  const ask = mode === "praise" ? "기록을 읽고 나를 칭찬해줘." : mode === "love" ? "기록을 읽고 오늘 나를 사랑하는 방법을 알려줘." : "오늘의 나 브리핑을 만들어줘.";

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 1000,
      system,
      messages: [{ role: "user", content: `${ask}\n\n${text}` }],
    });
    const raw = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");
    if (mode === "briefing") {
      const briefing = parseBriefing(raw);
      if (!briefing) throw new Error("JSON 파싱 실패");
      return NextResponse.json({ briefing, source: "ai", crisis });
    }
    const moment = parseMoment(raw);
    if (!moment) throw new Error("JSON 파싱 실패");
    return NextResponse.json({ moment, source: "ai", crisis });
  } catch (e) {
    console.error(`today ${mode} failed`, e);
    return NextResponse.json({ ...local(), source: "local", crisis });
  }
}
