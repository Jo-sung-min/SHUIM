/**
 * 앱인토스 미니앱 빌드(npm run build:ait)에서만 켜지는 것들. IS_AIT 는 빌드 때 정해지는 상수라
 * 웹 빌드에서는 이 분기와 SDK(@apps-in-toss/web-framework) 가 통째로 빠진다.
 * - 미니앱은 https://<appName>.web.tossmini.com 에서 열리는 정적 파일이라 API 는 NEXT_PUBLIC_API_ORIGIN 으로 직접 부른다 (lib/ait-fetch.ts)
 * - 토스 로그인·외부 링크·공유·햅틱은 토스 앱 브리지를 쓴다. 실패하면 조용히 웹 방식으로 돌아간다
 */
export const IS_AIT = process.env.NEXT_PUBLIC_AIT === "1";

/** 콘솔에 등록한 appName. intoss://<appName>/… 딥링크와 공유 링크에 쓴다 */
export const AIT_APP_NAME = process.env.NEXT_PUBLIC_AIT_APP_NAME || "sorow";

// 웹 빌드에서는 IS_AIT 가 false 라 이 import 가 지워져 SDK 조각이 번들에 들어가지 않는다
const sdk = () => (IS_AIT ? import("@apps-in-toss/web-framework") : Promise.reject(new Error("앱인토스 미니앱이 아니에요")));

/** 토스 인증 화면을 거쳐 인가 코드를 받는다. 두 번째부터는 화면 없이 바로 온다 */
export async function tossLogin(): Promise<{ authorizationCode: string; referrer: string }> {
  const { TossAuth } = await sdk();
  return TossAuth.login();
}

/** 미니앱 밖 주소는 미니앱 안에서 열지 않고 기기 브라우저로 연다 (앱인토스 정책) */
export async function openExternal(url: string): Promise<void> {
  try {
    const { openURL } = await sdk();
    await openURL(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** 미니앱 안 경로를 토스 앱에서 열리는 공유 링크로. 실패하면 null */
export async function tossShareLink(path: string): Promise<string | null> {
  try {
    const { Share } = await sdk();
    return await Share.createLink({ path: `intoss://${AIT_APP_NAME}${path.startsWith("/") ? path : `/${path}`}` });
  } catch {
    return null;
  }
}

/** 토스 공유 시트로 메시지를 보낸다. 실패하면 false */
export async function tossShareMessage(message: string): Promise<boolean> {
  try {
    const { Share } = await sdk();
    await Share.sendMessage({ message });
    return true;
  } catch {
    return false;
  }
}

/** 짧은 햅틱. 아이폰은 navigator.vibrate 가 없어 토스 브리지로 울린다 */
export function tossHaptic(): boolean {
  sdk().then(({ generateHapticFeedback }) => generateHapticFeedback({ type: "tickWeak" })).catch(() => {});
  return true;
}
