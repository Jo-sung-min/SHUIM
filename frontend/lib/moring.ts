import type { MoruMood } from "@/components/MoruSprite";
import type { MoodStage } from "@/lib/moru-rules";

/**
 * 모링의 표정 띠 고르기 (그림은 components/MoringSprite.tsx, 만드는 법은 docs/MORU_TAMAGOTCHI.md 의 "캐릭터").
 * 모링만 표정이 이미지 띠라 감정마다 띠가 따로 있다. 우는 얼굴은 없다.
 *  - 평소·웃음·먹기·잠: 처음부터 있던 띠
 *  - 울적(gloomy)·가벼움(light)·행복(joy): 오늘의 기분(docs/MORU_MOOD_SYNC.md)에 따른 깨어 있는 평소
 *  - 포근(cozy)·걱정(worry)·갸웃(curious): 말 걸기에서 고른 기분에 잠깐 짓는 얼굴
 */
export const MORING_LOOPS = ["idle", "happy", "eat", "sleep", "gloomy", "light", "joy", "cozy", "worry", "curious"] as const;
export type MoringLoop = (typeof MORING_LOOPS)[number];

/** 오늘의 기분마다 평소의 띠: 2~3단계는 처음부터 있던 반쯤 감긴 눈 */
export const MORING_REST: Record<MoodStage, MoringLoop> = { 1: "gloomy", 2: "idle", 3: "idle", 4: "light", 5: "joy" };

/** 말 걸기의 기분(lib/moru.ts 의 TALK_TOPICS id)마다 모링이 짓는 얼굴. 기쁜 일에는 웃음 띠 */
export const MORING_TALK: Record<string, MoringLoop> = { tired: "cozy", happy: "happy", sad: "worry", anxious: "cozy", bored: "curious", just: "light" };

/** 지금 보일 띠: 잠·먹기가 먼저, 그다음 말 걸기 반응(pet + talk), 손길 반응, 그날의 평소 */
export function moringLoop(mood: MoruMood, stage: MoodStage = 3, talk?: string | null): MoringLoop {
  if (mood === "sleep" || mood === "eat") return mood;
  if (mood === "pet" && talk && Object.hasOwn(MORING_TALK, talk)) return MORING_TALK[talk];
  if (mood === "happy" || mood === "pet") return "happy";
  return MORING_REST[stage] ?? "idle";
}
