import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import { IconChevronL } from "@/components/Icons";
import styles from "./ServiceInfo.module.css";

export default function LegalLayout({ title, children, updatedOn, effectiveOn }: { title: string; children: React.ReactNode; updatedOn?: string; effectiveOn?: string }) {
  const published = Boolean(effectiveOn) || LEGAL.approved;
  return <>
    <header className={styles.header}>
      <Link href="/info" className={styles.back} aria-label="서비스 안내로 돌아가기"><IconChevronL /></Link>
      <h1>{title}</h1>
    </header>
    <main className={styles.document} data-policy-status={updatedOn ? undefined : published ? "published" : "draft"}>
      {updatedOn ? <p className={styles.effectiveDate}>안내 갱신일 <time dateTime={updatedOn}>{updatedOn}</time></p> : <>
        {!published && <div className={styles.draft} role="status">현재 안내는 검토 중입니다. 운영 정보와 보관 기간을 확인한 뒤 정식 안내를 공개할 예정입니다.</div>}
        <p className={styles.effectiveDate}>시행일: {effectiveOn ? <time dateTime={effectiveOn}>{effectiveOn}</time> : LEGAL.effectiveDate}</p>
      </>}
      <article className={styles.documentCard}>
        {children}
        <section><h2>문의</h2><p>운영자: {LEGAL.operator}<br /><a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a></p></section>
      </article>
      <Link href="/info" className={styles.returnLink}><IconChevronL />서비스 안내로 돌아가기</Link>
    </main>
  </>;
}
