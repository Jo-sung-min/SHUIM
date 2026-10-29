"use client";

import { showToast, toastSuccess } from "./toast";

/**
 * 프로필 공유: 휴대폰이면 기기 공유 창, 아니면 링크 복사. (공유 카드 이미지는 다음 단계)
 * 링크는 지금 보고 있는 사이트 주소 기준 /u/<id>.
 */
export async function shareProfile(id: string, nick: string) {
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
