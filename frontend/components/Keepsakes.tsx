"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import EmotionOrb from "./EmotionOrb";
import { Sheet } from "./ui";
import { IconChevronR, IconTrash } from "./Icons";
import { MAPS, type MapId } from "@/lib/beach/maps";
import { canSharePhoto, downloadBeachPhoto, shareBeachPhoto } from "@/lib/beach/photo";
import { ORB_KINDS, orbCompanionNote, orbDayLabel, orbDayShort, orbPlaceLabel, orbSpaceLabel, type AlbumPhoto, type Orb } from "@/lib/emotion-orbs";
import { dropOrb, fetchAlbum, fetchOrbShelf, removeAlbumPhoto, type Album } from "@/lib/keepsakes";
import { route } from "@/lib/routes";
import { showToast, toastSuccess } from "@/lib/toast";
import styles from "./Keepsakes.module.css";

/** 보관함: 주운 감정구슬과 맵 앨범 (docs/EMOTION_ORBS.md 5·6장). 본인만 본다 */

export const mapName = (mapId: string): string => MAPS[mapId as MapId]?.name ?? "소로우 맵";
/** 사진을 넣은 날: 2026.11.13 */
export function photoDay(at: number): string {
  if (!at) return "";
  const d = new Date(at);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

/** 서버가 아는 것만 불러온다: 구슬을 모르는 서버면 orbs 가 null, 앨범을 모르면 album 이 null */
export function useKeepsakes(enabled = true) {
  const [orbs, setOrbs] = useState<Orb[] | null>(null);
  const [album, setAlbum] = useState<Album | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void Promise.allSettled([fetchOrbShelf(), fetchAlbum()]).then(([shelf, photos]) => {
      if (!alive) return;
      if (shelf.status === "fulfilled") setOrbs(shelf.value ? shelf.value.orbs : null);
      if (photos.status === "fulfilled") setAlbum(photos.value);
      const failed = [shelf, photos].find((result) => result.status === "rejected");
      setError(failed && failed.status === "rejected" ? (failed.reason instanceof Error ? failed.reason.message : "보관함을 불러오지 못했어요.") : null);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [enabled]);
  return { orbs, album, loaded, error, setOrbs, setAlbum };
}

/**
 * 나 페이지의 보관함 한 칸. 서버가 구슬도 앨범도 모르면 아무것도 그리지 않는다.
 * 구슬 줄은 첫 구슬을 주운 뒤에만 보인다: 그 전에는 구슬의 존재를 알리지 않는다.
 */
export function KeepsakeShelf() {
  const { orbs, album, setOrbs } = useKeepsakes();
  const [picked, setPicked] = useState<Orb | null>(null);
  const hasOrbs = Boolean(orbs && orbs.length > 0);
  if (!hasOrbs && !album) return null;
  return (
    <section className={styles.box} aria-labelledby="keepsake-title">
      <div className={styles.head}>
        <h3 id="keepsake-title">보관함</h3>
        <small>나만 보여요</small>
        <Link href={hasOrbs ? "/me/keepsakes" : "/me/keepsakes?tab=album"} className={styles.more}>모두 보기<IconChevronR aria-hidden /></Link>
      </div>
      {hasOrbs && orbs && <div className={styles.row}>
        <p className={styles.rowHead}>감정구슬 <b>{orbs.length}</b></p>
        <div className={styles.orbs} role="list">
          {orbs.slice(0, 14).map((orb) => (
            <button key={orb.id} type="button" role="listitem" className={styles.orbCell} aria-label={`${orbDayLabel(orb.day)}의 ${ORB_KINDS[orb.mood].name}`} onClick={() => setPicked(orb)}>
              <EmotionOrb mood={orb.mood} size={46} />
              <small>{orbDayShort(orb.day)}</small>
            </button>
          ))}
        </div>
      </div>}
      {album && <div className={styles.row}>
        <p className={styles.rowHead}>맵 앨범 <b>{album.photos.length}</b></p>
        {album.photos.length > 0 ? (
          <Link href="/me/keepsakes?tab=album" className={styles.thumbs} aria-label={`맵 앨범 사진 ${album.photos.length}장 보기`}>
            {album.photos.slice(0, 4).map((photo) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={photo.id} src={photo.url} alt="" loading="lazy" decoding="async" />
            ))}
          </Link>
        ) : <p className={styles.hint}>소로우 맵에서 사진을 찍고 &lsquo;앨범에 넣기&rsquo;를 누르면 여기에 모여요.</p>}
      </div>}
      {picked && <OrbSheet orb={picked} onClose={() => setPicked(null)} onDropped={(id) => { setOrbs((current) => current?.filter((orb) => orb.id !== id) ?? current); setPicked(null); }} />}
    </section>
  );
}

/** 구슬 하나: 언제, 어디서, 그날의 기분, 함께 있던 사람들. 권유나 판정 문구는 붙이지 않는다 */
export function OrbSheet({ orb, onClose, onDropped }: { orb: Orb; onClose: () => void; onDropped: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const kind = ORB_KINDS[orb.mood];
  const note = orbCompanionNote(orb);
  const drop = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await dropOrb(orb.id);
      toastSuccess("구슬을 내려놓았어요.");
      onDropped(orb.id);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "구슬을 내려놓지 못했어요.", { kind: "info" });
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={kind.name}>
      <div className={styles.orbSheet}>
        <div className={styles.orbBig}><EmotionOrb mood={orb.mood} size={128} /></div>
        <p className={styles.feeling}>그날의 기분 · {kind.feeling}</p>
        <dl className={styles.memo}>
          <div><dt>언제</dt><dd>{orbDayLabel(orb.day)}</dd></div>
          <div><dt>어디서</dt><dd>{orbPlaceLabel(mapName(orb.mapId), orb.spotName)}<small>{orbSpaceLabel(orb)}</small></dd></div>
          <div><dt>함께</dt><dd>
            {orb.companions.length > 0 && <span className={styles.people}>
              {orb.companions.map((c) => <Link key={c.id} href={route(`/u/${c.id}`)}>{c.nick}</Link>)}
            </span>}
            {note && <small>{note}</small>}
          </dd></div>
        </dl>
        {confirming ? (
          <div className={styles.confirm} role="group" aria-label="구슬 내려놓기">
            <p>이 구슬을 보관함에서 내려놓을까요? 되돌릴 수 없고, 이 날의 구슬은 다시 생기지 않아요.</p>
            <div className="sheet-actions">
              <button type="button" className="btn ghost" disabled={busy} onClick={() => setConfirming(false)}>그대로 둘게요</button>
              <button type="button" className="btn ghost danger" disabled={busy} onClick={() => void drop()}>{busy ? "내려놓는 중…" : "내려놓기"}</button>
            </div>
          </div>
        ) : <button type="button" className={styles.drop} onClick={() => setConfirming(true)}>이 구슬 내려놓기</button>}
      </div>
    </Sheet>
  );
}

