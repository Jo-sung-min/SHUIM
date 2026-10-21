"use client";

import { useEffect } from "react";

/** Only the public offline page is cached. Personal pages and API responses never enter CacheStorage. */
export default function AppRuntime() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);
  return null;
}
