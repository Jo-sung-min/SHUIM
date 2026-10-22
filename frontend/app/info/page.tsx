import type { Metadata } from "next";
import Link from "next/link";
import { IconChevronL, IconChevronR, IconMessage, IconNote, IconShield, IconSparkle, IconTrash } from "@/components/Icons";
import styles from "@/components/ServiceInfo.module.css";
import { LEGAL } from "@/lib/legal";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "서비스 안내",
  description: "소로우의 개인정보 처리방침, 이용약관, 계정 삭제와 고객지원 안내를 확인하세요.",
  alternates: { canonical: "/info" },
};

const documents = [
  { href: "/privacy", title: "개인정보 처리방침", description: "내 정보의 이용과 보관에 대한 안내", Icon: IconShield },
  { href: "/info/ai", title: "AI 이용 및 정보 제공 동의", description: "전송하는 정보 확인과 동의 관리", Icon: IconSparkle },
  { href: "/terms", title: "이용약관·커뮤니티 기준", description: "함께 소로우를 이용하기 위한 약속", Icon: IconNote },
  { href: "/account-deletion", title: "계정 및 데이터 삭제", description: "계정과 기록의 삭제 방법", Icon: IconTrash },
];

export default function InfoPage() {
  return <>
    <header className={styles.header}>
      <Link href="/me" className={styles.back} aria-label="나 화면으로 돌아가기"><IconChevronL /></Link>
      <h1>서비스 안내</h1>
    </header>
    <main className={styles.main}>
      <section className={styles.intro}>
        <div className={styles.brand}>
          {/* The local brand mark is decorative; the adjacent text supplies its name. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.svg" width="54" height="54" alt="" />
          <div><strong>소로우</strong><small>{SITE.tagline}</small></div>
        </div>
        <h2>이용에 필요한 안내를<br />한곳에 모았어요.</h2>
        <p>소로우의 약속과 내 정보에 관한 안내를 확인해요.</p>
      </section>

      <section className={styles.group} aria-labelledby="info-documents">
        <h2 id="info-documents">약관과 개인정보</h2>
        <nav className={styles.menu} aria-label="약관과 개인정보">
          {documents.map(({ href, title, description, Icon }) => <Link key={href} href={href} className={styles.row}>
            <span className={styles.icon}><Icon /></span>
            <span className={styles.rowCopy}><strong>{title}</strong><small>{description}</small></span>
            <IconChevronR className={styles.chevron} />
          </Link>)}
        </nav>
      </section>

      <section className={styles.group} aria-labelledby="info-support">
        <h2 id="info-support">도움이 필요할 때</h2>
        <div className={styles.menu}>
          <a className={styles.row} href={`mailto:${LEGAL.email}?subject=${encodeURIComponent("소로우 문의")}`}>
            <span className={styles.icon}><IconMessage /></span>
            <span className={styles.rowCopy}><strong>고객지원에 문의하기</strong><small>{LEGAL.email}</small></span>
            <IconChevronR className={styles.chevron} />
          </a>
        </div>
      </section>

      {!LEGAL.approved && <div className={styles.draft} role="status"><strong>안내 내용을 확인하고 있어요</strong>현재 정책은 검토 중이에요. 운영 정보와 보관 기간을 확인한 뒤 정식 안내를 공개할게요.</div>}
      <dl className={styles.operator}>
        <div><dt>운영자</dt><dd>{LEGAL.operator}</dd></div>
        <div><dt>문의</dt><dd><a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a></dd></div>
      </dl>
      <p className={styles.signature}>SOROW · WITH YOU</p>
    </main>
  </>;
}
