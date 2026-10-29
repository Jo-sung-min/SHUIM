"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ListUser, fetchPeople } from "@/lib/social";
import { api } from "@/lib/community";
import { fetchMe } from "@/lib/auth";
import { Empty, LoadError, SkeletonList, TopBar } from "./ui";
import { IconChevronL, IconUsers } from "./Icons";
import TitleChip from "./TitleChip";
import { showToast } from "@/lib/toast";
import styles from "./Profile.module.css";

type Kind = "listeners" | "listening";

/** 리스너(이 사람을 듣는 사람) · 리스닝(이 사람이 듣는 사람) 목록. 줄마다 리스닝하기, 서로 리스닝 중이면 표시 */
export default function PeopleList({ kind }: { kind: Kind }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [users, setUsers] = useState<ListUser[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const locked = useRef(false);

  const load = useCallback(async (from = 0) => {
    setLoadError(null);
    try {
      const page = await fetchPeople(id, kind, from);
      setUsers((cur) => (from === 0 ? page.users : [...(cur ?? []), ...page.users]));
      setHasMore(page.hasMore);
      setOffset(page.nextOffset);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "불러오지 못했어요");
    }
  }, [id, kind]);
  useEffect(() => {
    setUsers(null);
    load(0);
    fetchMe().then((m) => setMeId(m.user?.id ?? m.anonymousId ?? null)).catch(() => setMeId(null));
  }, [load]);

  const toggle = async (u: ListUser) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(u.id);
    try {
      await api.toggleFollow(u.id);
      setUsers((cur) => cur?.map((x) => (x.id === u.id ? { ...x, viewerListens: !x.viewerListens } : x)) ?? cur);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "잠시 후 다시 시도해요");
    } finally {
      locked.current = false;
      setBusy(null);
    }
  };

  const title = kind === "listeners" ? "리스너" : "리스닝";
  const back = <button className="icon-btn" onClick={() => router.back()} aria-label="뒤로"><IconChevronL /></button>;
  return (
    <>
      <TopBar title={title} right={back} />
      <div className="screen">
        <nav className="ul-tabs" aria-label="리스너와 리스닝" style={{ position: "relative" }}>
          <Link href={`/u/${encodeURIComponent(id)}/listeners`} replace className={kind === "listeners" ? "on" : ""} aria-current={kind === "listeners" ? "page" : undefined}>리스너</Link>
          <Link href={`/u/${encodeURIComponent(id)}/listening`} replace className={kind === "listening" ? "on" : ""} aria-current={kind === "listening" ? "page" : undefined}>리스닝</Link>
        </nav>
        {loadError ? (
          <LoadError message={loadError} onRetry={() => load(0)} />
        ) : users === null ? (
          <div role="status" aria-label="목록을 불러오고 있어요"><SkeletonList count={5} lines={1} /></div>
        ) : users.length === 0 ? (
          <Empty icon={<IconUsers />} title={kind === "listeners" ? "아직 리스너가 없어요" : "아직 리스닝 중인 사람이 없어요"}>
            {kind === "listeners" ? "이야기를 나누다 보면 들어 주는 사람이 생겨요." : "마음이 가는 사람을 리스닝해 보세요."}
          </Empty>
        ) : (
          <div className={styles.people}>
            {users.map((u) => (
              <div key={u.id} className={styles.person}>
                <Link href={`/u/${encodeURIComponent(u.id)}`} className="avatar" style={u.avatarUrl ? { backgroundImage: `url(${u.avatarUrl})` } : undefined} aria-hidden="true" tabIndex={-1}>
                  {!u.avatarUrl && u.nick.slice(0, 1)}
                </Link>
                <Link href={`/u/${encodeURIComponent(u.id)}`} className={styles.personMain}>
                  <b>{u.nick}<TitleChip title={u.title} small /></b>
                  {u.listensToViewer && <small>나를 리스닝 중</small>}
                </Link>
                {u.id !== meId && (
                  <button type="button" className={`btn sm ${u.viewerListens ? "ghost" : ""}`} disabled={busy === u.id} aria-pressed={u.viewerListens} onClick={() => toggle(u)}>
                    {busy === u.id ? "…" : u.viewerListens ? "리스닝 중" : u.listensToViewer ? "나도 리스닝" : "리스닝"}
                  </button>
                )}
              </div>
            ))}
            {hasMore && <button type="button" className="btn ghost block" style={{ marginTop: 12 }} onClick={() => load(offset)}>더 보기</button>}
          </div>
        )}
      </div>
    </>
  );
}
