/**
 * 사진 색보정 ("룩"): 인스타그램식 필터 프리셋 + 수동 조정(밝기·대비·채도·따뜻함·선명도·페이드·비네트).
 *
 * - 프리셋 레시피는 CSSgram (https://github.com/una/CSSgram, MIT License, Copyright (c) 2015 Una Kravets) 에서 가져왔다.
 *   CSSgram 은 CSS filter + 겹침 레이어(mix-blend-mode)로 인스타그램 필터를 재현한 오픈소스다.
 *   미리보기 썸네일은 그 CSS 를 그대로 쓰고(presetCss/layerStyle), 실제 저장은 같은 수식을 WebGL 셰이더로 계산한다
 *   (Safari 는 canvas 의 ctx.filter 를 아직 지원하지 않아 2D 캔버스로는 저장할 수 없다).
 * - CSS filter 함수들의 색 행렬은 Filter Effects Module Level 1 의 정의를 그대로 옮겼다 (sRGB 공간).
 */

export type BlendMode = "multiply" | "screen" | "overlay" | "darken" | "lighten" | "soft-light" | "color-dodge" | "color-burn";
const BLEND_INDEX: Record<BlendMode, number> = { multiply: 0, screen: 1, overlay: 2, darken: 3, lighten: 4, "soft-light": 5, "color-dodge": 6, "color-burn": 7 };

export type Rgba = [number, number, number, number];
export interface GradientStop { color: Rgba; pos: number }
export interface LookLayer {
  kind: "solid" | "linear-right" | "linear-bottom" | "radial";
  stops: GradientStop[];
  blend: BlendMode;
  opacity: number;
  /** radial 의 중심 (0~1). 기본 가운데 */
  center?: [number, number];
}
export interface LookPreset {
  id: string;
  label: string;
  /** CSS filter 함수 목록 (썸네일용 문자열이면서 색 행렬의 원본) */
  filter: string;
  layers: LookLayer[];
}

export interface LookAdjust {
  brightness: number; // -1..1
  contrast: number;   // -1..1
  saturation: number; // -1..1
  warmth: number;     // -1..1
  sharpen: number;    // 0..1
  fade: number;       // 0..1
  vignette: number;   // 0..1
}
export interface PhotoLook {
  preset: string;      // 프리셋 id, "none" 이면 없음
  presetMix: number;   // 0..1 프리셋 강도
  adjust: LookAdjust;
}

export const DEFAULT_ADJUST: LookAdjust = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, sharpen: 0, fade: 0, vignette: 0 };
export const DEFAULT_LOOK: PhotoLook = { preset: "none", presetMix: 1, adjust: DEFAULT_ADJUST };

export const ADJUST_FIELDS: { key: keyof LookAdjust; label: string; min: number; max: number }[] = [
  { key: "brightness", label: "밝기", min: -100, max: 100 },
  { key: "contrast", label: "대비", min: -100, max: 100 },
  { key: "saturation", label: "채도", min: -100, max: 100 },
  { key: "warmth", label: "따뜻함", min: -100, max: 100 },
  { key: "sharpen", label: "선명하게", min: 0, max: 100 },
  { key: "fade", label: "페이드", min: 0, max: 100 },
  { key: "vignette", label: "비네트", min: 0, max: 100 },
];

export function isIdentityLook(look: PhotoLook): boolean {
  const a = look.adjust;
  return (look.preset === "none" || look.presetMix <= 0) && Object.values(a).every((v) => Math.abs(v) < 0.001);
}

/* ---------- 프리셋 (CSSgram 0.1.8 포팅) ---------- */

const c = (r: number, g: number, b: number, a = 1): Rgba => [r / 255, g / 255, b / 255, a];
const hex = (h: string, a = 1): Rgba => c(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a);
const TRANSPARENT: Rgba = [0, 0, 0, 0];
const solid = (color: Rgba, blend: BlendMode, opacity = 1): LookLayer => ({ kind: "solid", stops: [{ color, pos: 0 }], blend, opacity });
const linear = (kind: "linear-right" | "linear-bottom", stops: GradientStop[], blend: BlendMode, opacity = 1): LookLayer => ({ kind, stops, blend, opacity });
const radial = (stops: GradientStop[], blend: BlendMode, opacity = 1, center?: [number, number]): LookLayer => ({ kind: "radial", stops, blend, opacity, center });

