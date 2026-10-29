"use client";

import { useEffect, useRef, useState } from "react";
import type { BadgeDef, EarnedBadge } from "@/lib/social";
import { Sheet } from "./ui";
import Fist3D from "./Fist3D";
import { IconBubble, IconBubbles, IconFilm, IconFist, IconHeart, IconLock, IconLotus, IconMegaphone, IconMoon, IconTrophy, IconUsers } from "./Icons";
import styles from "./Profile.module.css";

/** 배지마다 아이콘 (선 아이콘 한 세트) */
const ICONS: Record<string, (p: { "aria-hidden"?: boolean }) => React.ReactElement> = {
  first_comfort: IconBubble,
  comfort_steady: IconBubbles,
  comfort_master: IconLotus,
  cheer_first: IconFist,
  cheer_rich: IconFist,
  thanked: IconHeart,
  thanked_much: IconHeart,
  night_owl: IconMoon,
  first_shout: IconMegaphone,
  first_feed: IconFilm,
  listened: IconUsers,
  weekly_top10: IconTrophy,
};
export function BadgeIcon({ id, locked }: { id: string; locked?: boolean }) {
  const Icon = locked ? IconLock : ICONS[id] ?? IconHeart;
  return <span className={styles.badgeIco}><Icon aria-hidden /></span>;
}

/**
 * 위로 배지 선반. 공개 프로필: 얻은 배지만. 내 화면(catalog 를 넘기면): 아직 못 얻은 배지도 흐리게.
 * 배지를 누르면 아래에 한 줄 설명. 얻는 조건의 횟수는 보여 주지 않는다.
 */
export default function BadgeShelf({ earned, catalog }: { earned: EarnedBadge[]; catalog?: BadgeDef[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const have = new Set(earned.map((b) => b.id));
  const items: { def: BadgeDef; locked: boolean }[] = catalog
    ? [...earned.map((b) => ({ def: b, locked: false })), ...catalog.filter((c) => !have.has(c.id)).map((c) => ({ def: c, locked: true }))]
    : earned.map((b) => ({ def: b, locked: false }));
  if (items.length === 0) return null;
  const sel = items.find((i) => i.def.id === picked);
  return (
    <section className={styles.shelf} aria-labelledby="badge-shelf-title">
      <div className={styles.shelfHead}>
        <h3 id="badge-shelf-title">위로 배지</h3>
        {catalog && <small>{earned.length === 0 ? "위로를 건네면 하나씩 생겨요" : "누르면 설명"}</small>}
      </div>
      <div className={styles.badges} role="list">
        {items.map(({ def, locked }) => (
          <button
            key={def.id}
            type="button"
            role="listitem"
            className={`${styles.badge} ${locked ? styles.locked : ""}`}
            aria-pressed={picked === def.id}
            aria-label={`${def.name}${locked ? " (아직)" : ""}`}
            onClick={() => setPicked((cur) => (cur === def.id ? null : def.id))}
          >
            <BadgeIcon id={def.id} locked={locked} />
            <span className={styles.badgeName}>{def.name}</span>
          </button>
        ))}
      </div>
      {sel && <p className={styles.badgeDesc} role="status"><b>{sel.def.name}</b> · {sel.locked ? "아직이에요. " : ""}{sel.def.desc}</p>}
    </section>
  );
}

/**
 * 새 배지 축하 시트: 처음 볼 때 한 번만. 3D 주먹이 톡 튀어나오고, 첫 배지를 바로 칭호로 달 수 있다.
 * 닫으면 onDone (서버에 '봤다'를 남긴다).
 */
export function BadgeCelebration({ badges, onDone, onUseAsTitle }: { badges: EarnedBadge[]; onDone: () => void; onUseAsTitle?: (id: string) => Promise<void> }) {
  const [open, setOpen] = useState(badges.length > 0);
  const [burst, setBurst] = useState(false);
  const [busy, setBusy] = useState(false);
  const done = useRef(false);
  useEffect(() => {
    if (!open) return;
    const t1 = setTimeout(() => setBurst(true), 120);
    const t2 = setTimeout(() => setBurst(false), 1100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [open]);
  const close = () => {
    setOpen(false);
    if (!done.current) { done.current = true; onDone(); }
  };
  if (badges.length === 0) return null;
  const first = badges[0];
  return (
    <Sheet open={open} onClose={close} title={badges.length > 1 ? `새 위로 배지 ${badges.length}개` : "새 위로 배지"}>
      <div className={styles.celebrate}>
        <div className={styles.celebrateFist}><Fist3D on burst={burst} size={64} /></div>
        <div className={styles.celebrateList}>
          {badges.map((b) => (
            <div key={b.id} className={styles.celebrateItem}>
              <BadgeIcon id={b.id} />
              <span><b>{b.name}</b><small>{b.desc}</small></span>
            </div>
          ))}
        </div>
      </div>
      <div className="sheet-actions">
        {onUseAsTitle && (
          <button type="button" className="btn ghost" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await onUseAsTitle(first.id); } finally { setBusy(false); close(); }
          }}>{busy ? "다는 중…" : `'${first.name}' 칭호로 달기`}</button>
        )}
        <button type="button" className="btn" onClick={close}>좋아요</button>
      </div>
    </Sheet>
  );
}
