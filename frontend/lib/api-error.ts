/**
 * API 오류 문구 하나로: 서버가 {"error": "..."} 를 주면(429 요청 제한·403 권한 포함) 그 문구를 그대로 보여 주고,
 * 본문이 없거나 JSON 이 아니면(프록시의 HTML 413·502 등) 상태 코드에 맞는 짧은 안내를 쓴다.
 */
export function apiErrorMessage(status: number, body: unknown, fallback = "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."): string {
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (status === 429) return "요청이 많아요. 잠시 후 다시 시도해 주세요.";
  if (status === 413) return "보낼 내용이 너무 커요. 조금 줄인 뒤 다시 시도해 주세요.";
  if (status === 401) return "로그인이 필요해요. 다시 로그인해 주세요.";
  if (status === 403) return "이 작업을 할 수 있는 권한이 없어요.";
  if (status >= 500) return "서버에 잠시 문제가 있어요. 잠시 후 다시 시도해 주세요.";
  return fallback;
}
