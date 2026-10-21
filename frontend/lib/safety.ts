"use client";

export async function fetchBlocks(): Promise<string[]> {
  const response = await fetch("/api/blocks", { credentials: "same-origin", cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "차단 목록을 불러오지 못했어요.");
  return result.userIds;
}

export async function setUserBlocked(userId: string, blocked: boolean) {
  const response = await fetch(blocked ? "/api/blocks" : `/api/blocks/${encodeURIComponent(userId)}`, {
    method: blocked ? "POST" : "DELETE", credentials: "same-origin",
    headers: blocked ? { "Content-Type": "application/json" } : undefined,
    body: blocked ? JSON.stringify({ userId }) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "차단 설정을 바꾸지 못했어요.");
}

export function confirmAiProcessing(): boolean {
  return window.confirm("AI 기능을 위해 선택한 기록·메모·목표·일정 등을 소로우 서버로 보냅니다. 분석하기에는 전체 메모가 포함될 수 있습니다. AI가 설정된 경우 Anthropic의 Claude API로 전송해 응답을 생성합니다. 응답은 의료 진단·치료가 아니며 틀릴 수 있습니다. 개인정보 처리방침(/privacy)에서 처리 내용을 확인할 수 있습니다. 이번 요청을 전송할까요?");
}
