/**
 * 캐릭터마다 다른 말. 순수한 표다: 브라우저·저장소에 기대지 않는다 (scripts/moru-lines.test.mjs 가 이 파일만 읽어 확인한다).
 * 자기 몸에 없는 것을 말하지 않는다: 새싹은 모루만, 깃털·날개는 모링만, 리본은 노아, 망토는 레오, 베레모는 루미.
 * 말투는 모두 같다 (lib/moru.ts 머리말): 짧은 반말, 탓하거나 재촉하지 않는다. 표에 없는 모습은 모루의 말을 쓴다.
 */
export type LinesByLook = Record<string, string[]>;
export const LOOKS = ["moru", "noa", "leo", "lumi", "moring"] as const;
const pick = (table: LinesByLook, appearance: string): string[] => table[appearance] ?? table.moru;

/** 문질러 간질이기 */
export const TICKLE_BY: LinesByLook = {
  moru: ["히히. 간지러워.", "새싹까지 간지러워.", "…히히, 그만."],
  noa: ["히히. 간지러워.", "리본이 풀리겠어.", "…히히, 그만."],
  leo: ["하하. 간지러워.", "망토 속까지 간지러워.", "…항복, 항복."],
  lumi: ["히히. 간지러워.", "베레모가 떨어지겠어.", "…히히, 이제 그만."],
  moring: ["삐삐. 간지러워.", "깃털이 다 일어났어.", "…히히, 날개 밑은 안 돼."],
};
export const tickleLines = (appearance: string) => pick(TICKLE_BY, appearance);

/** 길게 눌러 안아 주기 */
export const HUG_BY: LinesByLook = {
  moru: ["…따뜻해.", "조금만 이대로 있자.", "네 손, 포근해."],
  noa: ["…따뜻해.", "조금만 이대로 있자.", "달빛보다 네 손이 좋아."],
  leo: ["…따뜻해.", "조금만 이대로 있자.", "망토보다 포근해."],
  lumi: ["…따뜻해.", "조금만 이대로 있자.", "별빛처럼 따뜻해."],
  moring: ["…따뜻해.", "솜털 속까지 따뜻해.", "네 손, 둥지 같아."],
};
export const hugLines = (appearance: string) => pick(HUG_BY, appearance);

/** 목욕 */
export const BATH_BY: LinesByLook = {
  moru: ["보글보글. 따뜻해.", "새싹까지 말끔해졌어.", "…비누 냄새, 좋다."],
  noa: ["보글보글. 따뜻해.", "머리카락까지 말끔해졌어.", "…비누 냄새, 좋다."],
  leo: ["보글보글. 따뜻해.", "망토도 같이 빨아야겠다.", "…비누 냄새, 좋다."],
  lumi: ["보글보글. 따뜻해.", "베레모는 잠깐 벗어 뒀어.", "…비누 냄새, 좋다."],
  moring: ["보글보글. 따뜻해.", "깃털이 뽀송해졌어.", "…파드득. 물 튀었어?"],
};
export const bathLines = (appearance: string) => pick(BATH_BY, appearance);

/** 가벼운 날(기분 4)의 혼잣말 첫 줄: 가벼워진 것이 캐릭터마다 다르다 */
export const LIGHT_MURMUR_BY: Record<string, string> = {
  moru: "오늘은 새싹이 좀 가벼워.",
  noa: "오늘은 발걸음이 좀 가벼워.",
  leo: "오늘은 망토가 좀 가벼워.",
  lumi: "오늘은 발걸음이 좀 가벼워.",
  moring: "오늘은 깃털이 좀 가벼워.",
};
export const lightMurmur = (appearance: string): string => LIGHT_MURMUR_BY[appearance] ?? LIGHT_MURMUR_BY.moru;

/** 칭찬을 기다리는 동안 돌려 말하는 문장. 같은 모습이면 늘 같은 배열을 돌려준다 (말풍선이 그 배열을 따라 넘어간다) */
const praise = (noticed: string): string[] => ["네 하루를 천천히 읽고 있어.", noticed, "네가 지나친 작은 좋은 점을 줍고 있어.", "조금만 기다려 줘. 꼭 말해 주고 싶은 게 있어."];
export const PRAISE_WAITING_BY: LinesByLook = {
  moru: praise("새싹이 살짝 흔들렸어. 좋은 걸 찾았나 봐."),
  noa: praise("리본이 살짝 흔들렸어. 좋은 걸 찾았나 봐."),
  leo: praise("눈이 반짝했어. 좋은 걸 찾았나 봐."),
  lumi: praise("베레모의 별이 반짝했어. 좋은 걸 찾았나 봐."),
  moring: praise("꼬리 깃이 살짝 흔들렸어. 좋은 걸 찾았나 봐."),
};
export const praiseWaiting = (appearance: string) => pick(PRAISE_WAITING_BY, appearance);
