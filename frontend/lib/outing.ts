/** The same milestones and activity IDs are validated by OutingRules on the server. */
export type OutingPlace = "park" | "sea" | "mountain";
export type ActivityKind = "rest" | "collect" | "picnic" | "write" | "stars" | "draw" | "breath";
export interface OutingActivity {
  id: string; place: OutingPlace; name: string; detail: string; day: number; seconds: number;
  kind: ActivityKind; icon: string; x: number; y: number; lines: string[]; keepsake: string;
}
export const OUTING_PLACES = {
  park: { id: "park", name: "공원에 앉아 있기", short: "오후의 공원", english: "A LITTLE GREEN", description: "나뭇잎 사이로, 마음에도 햇살이.", whisper: "아무 말 없이 앉아 있어도 좋아.", image: "/outing/park.webp", color: "#758b69", mood: "햇살 · 나뭇잎 · 작은 벤치" },
  sea: { id: "sea", name: "바다 보러 가기", short: "보랏빛 바다", english: "BY THE SEA", description: "다 말하지 못한 마음은 파도에게.", whisper: "오늘은 파도가 대신 이야기해 줄 거야.", image: "/outing/sea.webp", color: "#778db1", mood: "파도 · 조개껍데기 · 노을" },
  mountain: { id: "mountain", name: "산에 앉아 있기", short: "구름 위의 산", english: "ABOVE THE CLOUDS", description: "멀리 바라보면, 조금 가벼워질까.", whisper: "여기까지 온 것만으로도 충분해.", image: "/outing/mountain.webp", color: "#8c89aa", mood: "산바람 · 따뜻한 차 · 먼 능선" },
} as const;
export const OUTING_MILESTONES = [
  { day: 0, level: 1, name: "처음 나란히", gift: "세 곳의 풍경과 조용히 쉬기" },
  { day: 7, level: 2, name: "조금 가까이", gift: "작은 피크닉 · 조개 모으기" },
  { day: 14, level: 3, name: "익숙한 발걸음", gift: "종이배 띄우기 · 산에서 마시는 차" },
  { day: 30, level: 4, name: "마음을 꺼내는 사이", gift: "바다에 띄우는 편지 · 산울림" },
  { day: 50, level: 5, name: "함께여서 좋은", gift: "반딧불 정원 · 둘이 보는 해돋이" },
  { day: 75, level: 6, name: "별을 나누는 사이", gift: "해변의 별자리 · 산 위의 별빛" },
  { day: 100, level: 7, name: "나의 오래된 친구", gift: "우리의 나무 · 100일의 약속" },
] as const;

