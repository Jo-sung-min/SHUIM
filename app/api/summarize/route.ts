import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { CATEGORIES, CategoryId, categoryById } from "@/lib/categories";
import { hasCrisisSignal } from "@/lib/crisis";
import type { DayRecord } from "@/lib/storage";

export const runtime = "nodejs";

interface Body {
  entries: { date: string; record: DayRecord }[];
  category: CategoryId | "all";
  days: number;
}

const SYSTEM = `너는 "마음 가속도"라는 기록 앱의 정리 도우미야.
사용자는 매일 카테고리(돈, 일·커리어, 관계, 몸, 마음)마다 -5~+5 점수와 한 줄 메모를 남겨.
이 앱의 관점은 "사람은 감정의 위치보다 변화(가속도)를 느낀다"는 거야.

정리할 때 지켜야 할 것:
- 사용자가 쓴 말을 최대한 그대로 인용하면서 흐름을 비춰줘. 새로운 해석을 단정하지 마.
- 점수의 높고 낮음보다, 크게 내려간 날과 다시 올라온 날, 그 사이에 무엇이 있었는지를 중심으로.
- 카테고리끼리의 연결이 기록에 보이면 짚어줘 (예: 돈이 흔들린 날 몸 점수도 같이 내려감). 단, 사용자가 쓰지 않은 원인을 지어내지 마.
- 진단, 병명, 투자 조언, 매수·매도 판단은 절대 하지 마.
- 잘 버틴 부분, 다시 올라온 순간은 구체적으로 알아봐줘.
- 따뜻하고 담백한 한국어 존댓말. 과장된 위로나 이모지 남발 금지.
- 형식: 짧은 문단 3~5개. 마지막엔 다음 기록 때 스스로에게 물어볼 만한 질문 하나.
- 기록에 스스로를 해치거나 삶을 끝내고 싶다는 표현이 있으면, 비난 없이 그 마음을 먼저 알아주고 자살예방상담전화 109(24시간)에 연락해보길 부드럽게 권해.`;

function toPlainText(body: Body): string {
  const cats = body.category === "all" ? CATEGORIES : [categoryById(body.category)];
  const lines: string[] = [];
  for (const { date, record } of body.entries) {
    const parts = cats
      .map((c) => {
        const e = record[c.id];
        if (!e) return null;
        const s = e.score > 0 ? `+${e.score}` : `${e.score}`;
        return `${c.label} ${s}${e.note ? ` "${e.note.slice(0, 300)}"` : ""}`;
      })
      .filter(Boolean);
    if (parts.length) lines.push(`${date} | ${parts.join(" / ")}`);
  }
  return lines.join("\n");
}

/** API 키가 없을 때 쓰는 간단한 규칙 기반 정리 */
function localSummary(body: Body): string {
  const cats = body.category === "all" ? CATEGORIES : [categoryById(body.category)];
  const out: string[] = [];
  for (const c of cats) {
    const pts = body.entries
      .map((e) => ({ date: e.date, s: e.record[c.id]?.score, note: e.record[c.id]?.note ?? "" }))
      .filter((p): p is { date: string; s: number; note: string } => typeof p.s === "number");
    if (pts.length < 2) continue;
    let worst = { d: 0, date: "", note: "" };
    let best = { d: 0, date: "", note: "" };
    for (let i = 1; i < pts.length; i++) {
      const d = pts[i].s - pts[i - 1].s;
      if (d < worst.d) worst = { d, date: pts[i].date, note: pts[i].note };
      if (d > best.d) best = { d, date: pts[i].date, note: pts[i].note };
    }
    const first = pts[0].s;
    const last = pts[pts.length - 1].s;
    const trend = last > first ? "올라오는 흐름" : last < first ? "내려가는 흐름" : "제자리를 지키는 흐름";
    let line = `${c.emoji} ${c.label}: ${first}에서 ${last}로, ${trend}이에요.`;
    if (worst.d < 0) line += ` 가장 크게 흔들린 건 ${worst.date}(${worst.d})${worst.note ? `, "${worst.note}"` : ""}.`;
    if (best.d > 0) line += ` 가장 크게 올라온 건 ${best.date}(+${best.d})${best.note ? `, "${best.note}"` : ""}.`;
    out.push(line);
  }
  if (!out.length) return "정리할 만큼 기록이 쌓이지 않았어요. 이틀 이상 기록하면 변화가 보이기 시작해요.";
  out.push("\n.env.local에 ANTHROPIC_API_KEY를 넣으면 AI가 기록 속 말들을 엮어서 더 자세히 정리해줘요.");
  return out.join("\n\n");
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않아요" }, { status: 400 });
  }
  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return NextResponse.json({ error: "정리할 기록이 없어요" }, { status: 400 });
  }
  body.entries = body.entries.slice(-60);

  const text = toPlainText(body);
  const crisis = hasCrisisSignal(text);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ summary: localSummary(body), source: "local", crisis });
  }

  try {
    const client = new Anthropic({ apiKey });
    const scope = body.category === "all" ? "전체 카테고리" : `${categoryById(body.category).label} 카테고리`;
    const msg = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 1200,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `최근 ${body.days}일, ${scope} 기록이야. 흐름을 정리해줘.\n\n${text}`,
        },
      ],
    });
    const summary = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();
    return NextResponse.json({ summary, source: "ai", crisis });
  } catch (e) {
    console.error("summarize failed", e);
    return NextResponse.json({ summary: localSummary(body), source: "local", crisis });
  }
}