export const LOOK_PRESETS: LookPreset[] = [
  { id: "none", label: "원본", filter: "", layers: [] },
  { id: "clarendon", label: "Clarendon", filter: "contrast(1.2) saturate(1.35)", layers: [solid(c(127, 187, 227, 0.2), "overlay")] },
  { id: "gingham", label: "Gingham", filter: "brightness(1.05) hue-rotate(-10deg)", layers: [linear("linear-right", [{ color: c(66, 10, 14, 0.2), pos: 0 }, { color: TRANSPARENT, pos: 1 }], "darken")] },
  { id: "moon", label: "Moon", filter: "grayscale(1) contrast(1.1) brightness(1.1)", layers: [solid(hex("#a0a0a0"), "soft-light"), solid(hex("#383838"), "lighten")] },
  { id: "lark", label: "Lark", filter: "contrast(0.9)", layers: [solid(hex("#22253f"), "color-dodge"), solid(c(242, 242, 242, 0.8), "darken")] },
  { id: "reyes", label: "Reyes", filter: "sepia(0.22) brightness(1.1) contrast(0.85) saturate(0.75)", layers: [solid(hex("#efcdad"), "soft-light", 0.5)] },
  { id: "slumber", label: "Slumber", filter: "saturate(0.66) brightness(1.05)", layers: [solid(c(69, 41, 12, 0.4), "lighten"), solid(c(125, 105, 24, 0.5), "soft-light")] },
  { id: "aden", label: "Aden", filter: "hue-rotate(-20deg) contrast(0.9) saturate(0.85) brightness(1.2)", layers: [linear("linear-right", [{ color: c(66, 10, 14, 0.2), pos: 0 }, { color: TRANSPARENT, pos: 1 }], "darken")] },
  { id: "perpetua", label: "Perpetua", filter: "", layers: [linear("linear-bottom", [{ color: hex("#005b9a"), pos: 0 }, { color: hex("#e6c13d"), pos: 1 }], "soft-light", 0.5)] },
  { id: "mayfair", label: "Mayfair", filter: "contrast(1.1) saturate(1.1)", layers: [radial([{ color: c(255, 255, 255, 0.8), pos: 0 }, { color: c(255, 200, 200, 0.6), pos: 0.3 }, { color: hex("#111111"), pos: 0.6 }], "overlay", 0.4, [0.4, 0.4])] },
  { id: "rise", label: "Rise", filter: "brightness(1.05) sepia(0.2) contrast(0.9) saturate(0.9)", layers: [radial([{ color: c(236, 205, 169, 0.15), pos: 0.55 }, { color: c(50, 30, 7, 0.4), pos: 1 }], "multiply"), radial([{ color: c(232, 197, 152, 0.8), pos: 0 }, { color: TRANSPARENT, pos: 0.9 }], "overlay", 0.6)] },
  { id: "hudson", label: "Hudson", filter: "brightness(1.2) contrast(0.9) saturate(1.1)", layers: [radial([{ color: hex("#a6b1ff"), pos: 0.5 }, { color: hex("#342134"), pos: 1 }], "multiply", 0.5)] },
  { id: "earlybird", label: "Earlybird", filter: "contrast(0.9) sepia(0.2)", layers: [radial([{ color: hex("#d0ba8e"), pos: 0.2 }, { color: hex("#360309"), pos: 0.85 }, { color: hex("#1d0210"), pos: 1 }], "overlay")] },
  { id: "brooklyn", label: "Brooklyn", filter: "contrast(0.9) brightness(1.1)", layers: [radial([{ color: c(168, 223, 193, 0.4), pos: 0.7 }, { color: hex("#c4b7c8"), pos: 1 }], "overlay")] },
  { id: "walden", label: "Walden", filter: "brightness(1.1) hue-rotate(-10deg) sepia(0.3) saturate(1.6)", layers: [solid(hex("#0044cc"), "screen", 0.3)] },
  { id: "nashville", label: "Nashville", filter: "sepia(0.2) contrast(1.2) brightness(1.05) saturate(1.2)", layers: [solid(c(247, 176, 153, 0.56), "darken"), solid(c(0, 70, 150, 0.4), "lighten")] },
  { id: "1977", label: "1977", filter: "contrast(1.1) brightness(1.1) saturate(1.3)", layers: [solid(c(243, 106, 188, 0.3), "screen")] },
  { id: "toaster", label: "Toaster", filter: "contrast(1.5) brightness(0.9)", layers: [radial([{ color: hex("#804e0f"), pos: 0 }, { color: hex("#3b003b"), pos: 1 }], "screen")] },
  { id: "lofi", label: "Lo-Fi", filter: "saturate(1.1) contrast(1.5)", layers: [radial([{ color: TRANSPARENT, pos: 0.7 }, { color: hex("#222222"), pos: 1.5 }], "multiply")] },
  { id: "xpro2", label: "X-Pro II", filter: "sepia(0.3)", layers: [radial([{ color: hex("#e6e7e0"), pos: 0.4 }, { color: c(43, 42, 161, 0.6), pos: 1.1 }], "color-burn")] },
  { id: "brannan", label: "Brannan", filter: "sepia(0.5) contrast(1.4)", layers: [solid(c(161, 44, 199, 0.31), "lighten")] },
  { id: "inkwell", label: "Inkwell", filter: "sepia(0.3) contrast(1.1) brightness(1.1) grayscale(1)", layers: [] },
];