export const OUTING_ACTIVITIES: OutingActivity[] = [
  { id: "park-bench", place: "park", name: "나란히 앉기", detail: "벤치 한쪽을 너에게 남겨 뒀어.", day: 0, seconds: 12, kind: "rest", icon: "bench", x: 20, y: 58, lines: ["오늘은 뭘 하지 않아도 돼.", "나뭇잎 소리, 들려?", "네 옆이라서 이 자리가 좋아."], keepsake: "햇살이 앉았던 자리" },
  { id: "park-leaves", place: "park", name: "나뭇잎 줍기", detail: "마음에 드는 잎 세 장을 골라 봐.", day: 0, seconds: 12, kind: "collect", icon: "leaf", x: 61, y: 77, lines: ["같은 초록도 전부 다르네.", "이 잎은 네가 좋아할 것 같았어.", "작은 걸 같이 발견해서 좋아."], keepsake: "초록빛 잎사귀" },
  { id: "park-picnic", place: "park", name: "작은 피크닉", detail: "돗자리 펴고, 좋아하는 간식 하나.", day: 7, seconds: 16, kind: "picnic", icon: "cup", x: 74, y: 62, lines: ["네 몫도 챙겨 왔어.", "별일 없는 오후도 같이 있으면 특별해.", "다음에도 이 자리에 오자."], keepsake: "둘이 나눈 작은 소풍" },
  { id: "park-boat", place: "park", name: "종이배 띄우기", detail: "놓아주고 싶은 마음을 접어 띄워요.", day: 14, seconds: 16, kind: "write", icon: "boat", x: 48, y: 49, lines: ["접힌 마음도 천천히 펴질 거야.", "적지 않고 그냥 보내도 괜찮아.", "저 멀리 갈 때까지 같이 볼게."], keepsake: "연못에 띄운 종이배" },
  { id: "park-fireflies", place: "park", name: "반딧불 정원", detail: "풀숲에 숨은 작은 불빛을 찾아요.", day: 50, seconds: 20, kind: "stars", icon: "spark", x: 32, y: 71, lines: ["어두워지니까 보이는 것도 있네.", "작아도 빛은 빛이구나.", "우리도 이렇게 조금씩 반짝이자."], keepsake: "손끝에 머문 반딧불" },
  { id: "park-promise", place: "park", name: "우리의 나무", detail: "백 번의 외출, 다음 계절의 약속.", day: 100, seconds: 20, kind: "write", icon: "tree", x: 86, y: 45, lines: ["벌써 백 번이나 나란히 걸었네.", "빠르지 않아도, 여기까지 왔어.", "다음 계절에도 네 옆에 있을게."], keepsake: "우리의 100일 나무" },
  { id: "sea-waves", place: "sea", name: "파도 듣기", detail: "밀려오고, 멀어지는 소리에 기대요.", day: 0, seconds: 12, kind: "rest", icon: "wave", x: 30, y: 58, lines: ["밀려오는 마음도, 언젠가 잦아들 거야.", "지금은 파도만 세어 보자.", "이 바다를 너랑 보고 싶었어."], keepsake: "파도 한 조각" },
  { id: "sea-sand", place: "sea", name: "모래에 그리기", detail: "손끝으로 그려도, 지워도 괜찮아요.", day: 0, seconds: 12, kind: "draw", icon: "pen", x: 57, y: 78, lines: ["아무렇게나 그려도 좋아.", "파도가 지워도 그린 순간은 남잖아.", "완벽하지 않아서 더 네 것 같아."], keepsake: "모래 위의 낙서" },
  { id: "sea-shells", place: "sea", name: "조개 모으기", detail: "오늘의 바다를 닮은 조개 세 개.", day: 7, seconds: 16, kind: "collect", icon: "shell", x: 79, y: 75, lines: ["작은 조개에도 바다 소리가 있을까?", "이 색은 오늘 하늘이랑 닮았네.", "돌아가서도 오늘을 기억하자."], keepsake: "보랏빛 조개껍데기" },
  { id: "sea-letter", place: "sea", name: "바다에 편지 쓰기", detail: "누구에게도 보내지 않아도 되는 편지.", day: 30, seconds: 16, kind: "write", icon: "letter", x: 65, y: 60, lines: ["말이 잘 안 나오면 한 단어도 좋아.", "이 편지는 우리만 간직하자.", "네 마음을 들려줘서 고마워."], keepsake: "유리병 속 작은 편지" },
  { id: "sea-stars", place: "sea", name: "별자리 잇기", detail: "바다 위의 별 다섯 개를 이어 봐요.", day: 75, seconds: 20, kind: "stars", icon: "star", x: 37, y: 26, lines: ["우리만 아는 별자리를 만들까?", "떨어져 있는 별도 이어지네.", "네가 있어서 오늘 밤이 덜 어두워."], keepsake: "둘이 만든 별자리" },
  { id: "sea-promise", place: "sea", name: "100일의 약속", detail: "함께한 시간에게 건네는 한마디.", day: 100, seconds: 20, kind: "write", icon: "heart", x: 86, y: 52, lines: ["처음 여기 왔던 날, 기억나?", "백 번의 하루가 우리를 여기로 데려왔네.", "이제 아무 말 없이도 네 자리를 알아."], keepsake: "백 번째 바다의 약속" },
  { id: "mountain-breath", place: "mountain", name: "산바람에 숨 고르기", detail: "크게 애쓰지 말고, 편안한 만큼만.", day: 0, seconds: 16, kind: "breath", icon: "wind", x: 22, y: 64, lines: ["숨을 천천히 들이쉬고.", "조금 더 천천히 내쉬어 봐.", "이 순간만큼은 아무 데도 안 가도 돼."], keepsake: "산바람 한 줌" },
  { id: "mountain-clouds", place: "mountain", name: "구름 바라보기", detail: "바쁘지 않은 구름을 따라 쉬어 가요.", day: 0, seconds: 12, kind: "rest", icon: "cloud", x: 55, y: 47, lines: ["구름은 목적지가 없어도 잘 흘러가네.", "우리도 잠깐은 그래도 되겠지.", "같이 멀리 봐 줘서 고마워."], keepsake: "이름 없는 구름" },
  { id: "mountain-tea", place: "mountain", name: "따뜻한 차 나누기", detail: "작은 보온병에 담아 온 온기.", day: 14, seconds: 16, kind: "picnic", icon: "cup", x: 42, y: 75, lines: ["손이 시려울까 봐 가져왔어.", "따뜻할 때 한 모금 마시자.", "너랑 있으면 마음도 데워지는 것 같아."], keepsake: "산 위에서 나눈 온기" },
  { id: "mountain-echo", place: "mountain", name: "마음의 산울림", detail: "멀리 보내고 싶은 말을 한 줄 남겨요.", day: 30, seconds: 16, kind: "write", icon: "mountain", x: 75, y: 58, lines: ["작게 말해도 나는 들을 수 있어.", "산이 네 마음을 오래 받아 줄 거야.", "다 털어놓지 않아도 괜찮아."], keepsake: "멀리 보낸 한마디" },
  { id: "mountain-sunrise", place: "mountain", name: "둘이 보는 해돋이", detail: "어제와 다른 빛이 천천히 번져요.", day: 50, seconds: 20, kind: "rest", icon: "sun", x: 67, y: 34, lines: ["조금씩 밝아지고 있어.", "기다린 만큼 오늘 빛은 다르네.", "내일도 이런 순간이 하나쯤 있기를."], keepsake: "함께 맞은 첫 햇살" },
  { id: "mountain-stars", place: "mountain", name: "산 위의 별빛", detail: "먼 별에 오늘의 마음을 걸어 둬요.", day: 75, seconds: 20, kind: "stars", icon: "star", x: 37, y: 24, lines: ["도시에서는 못 보던 별들이야.", "멀리서도 이렇게 잘 빛나네.", "오늘도 여기까지 함께 와 줬구나."], keepsake: "주머니 속 산별" },
];

