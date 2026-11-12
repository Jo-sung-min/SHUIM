"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { JoinMode, Visibility, createCircle, normalizeGroupLabel, updateCircle } from "@/lib/circles";
import { fetchMe } from "@/lib/auth";
import { TopBar } from "@/components/ui";
import { IconChevronL } from "@/components/Icons";
import CircleIconPicker, { type IconChoice } from "@/components/CircleIconPicker";
import CircleGroupPicker, { type GroupChoice } from "@/components/CircleGroupPicker";
import { showToast, toastSuccess } from "@/lib/toast";
import styles from "../circle.module.css";
import { route } from "@/lib/routes";

/** 주소를 비워 두면 짧은 무작위 주소를 쓴다 (오픈채팅방처럼 주소까지 고민하지 않아도 되게) */
function randomSlug() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "s-";
  for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}
const withSuffix = (name: string) => `${name.trim().replace(/\s*소로우$/, "")} 소로우`;

/**
 * 소로우 열기. 카카오톡 오픈채팅방처럼 누구나 열고, 연 사람이 소로우지기가 되어 이름·아이콘·가입 방식·멤버를 관리한다.
 * 회사·학교 같은 소속 이름이 아니라 "미식", "자취", "싱글"처럼 즐기는 일·살아가는 일로 연다.
 * 묶음은 기본 묶음이나 다른 사람이 만든 묶음을 고르거나, 디시 마이너 갤러리처럼 새로 만든다 (서버 circle_groups).
 */
export default function NewCirclePage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [choice, setChoice] = useState<IconChoice>({ icon: null, image: null });
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [group, setGroup] = useState<GroupChoice>({ mode: "pick", id: "enjoy" });
  const [intro, setIntro] = useState("");
  const [joinMode, setJoinMode] = useState<JoinMode>("open");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 익명(앱인토스) 계정도 소로우를 열 수 있다. 서버도 같은 기준이다
    fetchMe().then((m) => setSignedIn(Boolean(m.user || m.anonymousId))).catch(() => setSignedIn(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const newGroup = group.mode === "new" ? normalizeGroupLabel(group.label) : null;
    if (group.mode === "new" && !newGroup) {
      setError("새 묶음 이름을 2~10자 한글·영문·숫자로 써 주세요");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const where = group.mode === "pick" ? { kind: group.id } : { group: newGroup ?? "" };
      const c = await createCircle({ name, slug: slug.trim() || randomSlug(), ...where, intro, joinMode, visibility, icon: choice.icon });
      if (choice.image) {
        // 사진은 소로우가 생긴 뒤에 붙는다. 실패해도 소로우는 열렸으니 설정에서 다시 올리면 된다
        try { await updateCircle(c.slug, { iconImage: choice.image }); }
        catch (err) { showToast(err instanceof Error ? err.message : "아이콘 사진은 올리지 못했어요. 설정에서 다시 올릴 수 있어요"); }
      }
      toastSuccess(`${c.name}이 열렸어요`);
      router.replace(route(`/c/${c.slug}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "잠시 후 다시 시도해요");
      setBusy(false);
    }
  };

  const back = <button className="icon-btn" onClick={() => (history.length > 1 ? router.back() : router.push("/c"))} aria-label="뒤로"><IconChevronL /></button>;
  return (
    <>
      <TopBar title="소로우 열기" right={back} />
      <div className={`screen ${styles.plain}`}>
        {signedIn === false ? (
          <div className={styles.locked}>
            <b>로그인하면 바로 열 수 있어요</b>
            연 사람이 소로우지기가 되어 이름·아이콘·가입 방식을 정하고 멤버를 맞이해요.
            <Link href="/me" className="btn" style={{ marginTop: 8 }}>로그인하기</Link>
          </div>
        ) : (
          <form className={styles.form} onSubmit={submit}>
            <div className={styles.field}>
              <span>아이콘</span>
              <CircleIconPicker name={name.trim() ? withSuffix(name) : ""} value={choice} onChange={setChoice} disabled={busy} />
            </div>

            <label className={styles.field}>
              <span>이름</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 미식" maxLength={26} required />
              <small>끝에 ‘소로우’가 붙어요 → {name.trim() ? withSuffix(name) : "미식 소로우"}. 회사·학교 이름은 쓰지 않아요.</small>
            </label>

            <div className={styles.field}>
              <span>묶음</span>
              <CircleGroupPicker value={group} onChange={setGroup} disabled={busy} />
            </div>

            <label className={styles.field}>
              <span>소개</span>
              <textarea className={styles.introBox} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="어떤 이야기를 나누는 곳인지 한 줄로" maxLength={200} rows={2} />
              <small className={styles.count} aria-hidden="true">{intro.length}/200</small>
            </label>

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

            <div className={styles.field}>
              <span>사연 공개</span>
              <div className={styles.seg} role="radiogroup" aria-label="사연 공개 범위">
                <button type="button" role="radio" aria-checked={visibility === "public"} className={styles.opt} onClick={() => setVisibility("public")}>
                  모두에게<small>다른 소로우 사람도 읽고 위로할 수 있어요</small>
                </button>
                <button type="button" role="radio" aria-checked={visibility === "members"} className={styles.opt} onClick={() => setVisibility("members")}>
                  멤버에게만<small>멤버끼리만 나눌 이야기</small>
                </button>
              </div>
            </div>

            <label className={styles.field}>
              <span>주소 <small>선택</small></span>
              <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="비워 두면 자동으로 정해요" maxLength={40} pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
              <small>sorow.co.kr/c/{slug || "…"} · 영문 소문자·숫자·하이픈 3~40자</small>
            </label>

            <p className={styles.sub} style={{ margin: 0 }}>
              연 사람이 소로우지기예요. 멤버가 보낸 사연을 실명·연락처를 가려 올리고, 가입과 멤버를 관리해요. 보낸 사람이 누구인지는 소로우지기도 알 수 없어요.
            </p>
            <p className={styles.sub} style={{ margin: 0 }}>
              소로우를 열면 우리 멤버만 들어오는 바닷가가 생겨요. 멤버가 20명 늘 때마다 다음 풍경이 하나씩 열려요.
            </p>
            {error && <div className="notice warn" role="alert">{error}</div>}
            <button className="btn block" disabled={busy} aria-busy={busy}>{busy ? "여는 중…" : "소로우 열기"}</button>
          </form>
        )}
      </div>
    </>
  );
}
