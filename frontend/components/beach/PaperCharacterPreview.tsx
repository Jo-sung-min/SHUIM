"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { PaperAvatarModels, type PaperAvatar } from "@/lib/beach/paper-avatar";
import styles from "./paper-character-preview.module.css";

type Pose = "idle" | "walk" | "sit" | "lie";
type Angle = "front" | "three-quarter" | "side" | "back";
const ANGLES: Record<Angle, number> = { front: 0, "three-quarter": Math.PI / 4, side: Math.PI / 2, back: Math.PI };
const POSES: [Pose, string][] = [["idle", "가만히"], ["walk", "총총 걷기"], ["sit", "앉아 쉬기"], ["lie", "누워 쉬기"]];

export default function PaperCharacterPreview() {
  const host = useRef<HTMLDivElement>(null);
  const actor = useRef<PaperAvatar | null>(null);
  const settings = useRef({ pose: "idle" as Pose, angle: Math.PI / 4, spin: false });
  const [pose, setPose] = useState<Pose>("idle");
  const [angle, setAngle] = useState<Angle | null>("three-quarter");
  const [spin, setSpin] = useState(false);
  const [status, setStatus] = useState("몽실이 오고 있어요…");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let disposed = false, frame = 0, previous = 0;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { setStatus("3D 화면을 열지 못했어요. 새로고침 후 다시 만나주세요."); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute("aria-label", "몽실 3D 미리보기. 아래 버튼으로 방향과 자세를 바꿀 수 있어요.");
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, .05, 30);
    const pool = new PaperAvatarModels(camera);
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 128;
    const context = shadowCanvas.getContext("2d")!;
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(71,65,45,.3)"); gradient.addColorStop(1, "rgba(71,65,45,0)");
    context.fillStyle = gradient; context.fillRect(0, 0, 128, 128);
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    const shadowGeometry = new THREE.PlaneGeometry(2.1, 1.2);
    const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false });
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = -.01; scene.add(shadow);
    const resize = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect();
      renderer.setSize(width, height); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
    });
    resize.observe(container);
    setStatus("몽실이 오고 있어요…");
    void pool.load().then(() => {
      if (disposed) return;
      const loaded = pool.create();
      if (!loaded) { setStatus("몽실을 불러오지 못했어요. 다시 만나볼까요?"); return; }
      actor.current = loaded; scene.add(loaded.root); setStatus("");
    }).catch(() => { if (!disposed) setStatus("몽실을 불러오지 못했어요. 다시 만나볼까요?"); });
    const render = (now: number) => {
      if (disposed) return;
      const dt = previous ? Math.min(.05, (now - previous) / 1000) : 0; previous = now;
      const state = settings.current;
      if (!document.hidden) {
        if (state.spin) state.angle += dt * .45;
        const lying = state.pose === "lie", seated = state.pose === "sit";
        const radius = 4.4;
        camera.position.set(Math.sin(state.angle) * radius, lying ? 3.1 : 1.85, Math.cos(state.angle) * radius);
        camera.lookAt(0, lying ? .25 : .9, lying ? -.6 : 0);
        actor.current?.update(dt, {
          x: 0, z: 0, yaw: Math.PI, moving: state.pose === "walk", visible: true,
          seated: seated ? { x: 0, z: 0, yaw: Math.PI, avatarY: .17 } : null,
          lying: lying ? { x: 0, z: 0, yaw: 0, avatarY: .03 } : null,
        });
        shadow.scale.set(lying ? 1.1 : 1, lying ? 1.9 : 1, 1);
        shadow.position.z = lying ? -.8 : 0;
        renderer.render(scene, camera);
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    const onLost = (event: Event) => { event.preventDefault(); setStatus("화면 연결이 잠시 쉬고 있어요. 다시 만나기를 눌러주세요."); };
    renderer.domElement.addEventListener("webglcontextlost", onLost);
    return () => {
      disposed = true; cancelAnimationFrame(frame); resize.disconnect(); actor.current = null;
      pool.dispose(); shadowGeometry.dispose(); shadowMaterial.dispose(); shadowTexture.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [retry]);

  const changePose = (next: Pose) => { settings.current.pose = next; setPose(next); };
  const changeAngle = (next: Angle) => {
    settings.current.angle = ANGLES[next]; settings.current.spin = false; setAngle(next); setSpin(false);
  };
  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/c/home" className={styles.back}>← 소로우로</Link>
      <span>새로운 친구</span>
    </header>
    <section className={styles.card}>
      <div className={styles.heading}><p>작은 그림이 건네는 포근함</p><h1>안녕, 나는 몽실이야.</h1></div>
      <div className={styles.stage} onPointerDown={event => {
        if ((event.target as HTMLElement).closest("button")) return;
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.dataset.dragX = String(event.clientX);
        settings.current.spin = false; setSpin(false);
      }} onPointerMove={event => {
        const el = event.currentTarget;
        if (!el.hasPointerCapture(event.pointerId)) return;
        const previous = Number(el.dataset.dragX);
        settings.current.angle -= (event.clientX - previous) * .012;
        el.dataset.dragX = String(event.clientX); setAngle(null);
      }} onPointerUp={event => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}>
        <div ref={host} className={styles.canvasHost} />
        {status && <div className={styles.status} role="status"><p>{status}</p>{!status.includes("오고") && <button type="button" onClick={() => setRetry(value => value + 1)}>다시 만나기</button>}</div>}
      </div>
      <p className={styles.hint}>살짝 돌려보세요. 옆모습도 동글동글 포근해요.</p>
      <div className={styles.controls}>
        <div className={styles.row} role="group" aria-label="보는 방향">
          {([["front", "앞모습"], ["three-quarter", "비스듬히"], ["side", "옆모습"], ["back", "뒷모습"]] as [Angle, string][]).map(([value, label]) => <button key={value} type="button" aria-pressed={angle === value && !spin} onClick={() => changeAngle(value)}>{label}</button>)}
        </div>
        <div className={styles.row} role="group" aria-label="몽실의 자세">
          {POSES.map(([value, label]) => <button key={value} type="button" aria-pressed={pose === value} onClick={() => changePose(value)}>{label}</button>)}
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={() => { changePose("idle"); actor.current?.playGesture("wave"); }}>손 흔들기</button>
          <button type="button" aria-pressed={spin} onClick={() => { settings.current.spin = !spin; setSpin(!spin); setAngle(null); }}>천천히 둘러보기 {spin ? "멈춤" : "↻"}</button>
        </div>
      </div>
    </section>
    <p className={styles.note}>맵 안에서 <strong>메뉴 · 내 캐릭터 · 몽실</strong>을 선택하면 함께 걸을 수 있어요.</p>
  </main>;
}
