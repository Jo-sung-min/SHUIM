"use client";

/**
 * 방 안의 작은 사건이 남기는 것 (docs/MORU_HAPPENINGS.md): 화분, 주운 것들, 오늘 지나간 일.
 * 1차는 이 기기에만 계정별로 둔다 (lib/storage 의 read/write). 서버로 옮기는 것은 문서의 다음 단계.
 */
import { read, write } from "./storage";
import { normalizeHappenings, type Happenings } from "./moru-happenings";

const KEY = "moru:happenings:v1";
export const loadHappenings = (today: string): Happenings => normalizeHappenings(read<unknown>(KEY, null), today);
export const saveHappenings = (state: Happenings) => write(KEY, state);

/** 개발 확인용: ?moruQuick=1 이면 날아드는 것·물음이 금방 나온다 (운영 빌드에서는 무시) */
export function happeningsQuick(): boolean {
  return process.env.NODE_ENV !== "production" && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("moruQuick");
}
