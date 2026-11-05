"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Hero, LoadError, SkeletonScreen } from "@/components/ui";
import { AdminUser, AdminUsersPage, MemberType, MEMBER_TYPE_LABELS, SIGNUP_METHOD_LABELS, adminUserDate, fetchAdminUsers, setAdminMemberType } from "@/lib/admin-users";
import { createPrivateTestCircle, fetchPrivateTestStatus } from "@/lib/circles";
import { route } from "@/lib/routes";
import styles from "./admin.module.css";

export function UserCard({ user, draft, busy, saving, onDraft, onSave, selectable, selected, onSelect }: {
  user: AdminUser; draft: MemberType; busy: boolean; saving: boolean; onDraft: (value: MemberType) => void; onSave: () => void;
  selectable: boolean; selected: boolean; onSelect: () => void;
}) {
  const date = adminUserDate(user);
  return <article className={`card ${styles.userCard}`} aria-label={`${user.nick} 회원 설정`}>
    <div className={styles.cardFooter}>
      <h3 className={styles.userName}>{user.nick}</h3>
      <div className={styles.badges}><span className={`pill ${user.status === "blocked" ? "warn" : ""}`}>{user.status === "blocked" ? "차단됨" : "이용 중"}</span>{user.admin && <span className="pill">관리자</span>}</div>
    </div>
    <dl className={styles.userDetails}>
      <dt>{date.label}</dt><dd><time dateTime={new Date(date.timestamp).toISOString()}>{date.text}</time></dd>
      <dt>가입방법</dt><dd>{user.signupMethods.map((method) => SIGNUP_METHOD_LABELS[method]).join(" · ")}</dd>
    </dl>
    {user.registeredAt === null && <p className="tiny muted">이전 가입 계정은 정확한 가입일 대신 계정 생성일을 표시해요.</p>}
    <div className={styles.memberControls}>
      <div className="field"><label htmlFor={`member-type-${user.id}`}>회원 유형</label><select id={`member-type-${user.id}`} value={draft} disabled={busy} onChange={(event) => onDraft(event.target.value as MemberType)}>
        {Object.entries(MEMBER_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></div>
      <button type="button" className="btn ghost sm" disabled={busy || draft === user.memberType} aria-busy={saving} onClick={onSave}>{saving ? "저장 중…" : "유형 저장"}</button>
    </div>
    {selectable && <button type="button" className="text-btn" disabled={busy} aria-pressed={selected} onClick={onSelect}>{selected ? "테스트 소로우 회원으로 선택됨" : "테스트 소로우 회원으로 선택"}</button>}
  </article>;
}

export default function UsersAdmin({ currentUserId }: { currentUserId: string }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState({ search: "", page: 0 });
  const [data, setData] = useState<AdminUsersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, MemberType>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [peer, setPeer] = useState<AdminUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [circle, setCircle] = useState<{ slug: string; name: string } | null>(null);
  const [circleError, setCircleError] = useState<string | null>(null);
  const [creationStatus, setCreationStatus] = useState<"loading" | "enabled" | "disabled" | "error">("loading");
  const mounted = useRef(false);
  const request = useRef<AbortController | null>(null);
  const mutation = useRef(false);
  const creation = useRef(false);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAdminUsers(query.search, query.page, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      setData(result);
      setDrafts({});
      setPeer((selected) => {
        if (!selected) return null;
        const fresh = result.users.find((user) => user.id === selected.id);
        return fresh ? (fresh.status === "active" ? fresh : null) : selected;
      });
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "목록을 불러오지 못했어요."); setData(null); }
    } finally { if (mounted.current && !controller.signal.aborted) setLoading(false); }
  }, [query]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; request.current?.abort(); };
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    setCreationStatus("loading");
    setPeer(null);
    setCircle(null);
    void fetchPrivateTestStatus(controller.signal).then((status) => {
      if (!controller.signal.aborted) setCreationStatus(status.enabled ? "enabled" : "disabled");
    }).catch(() => { if (!controller.signal.aborted) setCreationStatus("error"); });
    return () => controller.abort();
  }, [currentUserId]);

  const save = async (user: AdminUser) => {
    const type = drafts[user.id] ?? user.memberType;
    if (mutation.current || type === user.memberType) return;
    mutation.current = true;
    setSaving(user.id); setError(null); setSuccess(null);
    try {
      const updated = await setAdminMemberType(user.id, type);
      if (!mounted.current) return;
      setData((current) => current && { ...current, users: current.users.map((item) => item.id === updated.id ? updated : item) });
      setDrafts((current) => ({ ...current, [updated.id]: updated.memberType }));
      setPeer((selected) => selected?.id === updated.id ? updated : selected);
      setSuccess(`${updated.nick} 님을 ${MEMBER_TYPE_LABELS[updated.memberType]} 유형으로 저장했어요.`);
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "회원 유형을 저장하지 못했어요."); }
    finally { mutation.current = false; if (mounted.current) setSaving(null); }
  };

  const createCircle = async () => {
    if (creation.current || creationStatus !== "enabled" || !peer || peer.id === currentUserId || peer.status !== "active" || !currentUserId) return;
    creation.current = true; setCreating(true); setCircleError(null); setCircle(null);
    try {
      const result = await createPrivateTestCircle(peer.id);
      if (mounted.current) setCircle({ slug: result.slug, name: result.name });
    } catch (cause) { if (mounted.current) setCircleError(cause instanceof Error ? cause.message : "테스트 소로우를 만들지 못했어요."); }
    finally { creation.current = false; if (mounted.current) setCreating(false); }
  };

  const disabled = loading || saving !== null;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return <section aria-label="가입 사용자 관리">
    <Hero label="회원 설정" title="함께하는 사람들을 살펴봐요" sub="가입한 회원의 정보와 유형을 확인해요. 파트너·소로우지기 유형은 관리자 권한과 별개예요." stats={data ? [`${query.search ? "검색 결과" : "가입 회원"} ${data.total}명`, "최근 가입순"] : ["최근 가입순"]} />
    <form className={`card ${styles.userSearch}`} onSubmit={(event) => { event.preventDefault(); if (!disabled) { setSuccess(null); setQuery({ search: search.trim(), page: 0 }); } }}>
      <div className="field"><label htmlFor="admin-user-search">닉네임 검색</label><input id="admin-user-search" type="search" value={search} maxLength={24} placeholder="찾고 싶은 회원의 닉네임" onChange={(event) => setSearch(event.target.value)} /></div>
      <button type="submit" className="btn sm" disabled={disabled}>검색</button>
    </form>
    <div className={`card ${styles.privateCircle}`}>
      <h3 className={styles.userName}>비공개 테스트 소로우</h3>
      {creationStatus === "enabled" ? <>
      <p className="tiny muted">나와 선택한 회원만 볼 수 있는 테스트 소로우 · 최상단 고정 · 최대 4명</p>
      <p>{peer ? <><b>{peer.nick}</b> 님과 함께 만들어요.</> : "아래 목록에서 함께할 회원 한 명을 선택해 주세요."}</p>
      <div className={styles.cardFooter}>
        {peer && <button type="button" className="text-btn" disabled={creating} onClick={() => { setPeer(null); setCircle(null); setCircleError(null); }}>선택 해제</button>}
        <button type="button" className="btn sm" disabled={!peer || creating || Boolean(circle)} aria-busy={creating} onClick={() => void createCircle()}>{creating ? "만드는 중…" : "테스트 소로우 만들기"}</button>
      </div>
      {circleError && <p className="notice warn" role="alert">{circleError}</p>}
      {circle && <p role="status"><Link className="text-btn" href={route(`/c/${encodeURIComponent(circle.slug)}`)}>{circle.name} 열기</Link></p>}
      </> : <p className="tiny muted" role="status">{creationStatus === "loading" ? "만들기 가능 여부를 확인하고 있어요." : creationStatus === "error" ? "만들기 상태를 확인하지 못했어요. 회원 조회와 유형 설정은 계속 이용할 수 있어요." : "테스트 소로우 만들기는 현재 준비 중이에요. 회원 조회와 유형 설정은 계속 이용할 수 있어요."}</p>}
    </div>
    <div className={styles.toolbar}><span className="tiny muted">익명 방문 계정은 목록에서 제외해요.</span><button type="button" className="text-btn" disabled={disabled} onClick={() => void load()}>새로고침</button></div>
    {success && <p className={`notice ${styles.success}`} role="status">{success}</p>}
    {error && <LoadError message={error} onRetry={() => void load()} />}
    {loading ? <SkeletonScreen count={2} lines={3} label="가입 사용자를 불러오고 있어요" /> : data && <>
      {data.users.length === 0 ? <p className={`card ${styles.empty}`}>{query.search ? "이 닉네임으로 가입한 회원이 없어요." : "가입한 회원이 아직 없어요."}</p> : <div className="stack">
        {data.users.map((user) => <UserCard key={user.id} user={user} draft={drafts[user.id] ?? user.memberType} busy={disabled || creating} saving={saving === user.id}
          onDraft={(type) => setDrafts((current) => ({ ...current, [user.id]: type }))} onSave={() => void save(user)}
          selectable={creationStatus === "enabled" && Boolean(currentUserId) && user.id !== currentUserId && user.status === "active"} selected={peer?.id === user.id}
          onSelect={() => { if (!creation.current) { setPeer(user); setCircle(null); setCircleError(null); } }} />)}
      </div>}
      <nav className={styles.pagination} aria-label="가입 사용자 목록 페이지">
        <button type="button" className="btn ghost sm" disabled={disabled || data.page === 0} onClick={() => setQuery({ ...query, page: data.page - 1 })}>이전</button>
        <span className="tiny muted">{data.page + 1} / {pages}</span>
        <button type="button" className="btn ghost sm" disabled={disabled || data.page + 1 >= pages} onClick={() => setQuery({ ...query, page: data.page + 1 })}>다음</button>
      </nav>
    </>}
  </section>;
}
