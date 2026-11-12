export interface PetAnswers {
  mood: string | null;
  intensity: number | null;
  reason: string | null;
  note: string | null;
  need: string | null;
}
export interface PetView {
  name: string; food: number; xp: number; level: number; levelStart: number; levelEnd: number;
  date: string; meals: number; earned: number; answers: PetAnswers; reward: number;
  points: number; homeId: number; ownedHomes: number[]; homes: PetHome[];
  appearance: string;
  /** 오늘 간식을 줬는지 (하루 한 번) */
  snacked?: boolean;
  /** 돌봄 상태 0~4 (2단계). 예전 서버 응답에는 없다 */
  warmth?: number; clean?: number; energy?: number;
  /** 오늘 목욕을 했는지 */
  bathed?: boolean;
  /** 이번 밤에 고른 불 상태 (밤이 아니거나 아직 안 골랐으면 없음) */
  lightsOff?: boolean;
  /** 온기·말끔함·기운이 모두 가득 */
  glow?: boolean;
}
export interface PetHome { id: number; name: string; level: number; cost: number; available: boolean }
export const EMPTY_ANSWERS: PetAnswers = { mood: null, intensity: null, reason: null, note: null, need: null };
export const PET_STEPS = ["마음", "크기", "이유", "한 조각", "필요한 것"];
export const PET_MOODS = ["편안해", "기뻐", "그저 그래", "지쳤어", "슬퍼", "불안해", "잘 모르겠어"];
export const PET_REASONS = ["나 자신", "일", "관계", "몸", "돈", "잘 모르겠어"];
export const PET_NEEDS = ["휴식", "위로", "정리", "함께 있기", "조용히 있기", "잘 모르겠어"];
export function answerCount(a: PetAnswers) { return [a.mood, a.intensity, a.reason, a.note?.trim(), a.need].filter(Boolean).length; }
export class PetError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function petRequest(path = "", body?: unknown, method = "PUT"): Promise<PetView> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`/api/pet${path}`, {
      signal: controller.signal,
      method: body === undefined ? "GET" : method, credentials: "same-origin", cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new PetError(response.status === 404 ? "모루의 방이 아직 준비 중이에요. 잠시 후 다시 만나 주세요." : response.status >= 500 ? "모루의 방에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." : data?.error || "저장하지 못했어요. 다시 시도해 주세요.", response.status);
    if (!data || typeof data.food !== "number" || !data.answers) throw new PetError("모루의 방을 다시 불러와 주세요.", 502);
    return { ...data, answers: { ...EMPTY_ANSWERS, ...data.answers } };
  } catch (error) {
    if (controller.signal.aborted) throw new PetError("연결이 늦어지고 있어요. 잠시 후 다시 눌러 주세요.", 408);
    if (error instanceof PetError) throw error;
    throw new PetError("연결이 끊겼어요. 작성한 마음은 그대로 있으니 다시 시도해 주세요.", 0);
  } finally {
    clearTimeout(timeout);
  }
}
