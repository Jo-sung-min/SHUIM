"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { PublicProfile } from "@/lib/social";
import { IconUser } from "./Icons";
import TitleChip from "./TitleChip";
import styles from "./Profile.module.css";
import { route } from "@/lib/routes";

/**
 * 프로필 머리: 사진 · 숫자 줄(위로글 · 리스너 · 리스닝) · 닉네임 + 칭호 · 소개 · 버튼 줄.
 * 나 페이지와 공개 프로필이 같은 모양을 쓴다(인스타그램처럼 내 프로필 = 남이 보는 화면).
 * 리스너·리스닝 숫자를 누르면 목록. 내가 위로한 횟수는 보여 주지 않는다.
 */
export default function ProfileHeader({ profile, onAvatar, extra, actions }: {
  profile: PublicProfile;
  /** 내 화면: 사진을 누르면 프로필 편집 */
  onAvatar?: () => void;
  /** 소개 아래 작은 줄 (내 화면의 연속 기록 등) */
  extra?: ReactNode;
  /** 버튼 줄 */
  actions?: ReactNode;
}) {
  const p = profile;
  const avatar = (
    <>
      {!p.avatarUrl && (p.nick ? p.nick.slice(0, 1) : <IconUser />)}
    </>
  );
  const avatarStyle = p.avatarUrl ? { backgroundImage: `url(${p.avatarUrl})` } : undefined;
  const people = (kind: "listeners" | "listening") => route(`/u/${encodeURIComponent(p.id)}/${kind}`);
  return (
    <section className={styles.header} aria-label={`${p.nick} 프로필`}>
      <div className={styles.top}>
        {onAvatar
          ? <button type="button" className="avatar xl" style={avatarStyle} onClick={onAvatar} aria-label="프로필 사진과 정보 수정">{avatar}</button>
          : <span className="avatar xl" style={avatarStyle} aria-hidden="true">{avatar}</span>}
        <div className={styles.numbers}>
          <div className={styles.number}><b>{p.stats.feedPosts}</b><small>위로글</small></div>
          <Link href={people("listeners")} className={styles.number} aria-label={`리스너 ${p.stats.followers}명 보기`}><b>{p.stats.followers}</b><small>리스너</small></Link>
          <Link href={people("listening")} className={styles.number} aria-label={`리스닝 ${p.stats.following}명 보기`}><b>{p.stats.following}</b><small>리스닝</small></Link>
        </div>
      </div>
      <div className={styles.who}>
        <div className={styles.nameRow}>
          <h2>{p.nick}</h2>
          <TitleChip title={p.title} />
          {p.isCreator && <span className="badge">크리에이터</span>}
        </div>
        {p.bio ? <p className={styles.bio}>{p.bio}</p> : p.creatorBio ? <p className={styles.bio}>{p.creatorBio}</p> : <p className={`${styles.bio} ${styles.empty}`}>소개가 아직 없어요.</p>}
        {p.followsMe && <span className={styles.mutual}>나를 리스닝 중</span>}
        {p.blocked && <p className={styles.meta}>신고 누적으로 차단된 사용자예요.</p>}
        {extra}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </section>
  );
}
