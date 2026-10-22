"use client";

import { useSyncExternalStore } from "react";
import { dismissToast, getServerToastSnapshot, getToastSnapshot, subscribeToasts } from "@/lib/toast";
import { IconAlert, IconCheck, IconClose } from "./Icons";

/** 작은 안내: 완료는 잠깐 보이고 사라지고, 오류는 닫을 때까지 남는다. 포커스를 가져가지 않는다. */
export default function AppToast() {
  const notices = useSyncExternalStore(subscribeToasts, getToastSnapshot, getServerToastSnapshot);
  if (!notices.length) return null;
  return (
    <aside className="app-toasts" aria-label="알림">
      {notices.slice(0, 3).map((notice) => (
        <div className={`app-toast ${notice.kind}`} key={notice.id}>
          <span className="app-toast__icon" aria-hidden="true">{notice.kind === "success" ? <IconCheck /> : <IconAlert />}</span>
          <p className="app-toast__message" role="status" aria-live="polite" aria-atomic="true">{notice.message}</p>
          {notice.kind === "error" && (
            <button type="button" className="icon-btn app-toast__close" onClick={() => dismissToast(notice.id)} aria-label="알림 닫기"><IconClose /></button>
          )}
        </div>
      ))}
      {notices.length > 3 && <p className="app-toast__remaining" role="status">알림 {notices.length - 3}개가 더 있어요. 위 알림을 닫으면 볼 수 있어요.</p>}
    </aside>
  );
}