export const presetById = (id: string): LookPreset => LOOK_PRESETS.find((p) => p.id === id) ?? LOOK_PRESETS[0];

/* ---------- 썸네일용 CSS (CSSgram 과 같은 방식: filter + 겹침 레이어) ---------- */

const rgbaCss = ([r, g, b, a]: Rgba) => `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
const stopsCss = (stops: GradientStop[]) => stops.map((s) => `${rgbaCss(s.color)} ${Math.round(s.pos * 100)}%`).join(", ");

export function layerStyle(layer: LookLayer): { background: string; mixBlendMode: BlendMode; opacity: number } {
  let background: string;
  if (layer.kind === "solid") background = rgbaCss(layer.stops[0].color);
  else if (layer.kind === "linear-right") background = `linear-gradient(to right, ${stopsCss(layer.stops)})`;
  else if (layer.kind === "linear-bottom") background = `linear-gradient(to bottom, ${stopsCss(layer.stops)})`;
  else {
    const [cx, cy] = layer.center ?? [0.5, 0.5];
    background = `radial-gradient(circle at ${Math.round(cx * 100)}% ${Math.round(cy * 100)}%, ${stopsCss(layer.stops)})`;
  }
  return { background, mixBlendMode: layer.blend, opacity: layer.opacity };
}

/* ---------- CSS filter 함수 → 색 행렬 (Filter Effects Level 1) ---------- */

type Mat = { m: number[]; o: [number, number, number] }; // 3x3 row-major + offset
const IDENT: Mat = { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], o: [0, 0, 0] };

function mul(b: Mat, a: Mat): Mat { // b ∘ a : 먼저 a, 그다음 b
  const m = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r++) for (let col = 0; col < 3; col++) for (let k = 0; k < 3; k++) m[r * 3 + col] += b.m[r * 3 + k] * a.m[k * 3 + col];
  const o: [number, number, number] = [0, 0, 0];
  for (let r = 0; r < 3; r++) o[r] = b.m[r * 3] * a.o[0] + b.m[r * 3 + 1] * a.o[1] + b.m[r * 3 + 2] * a.o[2] + b.o[r];
  return { m, o };
}

function filterMatrix(name: string, raw: string): Mat {
  const v = parseFloat(raw);
  switch (name) {
    case "grayscale": { const a = 1 - Math.min(1, v); return { m: [0.2126 + 0.7874 * a, 0.7152 - 0.7152 * a, 0.0722 - 0.0722 * a, 0.2126 - 0.2126 * a, 0.7152 + 0.2848 * a, 0.0722 - 0.0722 * a, 0.2126 - 0.2126 * a, 0.7152 - 0.7152 * a, 0.0722 + 0.9278 * a], o: [0, 0, 0] }; }
    case "sepia": { const a = 1 - Math.min(1, v); return { m: [0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a, 0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a, 0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a], o: [0, 0, 0] }; }
    case "saturate": { const s = v; return { m: [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s], o: [0, 0, 0] }; }
    case "hue-rotate": {
      const t = (v * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t);
      return { m: [0.213 + cs * 0.787 - sn * 0.213, 0.715 - cs * 0.715 - sn * 0.715, 0.072 - cs * 0.072 + sn * 0.928, 0.213 - cs * 0.213 + sn * 0.143, 0.715 + cs * 0.285 + sn * 0.14, 0.072 - cs * 0.072 - sn * 0.283, 0.213 - cs * 0.213 - sn * 0.787, 0.715 - cs * 0.715 + sn * 0.715, 0.072 + cs * 0.928 + sn * 0.072], o: [0, 0, 0] };
    }
    case "brightness": return { m: [v, 0, 0, 0, v, 0, 0, 0, v], o: [0, 0, 0] };
    case "contrast": { const k = 0.5 - 0.5 * v; return { m: [v, 0, 0, 0, v, 0, 0, 0, v], o: [k, k, k] }; }
    default: return IDENT;
  }
}

/** "contrast(1.2) saturate(1.35)" 같은 목록을 왼쪽부터 차례로 적용한 하나의 행렬로 */
export function presetMatrix(filter: string): Mat {
  let acc = IDENT;
  for (const m of filter.matchAll(/([a-z-]+)\(([^)]+)\)/g)) acc = mul(filterMatrix(m[1], m[2]), acc);
  return acc;
}

/* ---------- WebGL 렌더러 ---------- */

const MAX_LAYERS = 2;
const MAX_STOPS = 3;

const VERT = `attribute vec2 a_pos; varying vec2 v_uv;
void main() { v_uv = vec2((a_pos.x + 1.0) * 0.5, 1.0 - (a_pos.y + 1.0) * 0.5); gl_Position = vec4(a_pos, 0.0, 1.0); }`;

function layerGlsl(i: number): string {
  return `
