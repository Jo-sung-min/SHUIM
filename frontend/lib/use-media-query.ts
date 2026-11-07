import { useCallback, useSyncExternalStore } from "react";

/** 미디어 쿼리 일치 여부. 서버 렌더에서는 false, 창 크기가 바뀌면 다시 그린다. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((notify: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener("change", notify);
    return () => media.removeEventListener("change", notify);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
