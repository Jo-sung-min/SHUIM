"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchMe } from "@/lib/auth";
import { ORB_KINDS, ORB_MOODS, orbDayLabel, orbDayShort, orbTally, type AlbumPhoto, type Orb } from "@/lib/emotion-orbs";
import { Empty, SkeletonList, TopBar } from "@/components/ui";
import { IconChevronL, IconImage } from "@/components/Icons";
import EmotionOrb from "@/components/EmotionOrb";
import { OrbSheet, PhotoSheet, mapName, photoDay, useKeepsakes } from "@/components/Keepsakes";
import styles from "@/components/Keepsakes.module.css";

type Tab = "orbs" | "album";

/**
 * 보관함: 맵에서 주운 감정구슬과 맵 앨범 (docs/EMOTION_ORBS.md 5·6장). 본인만 본다.
 * 구슬 탭은 첫 구슬을 주운 뒤에만 생긴다. 서버가 앨범을 모르면 앨범 탭도 없다.
 */
export default function KeepsakesPage() {
  return <Suspense><Keepsakes /></Suspense>;
}

function Keepsakes() {
  const router = useRouter();
  const wanted = useSearchParams().get("tab");
  const [signedIn, setSignedIn] = useState(false);
  const { orbs, album, loaded, error, setOrbs, setAlbum } = useKeepsakes(signedIn);
  const [tab, setTab] = useState<Tab | null>(wanted === "album" ? "album" : wanted === "orbs" ? "orbs" : null);
  const [orb, setOrb] = useState<Orb | null>(null);
  const [photo, setPhoto] = useState<AlbumPhoto | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchMe(true).then((me) => {
      if (!alive) return;
      // 로그인하지 않았으면 보여 줄 것이 없다 (로그인하면 나 화면으로)
      if (!me.user) { router.replace("/auth?next=me"); return; }
      setSignedIn(true);
    }).catch(() => { if (alive) setSignedIn(true); });
    return () => { alive = false; };
  }, [router]);

  const hasOrbs = Boolean(orbs && orbs.length > 0);
  const tabs: Tab[] = [...(hasOrbs ? ["orbs" as const] : []), ...(album ? ["album" as const] : [])];
  const current: Tab | null = tab && tabs.includes(tab) ? tab : tabs[0] ?? null;
  const tally = orbTally(orbs ?? []);
  const back = <Link href="/me" className="icon-btn" aria-label="내 공간으로"><IconChevronL /></Link>;

  return (
    <>
      <TopBar title="보관함" right={back} />
      <div className="screen">
        {!loaded ? <div role="status" aria-label="보관함을 불러오고 있어요"><SkeletonList count={2} lines={2} /></div>
          : current === null ? (
            <Empty icon={<IconImage />} title={error ? "보관함을 불러오지 못했어요" : "보관함이 아직 비어 있어요"} action={<Link href="/c/home" className="btn">소로우 맵으로</Link>}>
              {error ?? "소로우 맵에서 머문 순간들이 이곳에 모여요."}
            </Empty>
          ) : (
            <>
              {tabs.length > 1 && <div className={styles.tabs} role="tablist" aria-label="보관함">
                {tabs.map((id) => (
                  <button key={id} type="button" role="tab" id={`ktab-${id}`} aria-selected={current === id} aria-controls={`kpanel-${id}`} className={styles.tab} onClick={() => setTab(id)}>
                    {id === "orbs" ? "감정구슬" : "앨범"}<small>{id === "orbs" ? orbs?.length ?? 0 : album?.photos.length ?? 0}</small>
                  </button>
                ))}
              </div>}

              {current === "orbs" && orbs && (
                <div className={styles.panel} role="tabpanel" id="kpanel-orbs" aria-labelledby={tabs.length > 1 ? "ktab-orbs" : undefined}>
                  <p className={styles.lead}>맵에 머물다 주운 구슬이에요. 그날의 마음을 닮은 빛깔로 남아 있어요.</p>
                  <ul className={styles.tally} aria-label="빛깔별 구슬 수">
                    {ORB_MOODS.filter((mood) => tally[mood] > 0).map((mood) => (
                      <li key={mood}><EmotionOrb mood={mood} size={16} glow={false} />{ORB_KINDS[mood].name.replace(" 구슬", "")} {tally[mood]}</li>
                    ))}
                  </ul>
                  <div className={styles.orbGrid} role="list">
                    {orbs.map((item) => (
                      <button key={item.id} type="button" role="listitem" className={styles.orbTile} aria-label={`${orbDayLabel(item.day)}, ${mapName(item.mapId)}에서 주운 ${ORB_KINDS[item.mood].name}`} onClick={() => setOrb(item)}>
                        <EmotionOrb mood={item.mood} size={58} />
                        <b>{orbDayShort(item.day)}</b>
                        <small>{mapName(item.mapId)}</small>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {current === "album" && album && (
                <div className={styles.panel} role="tabpanel" id="kpanel-album" aria-labelledby={tabs.length > 1 ? "ktab-album" : undefined}>
                  <div className={styles.albumHead}>
                    <p>소로우 맵에서 찍어 넣은 사진이에요.</p>
                    <small aria-label={`${album.max}장 중 ${album.photos.length}장`}>{album.photos.length} / {album.max}</small>
                  </div>
                  {album.photos.length === 0 ? (
                    <Empty icon={<IconImage />} title="아직 넣은 사진이 없어요" action={<Link href="/c/home" className="btn">소로우 맵으로</Link>}>
                      맵에서 사진을 찍고 &lsquo;앨범에 넣기&rsquo;를 누르면 여기에 모여요.
                    </Empty>
                  ) : (
                    <div className={styles.photoGrid} role="list">
                      {album.photos.map((item) => (
                        <button key={item.id} type="button" role="listitem" className={styles.photoTile} aria-label={`${mapName(item.mapId)}에서 찍은 사진, ${photoDay(item.createdAt)}`} onClick={() => setPhoto(item)}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.url} alt="" loading="lazy" decoding="async" />
                          <span>{mapName(item.mapId)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
      </div>

      {orb && <OrbSheet orb={orb} onClose={() => setOrb(null)} onDropped={(id) => { setOrbs((list) => list?.filter((item) => item.id !== id) ?? list); setOrb(null); }} />}
      {photo && <PhotoSheet photo={photo} onClose={() => setPhoto(null)} onRemoved={(id) => { setAlbum((value) => (value ? { ...value, photos: value.photos.filter((item) => item.id !== id) } : value)); setPhoto(null); }} />}
    </>
  );
}
