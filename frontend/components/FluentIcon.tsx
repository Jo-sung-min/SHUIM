"use client";

import { useEffect, useState, type SVGProps } from "react";
import { cachedFluentIcon, loadFluentIcon, type FluentIconRow } from "@/lib/fluent-icons";

/** Fluent 아이콘 한 개 (Regular, currentColor 로 채운다) */
export function FluentSvg({ row, ...props }: { row: FluentIconRow } & SVGProps<SVGSVGElement>) {
  const size = row[3];
  return (
    <svg viewBox={`0 0 ${size} ${size}`} fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      {row[4].map((p, i) => (typeof p === "string" ? <path key={i} d={p} /> : <path key={i} d={p.d} fillRule="evenodd" clipRule="evenodd" />))}
    </svg>
  );
}

/** 이름으로 아이콘을 받아 온다: 받은 적 있으면 바로, 아니면 그 분류 조각을 받고 나서. 없는 이름은 "missing" */
export function useFluentIcon(name: string | null): FluentIconRow | null | "missing" {
  const [row, setRow] = useState<FluentIconRow | null | "missing">(() => (name ? cachedFluentIcon(name) : null));
  useEffect(() => {
    if (!name) { setRow(null); return; }
    const cached = cachedFluentIcon(name);
    if (cached) { setRow(cached); return; }
    let alive = true;
    setRow(null);
    loadFluentIcon(name).then((r) => alive && setRow(r ?? "missing")).catch(() => alive && setRow("missing"));
    return () => { alive = false; };
  }, [name]);
  return row;
}
