"use client";

/**
 * 모루의 방 빗소리. 녹음 파일 없이 Web Audio 로 만든다: 흰 소음을 높은 대역만 남겨 빗줄기 소리로, 아주 낮게 깐다.
 * 브라우저는 사용자가 누른 뒤에만 소리를 허락하므로 startRain 은 버튼·터치 안에서 부른다.
 */
type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let source: AudioBufferSourceNode | null = null;
let sleepTimer: ReturnType<typeof setTimeout> | null = null;

const LEVEL = 0.14;

/** 빗소리를 켜거나, 켜져 있으면 크기만 바꾼다 (0~1). 소리를 낼 수 없으면 false */
export function startRain(volume = 1): boolean {
  try {
    if (typeof window === "undefined") return false;
    const Audio = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!Audio) return false;
    ctx ??= new Audio();
    if (sleepTimer) { clearTimeout(sleepTimer); sleepTimer = null; }
    if (ctx.state === "suspended") void ctx.resume();
    if (!source || !master) {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const high = ctx.createBiquadFilter();
      high.type = "highpass";
      high.frequency.value = 900;
      const low = ctx.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = 6200;
      master = ctx.createGain();
      master.gain.value = 0;
      source.connect(high).connect(low).connect(master).connect(ctx.destination);
      source.start();
    }
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(LEVEL * Math.max(0, Math.min(1, volume)), now + 1.2);
    return true;
  } catch {
    return false;
  }
}

/** 천천히 줄였다가 멈춘다 */
export function stopRain() {
  if (!ctx || !master) return;
  try {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 0.6);
  } catch { /* 이미 닫힌 컨텍스트 */ }
  if (sleepTimer) clearTimeout(sleepTimer);
  sleepTimer = setTimeout(() => {
    sleepTimer = null;
    try { source?.stop(); } catch { /* 이미 멈춤 */ }
    source = null;
    master = null;
    void ctx?.suspend();
  }, 700);
}
