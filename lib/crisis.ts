/**
 * 기록에서 많이 힘든 신호가 보이면 도움 받을 곳을 먼저 보여주기 위한 간단한 키워드 감지.
 * 진단이 아니라 "혹시 몰라서 한 번 더 안내"하는 안전장치입니다.
 */
const PATTERNS = [
  /죽고\s*싶/,
  /자살/,
  /사라지고\s*싶/,
  /끝내고\s*싶/,
  /생을\s*끝/,
  /극단적/,
  /살기\s*싫/,
  /없어지고\s*싶/,
  /자해/,
];

export function hasCrisisSignal(text: string): boolean {
  return PATTERNS.some((p) => p.test(text));
}

export const HELP_LINES = [
  { name: "자살예방상담전화", tel: "109", desc: "24시간 · 전화/문자" },
  { name: "정신건강위기상담", tel: "1577-0199", desc: "24시간" },
  { name: "긴급 상황", tel: "119", desc: "지금 위험하다면" },
];
