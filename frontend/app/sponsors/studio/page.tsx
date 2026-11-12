"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Empty, LoadError, TopBar } from "@/components/ui";
import { IconChevronR, IconLock } from "@/components/Icons";
import { SponsorFramePicker, SponsorFrameView } from "@/components/SponsorFrame";
import { DEFAULT_FRAME, sameFrame, studioKeyFromHash, type SponsorFrame } from "@/lib/sponsor-frames";
import { fmtSponsorWon, openSponsorStudio, saveSponsorFrame, sponsorLogoHref, type StudioSponsor } from "@/lib/sponsors";
import { toastSuccess } from "@/lib/toast";
import styles from "./studio.module.css";

type State = "loading" | "ready" | "invalid" | "failed";

/**
 * 액자 꾸미기: 후원 기업 담당자가 관리자에게 받은 링크(/sponsors/studio#<키>)로 로그인 없이 연다.
 * 키는 주소의 # 뒤에만 있고 요청 본문으로만 보낸다. 여기서 바꿀 수 있는 것은 액자·색·장식뿐이다.
 */
export default function SponsorStudioPage() {
  const [state, setState] = useState<State>("loading");
  const [sponsor, setSponsor] = useState<StudioSponsor | null>(null);
  const [draft, setDraft] = useState<SponsorFrame>(DEFAULT_FRAME);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef<string | null>(null);
  const mounted = useRef(false);
  const lock = useRef(false);

  const load = useCallback(async () => {
    key.current = studioKeyFromHash(window.location.hash);
    if (!key.current) { setState("invalid"); return; }
    setState("loading");
    try {
      const mine = await openSponsorStudio(key.current);
      if (!mounted.current) return;
      setSponsor(mine); setDraft(mine.frame); setState("ready");
    } catch (cause) {
      if (mounted.current) setState(cause instanceof Error && cause.name === "HttpError404" ? "invalid" : "failed");
    }
  }, []);
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]);

  const save = async () => {
    if (lock.current || !key.current || !sponsor) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const saved = await saveSponsorFrame(key.current, draft);
      if (!mounted.current) return;
      setSponsor(saved); setDraft(saved.frame);
      toastSuccess("저장했어요");
    } catch (cause) {
      if (!mounted.current) return;
      if (cause instanceof Error && cause.name === "HttpError404") setState("invalid");
      else setError(cause instanceof Error ? cause.message : "저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  };

  const bar = <TopBar title="액자 꾸미기" />;
  if (state === "invalid") return <>{bar}<div className="screen">
    <Empty icon={<IconLock />} title="링크가 맞지 않아요" action={<Link href="/sponsors" className="btn ghost">후원 기업 순위</Link>}>새 꾸미기 링크를 받아 주세요.</Empty>
  </div></>;
  if (state === "failed") return <>{bar}<div className="screen"><LoadError onRetry={() => void load()} /></div></>;
  if (state === "loading" || !sponsor) return <>{bar}<div className={`screen ${styles.screen}`} role="status" aria-label="액자를 불러오고 있어요">
    <div className={`sk ${styles.skShow}`} /><div className={`sk ${styles.skPick}`} />
  </div></>;

  const logo = sponsorLogoHref(sponsor);
  const dirty = !sameFrame(draft, sponsor.frame);
  return <>
    {bar}
    <div className={`screen ${styles.screen}`}>
      <section className={styles.preview} aria-label="미리보기">
        <div className={styles.showcase}><SponsorFrameView frame={draft} name={sponsor.name} logo={logo} live /></div>
        <div className={styles.sample}>
          <span className={styles.rank}>{sponsor.rank || "–"}</span>
          <SponsorFrameView frame={draft} name={sponsor.name} logo={logo} />
          <span className={styles.name}>{sponsor.name}</span>
          <span className={styles.amount}>{fmtSponsorWon(sponsor.amountWon)}</span>
        </div>
      </section>

      <SponsorFramePicker value={draft} onPick={(patch) => setDraft((current) => ({ ...current, ...patch }))} name={sponsor.name} logo={logo} disabled={busy} />
      {error && <p className="notice warn" role="alert">{error}</p>}

      <div className={styles.actions}>
        <button type="button" className="btn ghost" disabled={!dirty || busy} onClick={() => { setDraft(sponsor.frame); setError(null); }}>되돌리기</button>
        <button type="button" className="btn" disabled={!dirty || busy} aria-busy={busy} onClick={() => void save()}>{busy ? "저장 중…" : "저장"}</button>
      </div>
      <Link href="/sponsors" className={styles.more}>후원 기업 순위<IconChevronR aria-hidden="true" /></Link>
    </div>
  </>;
}
