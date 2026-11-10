"use client";

import { useEffect, useRef, useState } from "react";
import type { ChibiViewer, ViewPreset, ViewerStats } from "@/lib/chibi/viewer";
import styles from "./ChibiLab.module.css";

type Action = "idle" | "walk";

const VIEWS: [ViewPreset, string][] = [["front", "정면"], ["front45", "45°"], ["left", "왼쪽"], ["right", "오른쪽"], ["back", "뒤"]];

export default function ChibiLab() {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<ChibiViewer | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<ViewerStats | null>(null);
  const [action, setAction] = useState<Action>("idle");
  const [smile, setSmile] = useState(false);
  const [surprise, setSurprise] = useState(false);
  const [sleepy, setSleepy] = useState(0);
  const [blink, setBlink] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [softness, setSoftness] = useState(0.6);
  const [outline, setOutline] = useState(true);
  const [outlineWidth, setOutlineWidth] = useState(0.9);
  const [bands, setBands] = useState<2 | 3>(3);
  const [resolution, setResolution] = useState(2);
  const [more, setMore] = useState(false);

  useEffect(() => {
    let disposed = false;
    let v: ChibiViewer | null = null;
    const timer = window.setTimeout(async () => {
      try {
        const { ChibiViewer } = await import("@/lib/chibi/viewer");
        if (disposed || !host.current) return;
        const created = await ChibiViewer.create(host.current);
        if (disposed) { created.dispose(); return; }
        v = created;
        v.onStats = setStats;
        viewer.current = v;
        (window as unknown as { __chibi: ChibiViewer }).__chibi = v;
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }, 0);
    return () => { disposed = true; window.clearTimeout(timer); v?.dispose(); viewer.current = null; };
  }, []);

  // 설정 → 뷰어 반영
  useEffect(() => { const m = viewer.current?.character.motion; if (m) m.setLocomotion(action); }, [action, ready]);
  useEffect(() => { const m = viewer.current?.character.motion; if (m) m.smileTarget = smile ? 1 : 0; }, [smile, ready]);
  useEffect(() => { const m = viewer.current?.character.motion; if (m) m.surpriseTarget = surprise ? 1 : 0; }, [surprise, ready]);
  useEffect(() => { const m = viewer.current?.character.motion; if (m) m.sleepy = sleepy; }, [sleepy, ready]);
  useEffect(() => { const m = viewer.current?.character.motion; if (m) m.autoBlink = blink; }, [blink, ready]);
  useEffect(() => { const m = viewer.current?.character.motion; if (m) m.settings.speed = speed; }, [speed, ready]);
  useEffect(() => { const m = viewer.current?.character.motion; if (m) m.settings.softness = softness; }, [softness, ready]);
  useEffect(() => { viewer.current?.character.setOutline(outline); }, [outline, ready]);
  useEffect(() => { viewer.current?.setOutlineWidth(outlineWidth); }, [outlineWidth, ready]);
  useEffect(() => { const t = viewer.current?.materials.toon; if (t) t.uniforms.uThird.value = bands === 3 ? 1 : 0; }, [bands, ready]);
  useEffect(() => { viewer.current?.setPixelRatioCap(resolution); }, [resolution, ready]);

  // 키보드: W 걷기, 스페이스 점프, A/D 회전
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const m = viewer.current?.character.motion;
      if (!m) return;
      if (e.key === " ") { e.preventDefault(); m.jump(); }
      else if (e.key === "w" || e.key === "W") setAction(a => (a === "walk" ? "idle" : "walk"));
      else if (e.key === "a" || e.key === "A") m.turnBy(Math.PI / 2);
      else if (e.key === "d" || e.key === "D") m.turnBy(-Math.PI / 2);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const motion = () => viewer.current?.character.motion;

  return (
    <div className={styles.root}>
      <div ref={host} className={styles.stage} aria-label="치비 캐릭터 360도 뷰어. 드래그해서 돌려 보세요." />
      {!ready && !error && <p className={styles.loading} role="status">캐릭터를 빚는 중…</p>}
      {error && <p className={styles.loading} role="alert">WebGL 을 시작하지 못했어요: {error}</p>}

      <div className={styles.hud} aria-live="off">
        {stats ? (
          <>
            <span><b>{stats.fps.toFixed(0)}</b> FPS</span>
            <span><b>{stats.calls}</b> Draw Calls</span>
            <span><b>{(stats.triangles / 1000).toFixed(1)}k</b> Triangles</span>
            <span className={styles.dim}>CPU {stats.cpuMs.toFixed(1)}ms · 빌드 {Math.round(stats.buildMs)}ms</span>
          </>
        ) : <span>측정 중…</span>}
      </div>

      <section className={styles.panel} aria-label="캐릭터 조작">
        <div className={styles.row}>
          <span className={styles.label}>동작</span>
          <button className={action === "idle" ? styles.on : ""} onClick={() => setAction("idle")}>Idle</button>
          <button className={action === "walk" ? styles.on : ""} onClick={() => setAction("walk")}>Walk</button>
          <button onClick={() => motion()?.turnBy(Math.PI)}>Turn</button>
          <button onClick={() => motion()?.jump()}>Jump</button>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>표정</span>
          <button className={smile ? styles.on : ""} aria-pressed={smile} onClick={() => setSmile(s => !s)}>미소</button>
          <button className={surprise ? styles.on : ""} aria-pressed={surprise} onClick={() => setSurprise(s => !s)}>놀람</button>
          <button className={blink ? styles.on : ""} aria-pressed={blink} onClick={() => setBlink(b => !b)}>깜빡임</button>
          <label className={styles.slider}>졸림<input type="range" min={0} max={1} step={0.05} value={sleepy} onChange={e => setSleepy(+e.target.value)} /></label>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>시점</span>
          {VIEWS.map(([k, label]) => <button key={k} onClick={() => viewer.current?.setView(k)}>{label}</button>)}
        </div>
        <div className={`${styles.row} ${styles.wrap}`}>
          <label className={styles.slider}>속도 <output>{speed.toFixed(1)}×</output><input type="range" min={0.3} max={2} step={0.1} value={speed} onChange={e => setSpeed(+e.target.value)} /></label>
          <label className={styles.slider}>말랑함 <output>{Math.round(softness * 100)}</output><input type="range" min={0} max={1} step={0.05} value={softness} onChange={e => setSoftness(+e.target.value)} /></label>
          <button className={styles.more} aria-expanded={more} onClick={() => setMore(m => !m)}>{more ? "접기" : "셰이딩·성능"}</button>
        </div>
        {more && (
          <div className={`${styles.row} ${styles.wrap}`}>
            <button className={outline ? styles.on : ""} aria-pressed={outline} onClick={() => setOutline(o => !o)}>외곽선</button>
            <label className={styles.slider}>두께<input type="range" min={0.4} max={2.5} step={0.1} value={outlineWidth} onChange={e => setOutlineWidth(+e.target.value)} /></label>
            <button className={bands === 2 ? styles.on : ""} onClick={() => setBands(2)}>2단 명암</button>
            <button className={bands === 3 ? styles.on : ""} onClick={() => setBands(3)}>3단 명암</button>
            <span className={styles.label}>해상도</span>
            {[1, 1.5, 2].map(r => <button key={r} className={resolution === r ? styles.on : ""} onClick={() => setResolution(r)}>{r}×</button>)}
          </div>
        )}
      </section>
    </div>
  );
}
