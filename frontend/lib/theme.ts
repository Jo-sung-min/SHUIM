/**
 * 화면 모드: 기기 설정(system) · 화이트(light) · 나이트(dark). 설정 화면(/settings)에서 고른다.
 * - 고른 값은 이 기기의 localStorage 에만 둔다 (기기마다 밝기 환경이 달라서)
 * - <html data-theme="light|dark"> 로 globals.css 의 색 토큰을 바꾼다. system 이면 속성을 지워 기기 설정을 따른다
 * - THEME_SCRIPT 는 layout <head> 에서 첫 페인트 전에 실행돼 밝은 화면이 번쩍이지 않게 한다
 */
import { SITE } from "./site";
import { IS_AIT } from "./ait";

export type ThemePref = "system" | "light" | "dark";
export const THEME_KEY = "sorow:theme";

const BAR_COLOR = { light: SITE.themeLight, dark: SITE.themeDark } as const;

export function loadTheme(): ThemePref {
  if (IS_AIT) return "light"; // 앱인토스 미니앱은 라이트 모드만 (출시 체크리스트)
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
  // 주소창·상태 표시줄 색: layout 의 viewport.themeColor 가 만든 두 meta 를 고른 모드에 맞춘다
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    const scheme = pref !== "system" ? pref : (meta.getAttribute("media") ?? "").includes("dark") ? "dark" : "light";
    meta.setAttribute("content", BAR_COLOR[scheme]);
  });
}

export function saveTheme(pref: ThemePref) {
  try {
    if (pref === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* 저장소를 못 쓰면 이번 방문에만 적용 */
  }
  applyTheme(pref);
}

export const THEME_SCRIPT = IS_AIT ? `document.documentElement.setAttribute("data-theme","light")` : `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
