import styles from "./Profile.module.css";

/** 닉네임 옆 대표 칭호 (얻은 위로 배지 이름). 없으면 아무것도 그리지 않는다 */
export default function TitleChip({ title, small }: { title?: string | null; small?: boolean }) {
  if (!title) return null;
  return <span className={`${styles.title} ${small ? styles.sm : ""}`} title={`칭호 · ${title}`}>{title}</span>;
}
