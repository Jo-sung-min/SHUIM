"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 세로 목록을 "꾹 눌렀다가 끌어서" 순서 바꾸기.
 * - 누른 채 LONG_PRESS ms 동안 거의 움직이지 않으면 끌기 모드 (짧게 누르거나 바로 움직이면 보통 스크롤)
 * - 끌기 중엔 눌린 카드가 손가락을 따라오고, 지나친 카드들은 한 칸씩 비켜난다
 * - 손을 떼면 onReorder(새 id 순서) 호출
 * 버튼·입력창 위에서 시작한 누름은 무시한다.
 */
const LONG_PRESS = 420;
const MOVE_CANCEL = 10;

interface Drag {
  id: string;
  index: number;
  startY: number;
  pointerId: number;
  rects: { id: string; top: number; height: number }[];
  gap: number;
}

export function useLongPressReorder(ids: string[], onReorder: (ids: string[]) => void) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const items = useRef(new Map<string, HTMLElement>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ id: string; y: number; pointerId: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const target = useRef<number>(-1);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const applyTransforms = useCallback((dy: number) => {
    const d = drag.current;
    if (!d) return;
    const me = d.rects[d.index];
    const center = me.top + me.height / 2 + dy;
    // 끌리는 카드의 중심보다 위에 있는 다른 카드 수 = 새 위치
    let t = 0;
    d.rects.forEach((r, i) => {
      if (i !== d.index && r.top + r.height / 2 < center) t++;
    });
    target.current = t;
    const shift = me.height + d.gap;
    d.rects.forEach((r, i) => {
      const el = items.current.get(r.id);
      if (!el) return;
      if (i === d.index) {
        el.style.transform = `translateY(${dy}px) scale(1.02)`;
        return;
      }
      let y = 0;
      if (d.index < t && i > d.index && i <= t) y = -shift;
      else if (d.index > t && i >= t && i < d.index) y = shift;
      el.style.transform = y ? `translateY(${y}px)` : "";
    });
  }, []);

  const finish = useCallback(
    (commit: boolean) => {
      clearTimer();
      pending.current = null;
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      d.rects.forEach((r) => {
        const el = items.current.get(r.id);
        if (el) {
          el.style.transform = "";
          el.classList.remove("shifting");
        }
      });
      document.body.style.userSelect = "";
      setDraggingId(null);
      const t = target.current;
      if (commit && t >= 0 && t !== d.index) {
        const next = idsRef.current.slice();
        next.splice(d.index, 1);
        next.splice(t, 0, d.id);
        onReorder(next);
      }
    },
    [onReorder]
  );

  // 창 단위 포인터 이동/해제 + 끌기 중 터치 스크롤 차단
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = pending.current;
      if (p && !drag.current && p.pointerId === e.pointerId && Math.abs(e.clientY - p.y) > MOVE_CANCEL) {
        clearTimer();
        pending.current = null; // 스크롤로 판단
        return;
      }
      const d = drag.current;
      if (d && d.pointerId === e.pointerId) applyTransforms(e.clientY - d.startY);
    };
    const onUp = (e: PointerEvent) => {
      if (drag.current && drag.current.pointerId === e.pointerId) finish(true);
      else if (pending.current && pending.current.pointerId === e.pointerId) {
        clearTimer();
        pending.current = null;
      }
    };
    const onCancel = () => finish(false);
    const onTouchMove = (e: TouchEvent) => {
      if (drag.current) e.preventDefault();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, [applyTransforms, finish]);

  const start = useCallback(
    (id: string, e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const tag = (e.target as HTMLElement).closest("button, input, textarea, select, a, [role=radio]");
      if (tag) return;
      clearTimer();
      pending.current = { id, y: e.clientY, pointerId: e.pointerId };
      const y = e.clientY;
      const pointerId = e.pointerId;
      timer.current = setTimeout(() => {
        if (!pending.current || pending.current.id !== id) return;
        const order = idsRef.current;
        const rects = order.map((x) => {
          const r = items.current.get(x)?.getBoundingClientRect();
          return { id: x, top: r?.top ?? 0, height: r?.height ?? 0 };
        });
        const gap = rects.length > 1 ? Math.max(0, rects[1].top - (rects[0].top + rects[0].height)) : 0;
        drag.current = { id, index: order.indexOf(id), startY: y, pointerId, rects, gap };
        target.current = drag.current.index;
        rects.forEach((r) => r.id !== id && items.current.get(r.id)?.classList.add("shifting"));
        document.body.style.userSelect = "none";
        try {
          navigator.vibrate?.(12);
        } catch {
          /* noop */
        }
        setDraggingId(id);
        applyTransforms(0);
      }, LONG_PRESS);
    },
    [applyTransforms]
  );

  const bind = useCallback(
    (id: string) => ({
      ref: (el: HTMLElement | null) => {
        if (el) items.current.set(id, el);
        else items.current.delete(id);
      },
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => start(id, e),
      onContextMenu: (e: React.MouseEvent) => {
        if (drag.current || pending.current) e.preventDefault();
      },
    }),
    [start]
  );

  return { listRef, bind, draggingId };
}
