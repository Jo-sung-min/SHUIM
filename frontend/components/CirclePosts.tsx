"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CommunityStore, Post, api, commentsOf, isFlagged, isVisible, shoutCatById } from "@/lib/community";
import { circleTag } from "@/lib/circles";
import { fmtRelative } from "./ui";
import { ShoutCatIcon } from "./CategoryIcon";
import { CheerButton, LineAction, run } from "./CommunityUI";
import { IconBubble, IconMore } from "./Icons";
import styles from "@/app/shout/shout.module.css";
import { splitShout } from "@/app/shout/split";
import { route } from "@/lib/routes";

/** 소로우 사연 목록 (외침 목록과 같은 줄 모양). 닉네임 자리에는 "OO 소로우 #번호" */
export function circlePostsOf(s: CommunityStore, circleIds: Set<string>): Post[] {
  return s.posts.filter((p) => p.communityId && circleIds.has(p.communityId) && isVisible(s, p)).sort((a, b) => b.createdAt - a.createdAt);
}

export default function CirclePosts({
  s,
  posts,
  onChange,
  onMenu,
  showCircle = true,
}: {
  s: CommunityStore;
  posts: Post[];
  onChange: (s: CommunityStore) => void;
  onMenu: (postId: string) => void;
  showCircle?: boolean;
}) {
  const router = useRouter();
  return (
    <ul className={styles.rows}>
      {posts.map((p) => {
        const c = shoutCatById(p.cat);
        const { title, rest } = splitShout(p.text);
        const comments = commentsOf(s, p.id).length;
        const pending = p.createdAt > Date.now();
        return (
          <li key={p.id} className={styles.row}>
            <article className={styles.item}>
              <Link href={route(`/shout/${p.id}`)} className={styles.itemLink}>
                <div className={styles.itemText}>
                  {isFlagged(p) ? <p className={styles.preview}>신고가 누적되어 검토 중인 사연이에요. 눌러서 볼 수 있어요.</p> : (
                    <>
                      <h3 className={styles.title}>{title}</h3>
                      {rest && <p className={styles.preview}>{rest}</p>}
                    </>
                  )}
                  <p className={styles.byline}>
                    <span className={styles.circleTag}>{showCircle ? circleTag(p) : `#${p.postNo ?? ""}`}</span>
                    <span aria-hidden="true">·</span>
                    <span className={styles.chan}><ShoutCatIcon id={c.id} />{c.label}</span>
                    {p.authorId === s.me.id && <span>· 내 사연{pending ? " (곧 게시돼요)" : ""}</span>}
                  </p>
                </div>
              </Link>
              <div className={`post-foot ${styles.foot}`}>
                <CheerButton small count={p.cheers.length} on={p.cheers.includes(s.me.id)} onClick={() => run(onChange, () => api.toggleCheer({ kind: "post", id: p.id }))} />
                <LineAction icon={<IconBubble style={{ width: 18, height: 18 }} />} label={comments} onClick={() => router.push(route(`/shout/${p.id}`))} ariaLabel={`위로 댓글 ${comments}개`} />
                <span className={styles.time}>{fmtRelative(p.createdAt)}</span>
                <button type="button" className={`icon-btn ${styles.more}`} aria-label="더보기" onClick={() => onMenu(p.id)}><IconMore style={{ width: 16, height: 16 }} /></button>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
