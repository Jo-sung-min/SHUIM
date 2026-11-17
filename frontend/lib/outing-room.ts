/**
 * 방 안에서 나가는 외출 (docs/OUTINGS.md "방 안의 외출"): 풍경 속에 숨은 것들의 자리와, 눌렀을 때 친구가 하는 말.
 * 순수한 표다: 브라우저·저장소에 기대지 않는다 (scripts/outing-room.test.mjs 가 이 파일만 읽어 확인한다).
 * 활동의 규칙(열리는 날·걸리는 시간·보상)은 그대로 서버와 lib/outing.ts 의 OUTING_ACTIVITIES 가 정한다. 여기는 방 그림 위의 자리와 말뿐이다.
 *
 * 숨어 있다: 풍경에는 물건만 그려져 있고 이름표도 자물쇠도 없다. 누르면 친구가 그쪽으로 걸어가서 말해 준다.
 *  - 아직 열리지 않은 것: "조금 더 친해지면 같이 주울 수 있을 것 같아" 처럼, 날 수를 세지 않고 가까워지면 된다고만 말한다
 *  - 열린 것: 같이 할지 묻는다 (좋아 · 다음에)
 *  - 오늘 이미 한 것: 내일 또 오자고 한다
 * 자리는 방 그림과 같은 480×700 무대의 좌표다 (바닥 600, 방에 보이는 곳은 가로 80~400·세로 150~585).
 */
export type RoomPlace = "park" | "sea" | "mountain";
export interface RoomSpot {
  /** OUTING_ACTIVITIES 의 id */
  id: string;
  /** 눌리는 곳의 가운데와 크기 */
  x: number; y: number; w: number; h: number;
  /** 친구가 가서 서는 자리 (발끝) */
  sx: number; sy: number;
  /** 아직 열리지 않았을 때의 말 (첫날부터 열리는 것은 비어 있다) */
  locked: string;
  /** 열렸을 때 같이 하자고 묻는 말 */
  invite: string;
}
export const ROOM_PLACES: { id: RoomPlace; name: string; arrive: string }[] = [
  { id: "park", name: "오후의 공원", arrive: "공원이야. 아무 말 없이 앉아 있어도 좋아." },
  { id: "sea", name: "보랏빛 바다", arrive: "바다다. 오늘은 파도가 대신 이야기해 줄 거야." },
  { id: "mountain", name: "구름 위의 산", arrive: "여기까지 왔네. 온 것만으로도 충분해." },
];
export const roomPlace = (id: string | null | undefined) => ROOM_PLACES.find((p) => p.id === id);

/** 방에 보이는 무대의 범위와 친구가 걸을 수 있는 땅 */
export const STAGE = { left: 80, right: 400, top: 150, bottom: 585 };
export const GROUND = { top: 462, bottom: 585 };

export const ROOM_SPOTS: Record<RoomPlace, RoomSpot[]> = {
  park: [
    { id: "park-bench", x: 124, y: 470, w: 76, h: 58, sx: 204, sy: 524, locked: "", invite: "벤치가 비어 있어. 같이 앉을까?" },
    { id: "park-leaves", x: 262, y: 562, w: 64, h: 44, sx: 190, sy: 578, locked: "", invite: "잎이 쌓여 있네. 같이 주울까?" },
    { id: "park-picnic", x: 338, y: 520, w: 72, h: 50, sx: 258, sy: 552, locked: "돗자리가 깔려 있네. 조금 더 친해지면 같이 간식을 먹을 수 있을 것 같아.", invite: "돗자리다. 같이 간식 먹을까?" },
    { id: "park-boat", x: 224, y: 424, w: 60, h: 46, sx: 300, sy: 488, locked: "연못에 종이배가 떠 있어. 좀 더 가까워지면 우리도 하나 띄워 보자.", invite: "종이배 하나 접어서 띄울까?" },
    { id: "park-fireflies", x: 104, y: 548, w: 60, h: 50, sx: 198, sy: 574, locked: "풀숲에서 뭔가 깜빡였어. 더 오래 함께하면 저 불빛이 우리한테도 올 것 같아.", invite: "반딧불이야. 같이 찾아볼까?" },
    { id: "park-promise", x: 362, y: 330, w: 80, h: 150, sx: 296, sy: 496, locked: "큰 나무다. 아주 오래 함께한 사이가 되면 이 나무에 우리 이야기를 남기자.", invite: "우리 나무야. 약속 하나 남길까?" },
  ],
  sea: [
    { id: "sea-waves", x: 214, y: 440, w: 110, h: 44, sx: 214, sy: 486, locked: "", invite: "파도가 밀려와. 같이 듣고 있을까?" },
    { id: "sea-sand", x: 262, y: 544, w: 70, h: 46, sx: 190, sy: 566, locked: "", invite: "모래가 고와. 같이 그림 그릴까?" },
    { id: "sea-shells", x: 350, y: 562, w: 62, h: 44, sx: 298, sy: 546, locked: "조개가 반짝여. 조금 더 친해지면 같이 주울 수 있을 것 같아.", invite: "조개다. 같이 주울까?" },
    { id: "sea-letter", x: 142, y: 528, w: 60, h: 44, sx: 214, sy: 540, locked: "빈 병이 하나 있네. 마음을 꺼낼 만큼 가까워지면 편지를 넣어 보자.", invite: "병에 편지를 넣어 볼까?" },
    { id: "sea-stars", x: 196, y: 192, w: 150, h: 70, sx: 250, sy: 500, locked: "별이 떠 있어. 더 오래 함께하면 우리만의 별자리를 이을 수 있을 거야.", invite: "별을 이어 볼까?" },
    { id: "sea-promise", x: 366, y: 474, w: 56, h: 60, sx: 292, sy: 510, locked: "누가 돌을 쌓아 뒀네. 아주 오래 함께한 사이가 되면 우리 돌도 올리자.", invite: "우리 돌을 올릴까?" },
  ],
  mountain: [
    { id: "mountain-breath", x: 132, y: 448, w: 96, h: 56, sx: 232, sy: 506, locked: "", invite: "바람이 불어. 같이 숨 고를까?" },
    { id: "mountain-clouds", x: 236, y: 208, w: 110, h: 60, sx: 252, sy: 500, locked: "", invite: "구름이 느리게 가. 같이 볼까?" },
    { id: "mountain-tea", x: 206, y: 556, w: 64, h: 46, sx: 296, sy: 574, locked: "보온병이 놓여 있어. 좀 더 가까워지면 같이 따뜻한 차를 마시자.", invite: "차 한 잔 나눌까?" },
    { id: "mountain-echo", x: 352, y: 462, w: 56, h: 76, sx: 278, sy: 514, locked: "이정표가 있네. 마음을 꺼낼 만큼 가까워지면 산에 한마디 외쳐 보자.", invite: "산에 한마디 보내 볼까?" },
    { id: "mountain-sunrise", x: 364, y: 272, w: 80, h: 52, sx: 268, sy: 496, locked: "능선 뒤가 밝아. 더 오래 함께하면 해돋이를 같이 볼 수 있을 것 같아.", invite: "해가 올라와. 같이 볼까?" },
    { id: "mountain-stars", x: 128, y: 198, w: 80, h: 50, sx: 240, sy: 494, locked: "별이 가까워 보여. 더 오래 함께하면 별빛에 마음을 걸어 두자.", invite: "별빛, 같이 볼까?" },
  ],
};
export const roomSpot = (id: string): RoomSpot | undefined => Object.values(ROOM_SPOTS).flat().find((s) => s.id === id);

