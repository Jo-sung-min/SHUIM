/** 날짜 키 도우미 (서버·클라이언트 공용, 브라우저 API 없음) */

export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return todayKey(new Date(y, m - 1, d + n));
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
