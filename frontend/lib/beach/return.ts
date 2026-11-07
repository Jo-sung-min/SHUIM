const KEY = "beach:return";

/**
 * 바닷가로 들어가기 직전 페이지. 나가기가 history.back 으로 돌아갈지(그 페이지에서 왔을 때) 정하는 데 쓴다.
 * 그래야 소로우 페이지의 뒤로가기가 다시 바닷가로 돌아오는 무한 루프가 생기지 않는다.
 */
export function rememberBeachReturn() {
  try { sessionStorage.setItem(KEY, location.pathname + location.search); } catch { /* 저장 못 해도 나가기는 된다 */ }
}
export function readBeachReturn(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}
