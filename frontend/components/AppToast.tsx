"use client";

import { useSyncExternalStore } from "react";
import { dismissToast, getServerToastSnapshot, getToastSnapshot, subscribeToasts } from "@/lib/toast";
import { IconClose } from "./Icons";

/** Non-modal feedback: never steals focus or expires while someone is reading. */
export default function AppToast() {
  const notices = useSyncExternalStore(subscribeToasts, getToastSnapshot, getServerToastSnapshot);
  if (!notices.length) return null;
  return (
    <aside className="app-toasts" aria-label="알림">
      {notices.slice(0, 3).map((notice) => (
        <div className="app-toast" key={notice.id}>
          <span className="app-toast__icon" aria-hidden="true">!</span>
          <p className="app-toast__message" role="status" aria-live="polite" aria-atomic="true">{notice.message}</p>
          <button type="button" className="icon-btn app-toast__close" onClick={() => dismissToast(notice.id)} aria-label="알림 닫기"><IconClose /></button>
        </div>
      ))}
      {notices.length > 3 && <p className="app-toast__remaining" role="status">알림 {notices.length - 3}개가 더 있어요. 위 알림을 닫으면 볼 수 있어요.</p>}
    </aside>
  );
}
