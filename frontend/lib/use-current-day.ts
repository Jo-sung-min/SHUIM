"use client";

import { useCallback, useEffect, useState } from "react";
import { todayKey } from "./dates";

/** Records use the device's local calendar date, including after a suspended tab resumes. */
export function useCurrentDay() {
  const [date, setDate] = useState(todayKey);
  const refreshDate = useCallback(() => {
    const current = todayKey();
    setDate(current);
    return current;
  }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      refreshDate();
      clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 50);
    };
    const onVisibility = () => { if (!document.hidden) refresh(); };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshDate]);
  return [date, refreshDate] as const;
}
