"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CIRCLE_KINDS, CircleKind, JoinMode, Visibility, createCircle } from "@/lib/circles";
import { fetchMe } from "@/lib/auth";
import { TopBar } from "@/components/ui";
import { IconChevronL } from "@/components/Icons";
import { toastSuccess } from "@/lib/toast";
import Link from "next/link";
import styles from "../circle.module.css";

/** 소로우 열기. 가입한 계정만, 한 사람이 3개까지. 학교·회사는 그 메일 도메인으로만 멤버가 된다 */
export default function NewCirclePage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [kind, setKind] = useState<CircleKind>("school");
  const [domain, setDomain] = useState("");
  const [intro, setIntro] = useState("");
  const [joinMode, setJoinMode] = useState<JoinMode>("open");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMe().then((m) => setSignedIn(Boolean(m.user))).catch(() => setSignedIn(false));
  }, []);
  const org = kind === "school" || kind === "company";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const c = await createCircle({ name, slug, kind, intro, joinMode: org ? "domain" : joinMode, visibility, domain: org ? domain : undefined });
      toastSuccess(`${c.name}이 열렸어요`);
      router.replace(`/c/${c.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "잠시 후 다시 시도해요");
      setBusy(false);
    }
  };

  const back = <button className="icon-btn" onClick={() => router.back()} aria-label="뒤로"><IconChevronL /></button>;
  return (
    <>
      <TopBar title="소로우 열기" right={back} />
      <div className={`screen ${styles.plain}`}>
        {signedIn === false ? (
          <div className={styles.locked}>
            <b>가입한 계정만 소로우를 열 수 있어요</b>
            소로우를 지키는 소로우지기는 책임이 따르는 자리라서, 로그인한 뒤에 열 수 있어요.
            <Link href="/auth" className="btn" style={{ marginTop: 8 }}>로그인하기</Link>
          </div>
        ) : (
          <form className={styles.form} onSubmit={submit}>
            <div className={styles.field}>
              <span>종류</span>
              <div className={styles.seg} role="radiogroup" aria-label="소로우 종류">
                {CIRCLE_KINDS.map((k) => (
                  <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={styles.opt} onClick={() => setKind(k.id)}>
                    {k.label}
                    <small>{k.hint}</small>
                  </button>
                ))}
              </div>
            </div>

            <label className={styles.field}>
              <span>이름</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 고려대" maxLength={26} required />
              <small>끝에 ‘소로우’가 붙어요 → {name.trim() ? `${name.trim().replace(/\s*소로우$/, "")} 소로우` : "고려대 소로우"}</small>
            </label>

            <label className={styles.field}>
              <span>주소</span>
              <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="korea-univ" maxLength={40} required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
              <small>sorow.co.kr/c/{slug || "korea-univ"} · 영문 소문자·숫자·하이픈 3~40자</small>
            </label>

            {org && (
              <label className={styles.field}>
                <span>{kind === "school" ? "학교" : "회사"} 메일 도메인</span>
                <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder={kind === "school" ? "korea.ac.kr" : "samsung.com"} maxLength={100} required autoCapitalize="off" spellCheck={false} />
                <small>이 도메인 메일로 인증한 사람만 멤버가 돼요. 나도 이 메일로 인증하면 ‘인증 소로우’ 표시가 붙어요. 메일 주소는 저장하지 않아요.</small>
              </label>
            )}

            <label className={styles.field}>
              <span>소개</span>
              <textarea value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="어떤 이야기를 나누는 곳인지 한두 줄로" maxLength={200} style={{ minHeight: 96 }} />
            </label>

            {!org && (
              <div className={styles.field}>
                <span>가입 방식</span>
                <div className={styles.seg} role="radiogroup" aria-label="가입 방식">
                  {(["open", "approve", "invite"] as const).map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={joinMode === m} className={styles.opt} onClick={() => setJoinMode(m)}>
                      {m === "open" ? "누구나" : m === "approve" ? "승인 후" : "초대 코드"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.field}>
              <span>사연 공개</span>
              <div className={styles.seg} role="radiogroup" aria-label="사연 공개 범위">
                <button type="button" role="radio" aria-checked={visibility === "public"} className={styles.opt} onClick={() => setVisibility("public")}>
                  모두에게<small>다른 소로우 사람도 읽고 위로할 수 있어요</small>
                </button>
                <button type="button" role="radio" aria-checked={visibility === "members"} className={styles.opt} onClick={() => setVisibility("members")}>
                  멤버에게만<small>회사처럼 안에서만 나눌 이야기</small>
                </button>
              </div>
            </div>

            <p className={styles.sub} style={{ margin: 0 }}>
              소로우를 연 사람은 소로우지기가 돼요. 멤버가 보낸 사연을 읽고, 실명·연락처를 가린 뒤 올려요. 보낸 사람이 누구인지는 소로우지기도 알 수 없어요. 멤버가 10명이 넘으면 둘러보기에 나와요.
            </p>
            {error && <div className="notice warn" role="alert">{error}</div>}
            <button className="btn block" disabled={busy} aria-busy={busy}>{busy ? "여는 중…" : "소로우 열기"}</button>
          </form>
        )}
      </div>
    </>
  );
}