uniform int u_l${i}Kind; uniform int u_l${i}Blend; uniform float u_l${i}Opacity; uniform int u_l${i}Count;
uniform vec2 u_l${i}Center; uniform vec4 u_l${i}Stop0; uniform vec4 u_l${i}Stop1; uniform vec4 u_l${i}Stop2; uniform vec3 u_l${i}Pos;
vec4 layer${i}Color(vec2 uv) {
  float t = 0.0;
  if (u_l${i}Kind == 1) t = uv.x;
  else if (u_l${i}Kind == 2) t = uv.y;
  else if (u_l${i}Kind == 3) {
    vec2 s = vec2(u_aspect, 1.0);
    vec2 far = max(u_l${i}Center, 1.0 - u_l${i}Center) * s;
    t = length((uv - u_l${i}Center) * s) / max(length(far), 1e-4);
  }
  if (u_l${i}Count <= 1) return u_l${i}Stop0;
  if (t <= u_l${i}Pos.x) return u_l${i}Stop0;
  if (u_l${i}Count == 2 || t <= u_l${i}Pos.y) return gradStop(u_l${i}Stop0, u_l${i}Stop1, (t - u_l${i}Pos.x) / max(u_l${i}Pos.y - u_l${i}Pos.x, 1e-4));
  if (t <= u_l${i}Pos.z) return gradStop(u_l${i}Stop1, u_l${i}Stop2, (t - u_l${i}Pos.y) / max(u_l${i}Pos.z - u_l${i}Pos.y, 1e-4));
  return u_l${i}Stop2;
}
vec3 applyLayer${i}(vec3 cb, vec2 uv) {
  if (u_l${i}Kind < 0) return cb;
  vec4 cs = layer${i}Color(uv);
  float a = clamp(cs.a * u_l${i}Opacity, 0.0, 1.0);
  return mix(cb, blend(u_l${i}Blend, cb, cs.rgb), a);
}`;
}

const FRAG = `precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex; uniform vec2 u_texel; uniform float u_aspect;
uniform mat3 u_mat; uniform vec3 u_off; uniform float u_presetMix;
uniform float u_bright, u_contrast, u_sat, u_warm, u_sharp, u_fade, u_vig;
float softLight(float b, float s) {
  float d = b <= 0.25 ? ((16.0 * b - 12.0) * b + 4.0) * b : sqrt(b);
  return s <= 0.5 ? b - (1.0 - 2.0 * s) * b * (1.0 - b) : b + (2.0 * s - 1.0) * (d - b);
}
float dodge(float b, float s) { return b <= 0.0 ? 0.0 : (s >= 1.0 ? 1.0 : min(1.0, b / (1.0 - s))); }
float burn(float b, float s) { return b >= 1.0 ? 1.0 : (s <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - b) / s)); }
float overlayC(float b, float s) { return b <= 0.5 ? 2.0 * s * b : 1.0 - 2.0 * (1.0 - s) * (1.0 - b); }
vec3 blend(int mode, vec3 b, vec3 s) {
  if (mode == 0) return b * s;
  if (mode == 1) return b + s - b * s;
  if (mode == 2) return vec3(overlayC(b.r, s.r), overlayC(b.g, s.g), overlayC(b.b, s.b));
  if (mode == 3) return min(b, s);
  if (mode == 4) return max(b, s);
  if (mode == 5) return vec3(softLight(b.r, s.r), softLight(b.g, s.g), softLight(b.b, s.b));
  if (mode == 6) return vec3(dodge(b.r, s.r), dodge(b.g, s.g), dodge(b.b, s.b));
  return vec3(burn(b.r, s.r), burn(b.g, s.g), burn(b.b, s.b));
}
/* 투명 쪽으로 섞일 때 검게 가라앉지 않도록 (CSS 는 premultiplied 로 보간) */
vec4 gradStop(vec4 a, vec4 b, float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 ca = a.a > 0.001 ? a.rgb : b.rgb;
  vec3 cb = b.a > 0.001 ? b.rgb : a.rgb;
  return vec4(mix(ca, cb, t), mix(a.a, b.a, t));
}
${layerGlsl(0)}
${layerGlsl(1)}
void main() {
  vec3 src = texture2D(u_tex, v_uv).rgb;
  vec3 p = clamp(u_mat * src + u_off, 0.0, 1.0);
  p = applyLayer0(p, v_uv);
  p = applyLayer1(p, v_uv);
  vec3 c = mix(src, p, u_presetMix);
  /* 선명하게: 3x3 평균과의 차이를 더한다 */
  if (u_sharp > 0.0) {
    vec3 sum = vec3(0.0);
    for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) sum += texture2D(u_tex, v_uv + vec2(float(dx), float(dy)) * u_texel).rgb;
    c += (src - sum / 9.0) * u_sharp * 1.2;
  }
  c = c * (1.0 + u_bright * 0.5);
  c = (c - 0.5) * (1.0 + u_contrast * 0.6) + 0.5;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.0 + u_sat);
  c *= vec3(1.0 + 0.12 * u_warm, 1.0 + 0.02 * u_warm, 1.0 - 0.12 * u_warm);
  c = mix(c, c * 0.78 + 0.11, u_fade);
  vec2 q = (v_uv - 0.5) * vec2(u_aspect, 1.0) / (length(vec2(u_aspect, 1.0)) * 0.5);
  c *= 1.0 - u_vig * smoothstep(0.45, 1.05, length(q)) * 0.85;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export type LookSource = HTMLCanvasElement | HTMLImageElement | ImageBitmap;

