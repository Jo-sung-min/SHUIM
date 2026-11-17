import type { CSSProperties } from "react";
const paths: Record<string, string> = {
  arrow: "M5 12h14m-6-6 6 6-6 6", back: "M19 12H5m6-6-6 6 6 6", close: "m6 6 12 12M6 18 18 6",
  heart: "M20.8 5.6a5.4 5.4 0 0 0-7.6 0L12 6.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 22l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z",
  leaf: "M20 3C7 2 2 9 5 16c7 5 16 0 15-13ZM4 21 15 10", tree: "M12 22v-8M7 16c-7-1-5-8-1-9-1-7 12-7 11 0 5 2 5 9-2 9H7Z",
  wave: "M2 8c4-6 6 6 10 0s6 6 10 0M2 14c4-6 6 6 10 0s6 6 10 0M2 20c4-6 6 6 10 0s6 6 10 0",
  mountain: "m2 20 7-15 6 15H2Zm11-8 4-8 6 16h-8M6 12l3 2 2-2",
  sun: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2",
  star: "m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21 7 14.2 2 9.3l6.9-1L12 2Z",
  spark: "m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z",
  cup: "M4 7h13v8a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V7Zm13 1h2a3 3 0 0 1 0 6h-2M7 3V1m5 2V1M2 23h18",
  boat: "m2 14 4 7h12l4-7H2Zm10 0V2L4 12h8m1-8 7 8h-7",
  letter: "M3 5h18v14H3V5Zm0 1 9 7 9-7", pen: "m4 16-1 5 5-1L21 7l-4-4L4 16Zm11-11 4 4",
  bench: "M3 5h18v8H3V5Zm-1 8h20v4H2v-4Zm3 4v5m14-5v5M3 9h18",
  wind: "M2 8h13a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M2 16h7a3 3 0 1 1-3 3",
  cloud: "M7 18a5 5 0 1 1 0-10 6 6 0 0 1 12-1 5 5 0 0 1-1 11H7Z",
  shell: "M12 21 3 12C-2 0 26 0 21 12l-9 9ZM12 21V4m0 17L7 5m5 16 5-16",
  lock: "M6 10V7a6 6 0 0 1 12 0v3M4 10h16v12H4V10Zm8 5v3",
  people: "M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM5 22v-3a7 7 0 0 1 14 0v3M19 3a3 3 0 0 1 0 6m2 4 2 4v5M5 3a3 3 0 0 0 0 6m-2 4-2 4v5",
  check: "m4 12 5 5L20 6", book: "M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3V4Zm9 2v16",
  volume: "m3 9 5 0 5-5v16l-5-5H3V9Zm13-1c3 2 3 6 0 8m3-11c5 4 5 10 0 14",
  mute: "m3 9 5 0 5-5v16l-5-5H3V9Zm14 0 5 6m-5 0 5-6",
};
export default function OutingIcon({ name, size = 20, style }: { name: string; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name] ?? paths.spark} /></svg>;
}
