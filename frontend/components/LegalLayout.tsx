import Link from "next/link";
import { LEGAL } from "@/lib/legal";

export default function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return <>
    <header className="topbar"><h1><span className="eyebrow">소로우 · {LEGAL.operator}</span>{title}</h1><Link href="/me" className="text-btn">나로 돌아가기</Link></header>
    <main className="screen legal-document">
      {!LEGAL.approved && <div className="notice warn" role="status">배포 준비용 안내입니다. 운영 정보와 보유기간을 확인한 뒤 정식으로 공개할 예정입니다.</div>}
      <p className="tiny muted">시행일: {LEGAL.effectiveDate}</p>
      {children}
      <section><h2>문의</h2><p>운영자: {LEGAL.operator}<br /><a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a></p></section>
      <nav className="legal-links" aria-label="서비스 안내"><Link href="/privacy">개인정보 처리방침</Link><Link href="/terms">이용약관·커뮤니티 기준</Link><Link href="/account-deletion">계정 및 데이터 삭제</Link></nav>
    </main>
  </>;
}
