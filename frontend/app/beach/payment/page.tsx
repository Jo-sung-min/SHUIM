import Link from "next/link";
import styles from "./payment.module.css";

export default function BeachPaymentPage() {
  return <main className={styles.page}>
    <section className={styles.card}>
      <p className={styles.eyebrow}>SOROW</p>
      <h1>현재 이용할 수 없는 화면이에요</h1>
      <p className={styles.message}>소로우에서 편안하게 쉬어가세요.</p>
      <div className={styles.actions}><Link className={styles.primary} href="/c/home">소로우로 돌아가기</Link></div>
    </section>
  </main>;
}