export function outingLevel(days: number) { return OUTING_MILESTONES.filter(m => days >= m.day).length || 1; }
export function activityUnlocked(activity: OutingActivity, affinity: number, xp: number) { return affinity >= activity.day * 10 && xp >= activity.day * 20; }
export function isOutingPlace(value: string | null): value is OutingPlace { return value === "park" || value === "sea" || value === "mountain"; }
export interface OutingView {
  days: number; affinity: number; xp: number; level: number; date: string; rewardedToday: boolean;
  unlocked: string[]; completedToday: string[]; memories: { day: string; actionId: string; note: string }[];
  rewardAffinity: number; rewardXp: number;
  companion?: { name: string; appearance: string };
}
export interface OutingSession { token: string; actionId: string; readyAt: number; serverTime: number }
export const EMPTY_OUTING: OutingView = { days: 0, affinity: 0, xp: 0, level: 1, date: "", rewardedToday: false, unlocked: OUTING_ACTIVITIES.filter(a => a.day === 0).map(a => a.id), completedToday: [], memories: [], rewardAffinity: 0, rewardXp: 0 };
export class OutingError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function outingRequest<T>(path = "", body?: unknown, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, 15000);
  try {
    const res = await fetch(`/api/outings${path}`, { method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new OutingError(json?.error ?? (res.status === 404 ? "외출 준비가 아직 끝나지 않았어요. 잠시 후 다시 와 주세요." : "외출 기록을 연결하지 못했어요. 다시 시도해 주세요."), res.status);
    if (!json || (path === "/start" ? typeof json.token !== "string" || !Number.isFinite(json.readyAt) || !Number.isFinite(json.serverTime) : !Number.isInteger(json.days) || !Array.isArray(json.unlocked) || !Array.isArray(json.memories))) throw new OutingError("외출 기록을 다시 불러와 주세요.", 502);
    return json as T;
  } catch (error) {
    if (error instanceof OutingError) throw error;
    throw new OutingError(controller.signal.aborted ? "연결이 늦어지고 있어요. 잠시 후 다시 눌러 주세요." : "연결을 확인해 주세요. 저장되지 않은 활동은 다시 시도할 수 있어요.", 0);
  } finally { clearTimeout(timeout); signal?.removeEventListener("abort", cancel); }
}

/** Prefer genuinely empty maps, then the least occupied map that still has room. */
export function chooseOutingMap<T extends { count: number; capacity: number }>(maps: T[]): T | null {
  return maps.filter(m => Number.isInteger(m.count) && m.count >= 0 && Number.isInteger(m.capacity) && m.count < m.capacity)
    .sort((a, b) => a.count - b.count)[0] ?? null;
}
