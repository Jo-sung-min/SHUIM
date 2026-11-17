import type { OutingPlace } from "./outing";

/** Quiet synthesized ambience; no download, microphone, or automatic playback. */
export function createOutingSound(place: OutingPlace) {
  const context = new AudioContext();
  const volume = context.createGain(); volume.gain.value = 0; volume.connect(context.destination);
  const filter = context.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = place === "sea" ? 800 : 400;
  const noise = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
  const samples = noise.getChannelData(0); let last = 0;
  for (let i = 0; i < samples.length; i++) { last = (last + (Math.random() * 2 - 1) * .04) / 1.04; samples[i] = last * 3; }
  const source = context.createBufferSource(); source.buffer = noise; source.loop = true; source.connect(filter); filter.connect(volume); source.start();
  const tide = context.createOscillator(); const depth = context.createGain(); tide.frequency.value = place === "sea" ? .12 : .07; depth.gain.value = .035;
  tide.connect(depth); depth.connect(volume.gain); tide.start();
  let closed = false;
  return {
    async play() { if (closed) return; await context.resume(); volume.gain.setTargetAtTime(.10, context.currentTime, .4); },
    async pause() { if (!closed && context.state === "running") await context.suspend(); },
    async close() { if (closed) return; closed = true; source.stop(); tide.stop(); source.disconnect(); tide.disconnect(); filter.disconnect(); depth.disconnect(); volume.disconnect(); await context.close(); },
  };
}