/** 한 편집기 안에서 재사용하는 WebGL 렌더러. 만들 수 없으면(WebGL 없음) createLookRenderer 가 null */
export class LookRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly texture: WebGLTexture;
  private readonly loc = new Map<string, WebGLUniformLocation | null>();
  private lost = false;

  constructor() {
    this.canvas = document.createElement("canvas");
    const gl = this.canvas.getContext("webgl", { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false });
    if (!gl) throw new Error("WebGL 을 쓸 수 없어요");
    this.gl = gl;
    this.canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); this.lost = true; });
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "shader");
      return sh;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link");
    gl.useProgram(program);
    this.program = program;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  private u(name: string) {
    if (!this.loc.has(name)) this.loc.set(name, this.gl.getUniformLocation(this.program, name));
    return this.loc.get(name) ?? null;
  }

  get usable() { return !this.lost; }

  /** source 전체를 width×height 로 그려 자기 캔버스에 남긴다 (호출자가 drawImage 로 가져간다) */
  render(source: LookSource, look: PhotoLook, width: number, height: number): HTMLCanvasElement {
    const gl = this.gl;
    if (this.lost) throw new Error("WebGL 이 끊겼어요. 편집기를 다시 열어 주세요.");
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const sw = "naturalWidth" in source ? source.naturalWidth : source.width;
    const sh = "naturalHeight" in source ? source.naturalHeight : source.height;
    if (sw > max || sh > max || width > max || height > max) throw new Error("사진이 너무 커서 보정할 수 없어요.");
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    gl.viewport(0, 0, width, height);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.uniform1i(this.u("u_tex"), 0);
    gl.uniform2f(this.u("u_texel"), 1 / sw, 1 / sh);
    gl.uniform1f(this.u("u_aspect"), width / height);

    const preset = presetById(look.preset);
    const mat = presetMatrix(preset.filter);
    // GLSL mat3 는 열 우선: row-major 를 전치해서 넣는다
    gl.uniformMatrix3fv(this.u("u_mat"), false, new Float32Array([mat.m[0], mat.m[3], mat.m[6], mat.m[1], mat.m[4], mat.m[7], mat.m[2], mat.m[5], mat.m[8]]));
    gl.uniform3f(this.u("u_off"), mat.o[0], mat.o[1], mat.o[2]);
    gl.uniform1f(this.u("u_presetMix"), preset.id === "none" ? 0 : Math.min(1, Math.max(0, look.presetMix)));
    for (let i = 0; i < MAX_LAYERS; i++) {
      const layer = preset.layers[i];
      if (!layer) { gl.uniform1i(this.u(`u_l${i}Kind`), -1); continue; }
      const kind = layer.kind === "solid" ? 0 : layer.kind === "linear-right" ? 1 : layer.kind === "linear-bottom" ? 2 : 3;
      gl.uniform1i(this.u(`u_l${i}Kind`), kind);
      gl.uniform1i(this.u(`u_l${i}Blend`), BLEND_INDEX[layer.blend]);
      gl.uniform1f(this.u(`u_l${i}Opacity`), layer.opacity);
      gl.uniform1i(this.u(`u_l${i}Count`), Math.min(MAX_STOPS, layer.stops.length));
      const [cx, cy] = layer.center ?? [0.5, 0.5];
      gl.uniform2f(this.u(`u_l${i}Center`), cx, cy);
      const stops = layer.stops.slice(0, MAX_STOPS);
      while (stops.length < MAX_STOPS) stops.push(stops[stops.length - 1]);
      stops.forEach((s, j) => gl.uniform4f(this.u(`u_l${i}Stop${j}`), s.color[0], s.color[1], s.color[2], s.color[3]));
      gl.uniform3f(this.u(`u_l${i}Pos`), stops[0].pos, stops[1].pos, stops[2].pos);
    }
    const a = look.adjust;
    gl.uniform1f(this.u("u_bright"), a.brightness);
    gl.uniform1f(this.u("u_contrast"), a.contrast);
    gl.uniform1f(this.u("u_sat"), a.saturation);
    gl.uniform1f(this.u("u_warm"), a.warmth);
    gl.uniform1f(this.u("u_sharp"), a.sharpen);
    gl.uniform1f(this.u("u_fade"), a.fade);
    gl.uniform1f(this.u("u_vig"), a.vignette);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.flush();
    return this.canvas;
  }

  dispose() {
    const gl = this.gl;
    gl.deleteTexture(this.texture);
    gl.deleteProgram(this.program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.canvas.width = 0; this.canvas.height = 0;
  }
}

export function createLookRenderer(): LookRenderer | null {
  try {
    return new LookRenderer();
  } catch {
    return null;
  }
}
