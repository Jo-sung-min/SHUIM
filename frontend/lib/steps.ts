"use client";

/**
 * 작은 한 걸음의 저장 (규칙과 행동 목록은 lib/step-rules.ts).
 * - 기운·하기 전과 뒤·정해 둔 한 걸음·하는 중인 것은 이 기기의 localStorage(계정별)에만 둔다. 서버로 보내지 않는다.
 * - 끝낸 행동의 이름은 "오늘 한 일"(LogBook.did)에 더한다. 이쪽은 원래부터 서버와 맞춰지는 기록이라 흐름 보기·정리하기·칭찬받기의 재료가 된다.
 */
import { loadLog, loadStepsRaw, saveDayLog, saveStepsRaw, syncRecords } from "./storage";
import { mergeDid, normalizeSteps, type StepState } from "./step-rules";

export * from "./step-rules";

export const loadSteps = (today: string): StepState => normalizeSteps(loadStepsRaw(), today);
export const saveSteps = (state: StepState) => saveStepsRaw(state);

/**
 * 끝낸 한 걸음을 오늘 한 일에 더한다 (이미 있으면 그대로).
 * saveDayLog 는 오늘의 기록(카테고리 점수)도 함께 보내고 서버는 그것으로 오늘 기록을 통째로 바꾼다.
 * 화면을 오래 열어 둔 사이 다른 기기에서 남긴 오늘 기록을 지우지 않도록, 쓰기 직전에 서버의 것을 한 번 더 받는다 (못 받으면 이 기기의 것으로 쓴다).
 */
export async function recordStepDid(date: string, label: string) {
  await syncRecords();
  const did = loadLog()[date]?.did ?? [];
  const next = mergeDid(did, label);
  if (next !== did) saveDayLog(date, { did: next });
}

/** 모루의 말 풀에서 하나 */
export const sayStep = (lines: string[]): string => lines[Math.floor(Math.random() * lines.length)] ?? "";