/** 앨범의 사진 한 장: 크게 보고, 저장·공유하고, 지운다 */
export function PhotoSheet({ photo, onClose, onRemoved }: { photo: AlbumPhoto; onClose: () => void; onRemoved: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"save" | "share" | "remove" | null>(null);
  const busyRef = useRef(false);
  const where = [mapName(photo.mapId), photo.spaceName, photoDay(photo.createdAt)].filter(Boolean).join(" · ");

  /** 저장·공유는 사진을 다시 받아 파일로 만든다. 받지 못하면(다른 출처 제한) 새 창으로 연다 */
  const withFile = async (kind: "save" | "share") => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    try {
      const blob = await (await fetch(photo.url, { mode: "cors", cache: "force-cache" })).blob();
      if (!blob.size || !blob.type.startsWith("image/")) throw new Error("not an image");
      // 올린 그대로의 형식으로 (앨범 사진은 보통 WebP 다)
      const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
      const file = new File([blob], `sorow-${photoDay(photo.createdAt).replaceAll(".", "-") || "album"}-${photo.id}.${extension}`, { type: blob.type });
      const url = URL.createObjectURL(file);
      try {
        if (kind === "share" && canSharePhoto(file)) await shareBeachPhoto(file);
        else downloadBeachPhoto({ file, url });
      } finally { window.setTimeout(() => URL.revokeObjectURL(url), 4000); }
    } catch {
      window.open(photo.url, "_blank", "noopener");
    } finally { busyRef.current = false; setBusy(null); }
  };
  const remove = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy("remove");
    try {
      await removeAlbumPhoto(photo.id);
      toastSuccess("사진을 지웠어요.");
      onRemoved(photo.id);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "사진을 지우지 못했어요.", { kind: "info" });
    } finally { busyRef.current = false; setBusy(null); }
  };
  return (
    <Sheet open onClose={onClose} title="맵 앨범">
      <div className={styles.photoSheet}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.photoBig} src={photo.url} alt={`${mapName(photo.mapId)}에서 찍은 사진`} />
        <p className={styles.where}>{where}</p>
        {confirming ? (
          <div className={styles.confirm} role="group" aria-label="사진 지우기">
            <p>이 사진을 앨범에서 지울까요? 되돌릴 수 없어요.</p>
            <div className="sheet-actions">
              <button type="button" className="btn ghost" disabled={busy !== null} onClick={() => setConfirming(false)}>그대로 둘게요</button>
              <button type="button" className="btn ghost danger" disabled={busy !== null} onClick={() => void remove()}>{busy === "remove" ? "지우는 중…" : "지우기"}</button>
            </div>
          </div>
        ) : (
          <div className={styles.photoActions}>
            <button type="button" className="btn ghost" disabled={busy !== null} onClick={() => void withFile("save")}>{busy === "save" ? "받는 중…" : "저장"}</button>
            <button type="button" className="btn ghost" disabled={busy !== null} onClick={() => void withFile("share")}>{busy === "share" ? "여는 중…" : "공유"}</button>
            <button type="button" className={`btn ghost danger ${styles.trash}`} disabled={busy !== null} aria-label="사진 지우기" onClick={() => setConfirming(true)}><IconTrash aria-hidden /></button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
