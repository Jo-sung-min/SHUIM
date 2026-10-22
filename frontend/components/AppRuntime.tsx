"use client";

import { useEffect } from "react";

/** Only the public offline page is cached. Personal pages and API responses never enter CacheStorage. */
export default function AppRuntime() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const field = document.activeElement;
      const editing = field instanceof HTMLElement && field.matches("input:not([type=checkbox]):not([type=radio]), textarea, [contenteditable=true]");
      const keyboardOpen = editing && window.innerHeight - viewport.height > 140;
      document.documentElement.dataset.keyboard = keyboardOpen ? "open" : "closed";
    };
    viewport.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      viewport.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      delete document.documentElement.dataset.keyboard;
    };
  }, []);
  return null;
}
