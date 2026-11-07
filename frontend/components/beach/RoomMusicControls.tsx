"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconMusic } from "@/components/Icons";
import type { MapId } from "@/lib/beach/maps";
import { changeRoomMusic, readMusicPreferences, RoomMusicPlayer, ROOM_TRACKS, type ListenerStatus, type MusicAction, type MusicPreferences, type RoomMusicState, type TrackId } from "@/lib/beach/room-music";
import styles from "./RoomMusicControls.module.css";

type Props = {
  ticket: string; communityId: string; mapId: MapId; music?: RoomMusicState; serverTime: number;
  canControl: boolean; disabled: boolean; onSnapshot: (music: RoomMusicState, serverTime: number) => void;
  ambient?: { volume: number; onChange: (percent: number) => void };
};

const IDLE_MUSIC: RoomMusicState = { ...ROOM_TRACKS["morning-v1"], playing: false, startedAt: null, version: 0 };

export default function RoomMusicControls({ ticket, communityId, mapId, music = IDLE_MUSIC, serverTime, canControl, disabled, onSnapshot, ambient }: Props) {
  const player = useRef<RoomMusicPlayer | null>(null), request = useRef<AbortController | null>(null);
  const panel = useId(), box = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(""), [status, setStatus] = useState<ListenerStatus>("idle");
  const [preferences, setPreferences] = useState<MusicPreferences>({ volume: .32, muted: false });
  const [choice, setChoice] = useState<TrackId>(music.trackId);
  const background = mapId === "uyuni" ? ambient : undefined;
  const hasBackground = background !== undefined;

  useEffect(() => {
    const saved = readMusicPreferences();
    const current = new RoomMusicPlayer(communityId, mapId, saved, setStatus);
    player.current = current;
    setPreferences(saved); setOpen(false); setBusy(false); setNotice(""); setStatus("idle");
    return () => { request.current?.abort(); request.current = null; current.dispose(); player.current = null; };
  }, [communityId, mapId, ticket]);
  useEffect(() => {
    player.current?.setSuspended(disabled);
    player.current?.sync(music, serverTime);
  }, [communityId, mapId, ticket, music, serverTime, disabled]);
  useEffect(() => { if (!music.playing && !canControl && !hasBackground) setOpen(false); }, [music.playing, canControl, hasBackground]);
  useEffect(() => { setChoice(music.trackId); }, [music.trackId]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (e.target instanceof Node && !box.current?.contains(e.target)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  function save(next: MusicPreferences) { setPreferences(next); player.current?.setPreferences(next); }
  async function change(action: MusicAction) {
    if (!canControl || disabled || request.current) return;
    if (action === "play") player.current?.unlock();
    const operation = new AbortController();
    request.current = operation; setBusy(true); setNotice("");
    try {
      const result = await changeRoomMusic(ticket, action, music.version, operation.signal, choice);
      if (request.current !== operation) return;
      onSnapshot(result.music, result.serverTime);
      if (result.music.playing !== (action === "play") || (action === "play" && result.music.trackId !== choice))
        setNotice("방의 음악 상태가 바뀌었어요. 다시 확인해 주세요.");
    } catch (error) {
      if (request.current === operation) setNotice(error instanceof Error && error.name !== "TimeoutError" ? error.message : "연결이 늦어지고 있어요. 다시 시도해 주세요.");
    } finally {
      if (request.current === operation) { request.current = null; setBusy(false); }
    }
  }

  if (!canControl && !music.playing && !hasBackground) return null;
  const quiet = preferences.muted || preferences.volume === 0;
  const needsListen = music.playing && !quiet && (status === "listen" || status === "error");
  return <div ref={box} className={styles.control}>
    <button ref={trigger} type="button" className={styles.trigger} aria-label="방 음악" aria-expanded={open} aria-controls={panel}
      data-playing={music.playing} onClick={() => { setOpen(!open); player.current?.unlock(); }}>
      <IconMusic /><span>음악</span>
    </button>
    {open && <section id={panel} className={styles.panel} aria-label="방 음악 설정">
      {background && <div className={styles.background} data-shared={canControl || music.playing}>
        <div className={styles.heading}><span className={styles.cover}><IconMusic /></span><div>
          <small>우유니 배경음</small><strong>잔잔한 밤</strong>
        </div></div>
        <div className={styles.backgroundVolume}>
          <label htmlFor={panel + "-background"}>내 배경음 음량</label>
          <output htmlFor={panel + "-background"}>{background.volume}%</output>
          <input id={panel + "-background"} type="range" min="0" max="100" step="1" value={background.volume}
            aria-valuetext={background.volume === 0 ? "음소거" : background.volume + "%"}
            onChange={e => background.onChange(Number(e.target.value))} />
        </div>
        {music.playing && background.volume > 0 && <p className={styles.notice}>방 음악이 끝나면 배경음이 다시 들려요.</p>}
      </div>}
      {(!background || music.playing) && <div className={styles.heading}><span className={styles.cover}><IconMusic /></span><div>
        <small>{disabled ? "다시 연결 중" : music.playing ? "방에서 재생 중" : "방 음악"}</small>
        <strong>{music.title}</strong>
      </div></div>}
      {canControl && <>
        <fieldset className={styles.tracks} disabled={busy || disabled}><legend>{background ? "방 음악 선택" : "곡 선택"}</legend>
          {Object.values(ROOM_TRACKS).map(track => <label key={track.trackId}>
            <input type="radio" name={panel + "-track"} checked={choice === track.trackId} onChange={() => setChoice(track.trackId)} />
            <span>{track.title}</span><small>{Math.floor(track.durationMs / 60000)}:{String(Math.floor(track.durationMs / 1000) % 60).padStart(2, "0")}</small>
          </label>)}
        </fieldset>
        <div className={styles.actions}>
          {(!music.playing || choice !== music.trackId) && <button type="button" className={styles.broadcast} disabled={busy || disabled} onClick={() => void change("play")}>
            {busy ? "확인 중…" : music.playing ? "곡 바꾸기" : "방 음악 재생"}
          </button>}
          {music.playing && <button type="button" className={styles.stop} disabled={busy || disabled} onClick={() => void change("stop")}>
            방 음악 정지
          </button>}
        </div>
      </>}
      {music.playing && <>
        {needsListen && <button type="button" className={styles.listen} disabled={disabled} onClick={() => player.current?.listen(true)}>
          {status === "error" ? "다시 듣기" : "듣기"}
        </button>}
        <div className={styles.volume}>
          <button type="button" className={styles.speaker} aria-label="내 음악 음소거" aria-pressed={quiet}
            onClick={() => save(quiet ? { muted: false, volume: preferences.volume || .32 } : { ...preferences, muted: true })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 9h4l5-4v14l-5-4H3z" />{quiet ? <path d="m16 9 5 6m0-6-5 6" /> : <path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />}
            </svg>
          </button>
          <label><span>내 음악 음량</span><input type="range" min="0" max="100" step="1" value={Math.round(preferences.volume * 100)}
            onChange={e => save({ muted: false, volume: Number(e.target.value) / 100 })} aria-valuetext={Math.round(preferences.volume * 100) + "%"} /></label>
        </div>
      </>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
    </section>}
  </div>;
}
