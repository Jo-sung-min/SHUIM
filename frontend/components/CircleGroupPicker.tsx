"use client";

import { useEffect, useMemo, useState } from "react";
import { BUILTIN_GROUPS, CircleGroup, fetchCircleGroups, groupKey, normalizeGroupLabel } from "@/lib/circles";
import { IconPlus } from "./Icons";
import styles from "@/app/c/circle.module.css";

/** 고른 묶음: 있는 묶음 id, 또는 새로 만들 묶음 이름 */
export type GroupChoice = { mode: "pick"; id: string } | { mode: "new"; label: string };
/** 처음 보여 줄 새 묶음 수 (소로우 많은 순). 나머지는 '새 묶음'에 이름을 쓰면 찾아 준다 */
const SHOWN_FREE = 8;

/**
 * 소로우 묶음 고르기: 기본 묶음 + 다른 사람이 만든 묶음 칩, 그리고 '새 묶음'.
 * 새 묶음 이름을 쓰면 비슷한 묶음을 먼저 보여 주고, 같은 이름(띄어쓰기 무시)이 있으면 그 묶음으로 들어간다고 알린다.
 */
export default function CircleGroupPicker({ value, onChange, disabled }: { value: GroupChoice; onChange: (next: GroupChoice) => void; disabled?: boolean }) {
  const [groups, setGroups] = useState<CircleGroup[]>(BUILTIN_GROUPS);
  const [more, setMore] = useState(false);
  const [matches, setMatches] = useState<CircleGroup[]>([]);

  useEffect(() => {
    fetchCircleGroups().then((g) => g.length && setGroups(g)).catch(() => setGroups(BUILTIN_GROUPS));
  }, []);

  const typed = value.mode === "new" ? value.label : "";
  const normalized = normalizeGroupLabel(typed);
  useEffect(() => {
    const q = typed.trim();
    if (value.mode !== "new" || q.length < 1) { setMatches([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      fetchCircleGroups(q).then((g) => alive && setMatches(g.slice(0, 6))).catch(() => alive && setMatches([]));
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [typed, value.mode]);

  const builtin = groups.filter((g) => g.builtin);
  const free = groups.filter((g) => !g.builtin);
  const shownFree = more ? free : free.slice(0, SHOWN_FREE);
  // 고른 묶음이 목록 밖(검색으로 고른 것)이면 칩으로 같이 보여 준다
  const picked = value.mode === "pick" ? groups.find((g) => g.id === value.id) : undefined;
  const extra = picked && !builtin.includes(picked) && !shownFree.includes(picked) ? [picked] : [];
  const same = useMemo(() => (normalized ? matches.find((g) => groupKey(g.label) === groupKey(normalized)) : undefined), [matches, normalized]);

  const chip = (g: CircleGroup) => (
    <button key={g.id} type="button" role="radio" aria-checked={value.mode === "pick" && value.id === g.id} className={styles.groupChip} disabled={disabled}
      onClick={() => onChange({ mode: "pick", id: g.id })}>
      {g.label}{!g.builtin && g.circleCount > 0 && <small>{g.circleCount}</small>}
    </button>
  );

  return (
    <div className={styles.groupPicker}>
      <div className={styles.groupChips} role="radiogroup" aria-label="소로우 묶음">
        {builtin.map(chip)}
        {shownFree.map(chip)}
        {extra.map(chip)}
        {free.length > SHOWN_FREE && !more && (
          <button type="button" className={`${styles.groupChip} ${styles.groupMore}`} onClick={() => setMore(true)} disabled={disabled}>+{free.length - SHOWN_FREE}개 더</button>
        )}
        <button type="button" role="radio" aria-checked={value.mode === "new"} className={`${styles.groupChip} ${styles.groupNew}`} disabled={disabled}
          onClick={() => value.mode !== "new" && onChange({ mode: "new", label: "" })}>
          <IconPlus aria-hidden="true" />새 묶음
        </button>
      </div>

      {value.mode === "pick" ? (
        picked?.hint ? <small>{picked.hint}</small> : picked && !picked.builtin ? <small>소로우 {picked.circleCount}개가 모인 묶음이에요</small> : null
      ) : (
        <div className={styles.groupNewBox}>
          <input value={typed} onChange={(e) => onChange({ mode: "new", label: e.target.value })} placeholder="예: 캠핑하는 중" maxLength={14}
            aria-label="새 묶음 이름" enterKeyHint="done" disabled={disabled} autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} />
          <small aria-live="polite">
            {same ? `‘${same.label}’ 묶음이 이미 있어서 그 묶음에 들어가요`
              : typed.trim() && !normalized ? "2~10자 한글·영문·숫자로 써 주세요"
              : "즐기는 일·살아가는 일로 짓고, 회사·학교 이름은 쓰지 않아요"}
          </small>
          {matches.length > 0 && !same && (
            <div className={styles.groupMatches}>
              <span>비슷한 묶음</span>
              {matches.map((g) => (
                <button key={g.id} type="button" className={styles.groupChip} disabled={disabled}
                  onClick={() => { setGroups((prev) => (prev.some((x) => x.id === g.id) ? prev : [...prev, g])); onChange({ mode: "pick", id: g.id }); }}>
                  {g.label}{g.circleCount > 0 && <small>{g.circleCount}</small>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