/** 풍경 속 그것의 지금: 숨은 채 잠겨 있는지, 같이 할 수 있는지, 오늘 이미 했는지 */
export type SpotState = "locked" | "open" | "done";
export function spotState(id: string, view: { unlocked: string[]; completedToday: string[] }): SpotState {
  if (!view.unlocked.includes(id)) return "locked";
  return view.completedToday.includes(id) ? "done" : "open";
}
/** 오늘 이미 한 것을 다시 눌렀을 때 · 빈 땅을 눌러 걸어갔을 때 · 친구를 눌렀을 때 · 처음 나왔을 때 덧붙이는 말 */
export const DONE_LINES = ["오늘은 여기서 충분히 있었어. 내일 또 오자.", "여기는 오늘 다녀갔지. 좋았어."];
export const WALK_LINES = ["여기도 좋다.", "천천히 걷자.", "바람이 좋아."];
export const POKE_LINES = ["네가 불러 주니까 좋다.", "같이 나와서 좋아.", "여기저기 눌러 봐. 뭐가 있을지도 몰라."];
export const LOOK_HINT = "여기저기 눌러 봐.";
export const DECLINE_LINE = "응. 다음에 하자.";
export const LEAVE_LINE = "다녀왔어. 방이 따뜻하다.";
/** 친구가 서는 자리의 깊이에 따른 크기: 멀리(위) 설수록 작다 */
export const walkerScale = (sy: number): number => Math.round((0.72 + (Math.max(GROUND.top, Math.min(GROUND.bottom, sy)) - GROUND.top) / (GROUND.bottom - GROUND.top) * 0.28) * 100) / 100;
/** 빈 땅을 눌렀을 때 친구가 갈 자리: 걸을 수 있는 땅 안으로 맞춘다 */
export function walkTarget(x: number, y: number): { sx: number; sy: number } {
  return { sx: Math.round(Math.max(STAGE.left + 40, Math.min(STAGE.right - 40, x))), sy: Math.round(Math.max(GROUND.top + 14, Math.min(GROUND.bottom - 6, y))) };
}
/** 가만히 두면 친구가 혼자 몇 걸음 걷는다: 지금 자리에서 옆으로 조금(48~118), 가장자리에서는 돌아선다. a·b 는 0~1 의 난수 */
export function strollTarget(sx: number, a: number, b: number): { sx: number; sy: number } {
  const step = (a < 0.5 ? -1 : 1) * (48 + Math.abs(a - 0.5) * 140);
  const x = sx + step < STAGE.left + 50 || sx + step > STAGE.right - 50 ? sx - step : sx + step;
  return walkTarget(x, GROUND.top + 26 + b * (GROUND.bottom - GROUND.top - 40));
}
/** 함께하는 동안 몇 번째 말을 할 차례인지 (4초마다 하나씩, 마지막 말에서 멈춘다) */
export const lineIndex = (elapsedMs: number, count: number): number => Math.max(0, Math.min(count - 1, Math.floor(elapsedMs / 4000)));
