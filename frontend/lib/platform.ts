/**
 * 안드로이드 앱(Play 스토어 TWA)으로 열렸는지 알아 둔다.
 * 앱은 첫 화면을 /?source=android 로 열고, TWA 는 document.referrer 를 android-app://<패키지> 로 준다.
 * 한 번 알아내면 탭이 살아 있는 동안(sessionStorage) 기억해서, 주소가 바뀐 뒤의 화면에서도 같은 답을 준다.
 * 앱 안에서는 디지털 상품을 Play 결제 없이 팔 수 없으므로(결제 정책) 결제 화면을 숨기는 데 쓴다.
 */
const KEY = "sorow:android-app";
const ANDROID_PACKAGE = "kr.co.sorow.app";

function launchedFromAndroidApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("source") === "android") return true;
  } catch {}
  return typeof document !== "undefined" && document.referrer.startsWith(`android-app://${ANDROID_PACKAGE}`);
}

/** 앱이 처음 열린 화면에서 한 번 부른다 (루트 레이아웃의 클라이언트 컴포넌트) */
export function rememberAndroidLaunch(): void {
  if (!launchedFromAndroidApp()) return;
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {}
}

/** 안드로이드 앱 안에서 보고 있으면 true. 서버 렌더링 중에는 늘 false */
export function isAndroidApp(): boolean {
  if (typeof window === "undefined") return false;
  if (launchedFromAndroidApp()) {
    rememberAndroidLaunch();
    return true;
  }
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
