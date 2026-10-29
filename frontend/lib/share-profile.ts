"use client";

import { showToast, toastSuccess } from "./toast";
import { IS_AIT, tossShareLink, tossShareMessage } from "./ait";
import { route } from "./routes";

/**
 * 프로필 공유: 휴대폰이면 기기 공유 창, 아니면 링크 복사. (공유 카드 이미지는 다음 단계)
 * 링크는 지금 보고 있는 사이트 주소 기준 /u/<id>. 미니앱은 intoss:// 로 열리는 토스 공유 링크를 토스 공유 시트로 보낸다.
 */
export async function shareProfile(id: string, nick: string) {
  if (IS_AIT) {
    const link = await tossShareLink(route(`/u/${encodeURIComponent(id)}`));
    if (!link) { showToast("공유 링크를 만들지 못했어요. 잠시 후 다시 시도해 주세요."); return; }
    if (await tossShareMessage(`${nick} 님의 소로우 프로필\n${link}`)) return;
    try {
      await navigator.clipboard.writeText(link);
      toastSuccess("프로필 링크를 복사했어요");
    } catch {
      showToast(`링크: ${link}`);
    }
    return;
  }
  const url = `${window.location.origin}/u/${encodeURIComponent(id)}`;
  const data = { title: `${nick} · 소로우`, text: `${nick} 님의 소로우 프로필`, url };
  try {
    if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(data))) {
      await navigator.share(data);
      return;
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return; // 공유 창을 닫음
  }
  try {
    await navigator.clipboard.writeText(url);
    toastSuccess("프로필 링크를 복사했어요");
  } catch {
    showToast(`링크: ${url}`);
  }
}
