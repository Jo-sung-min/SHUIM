import * as THREE from "three";
import type { SparklerLetter, UyuniMoment } from "./net";

type Letter = SparklerLetter;
type Quality = "high" | "medium" | "low";
type Point = readonly [number, number];
export const UYUNI_MOMENT_LIMIT = 32;
const COLORS = { amber: 0xffc377, rose: 0xffa0b7, mint: 0xa6eed0, sky: 0x9edcff, violet: 0xcbb1ff };
const SAMPLES = 128;
const DRAW_SAMPLES = 256;
export const SPARKLER_DRAW_START = .25;
export const SPARKLER_DRAW_SECONDS = 5.6;
const DRAW_SCALE = .88;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const letterStrokes: Record<Letter, readonly (readonly Point[])[]> = {
  L: [[[-.5, .75], [-.5, -.75], [.5, -.75]]],
  O: [Array.from({ length: 65 }, (_, i): Point => [Math.sin(i / 64 * Math.PI * 2) * .55, Math.cos(i / 64 * Math.PI * 2) * .75])],
  V: [[[-.58, .75], [0, -.75], [.58, .75]]],
  // Retrace the bottom and stem so even E is drawn without a floating pen-up jump.
  E: [[[.5, .75], [-.5, .75], [-.5, -.75], [.5, -.75], [-.5, -.75], [-.5, 0], [.34, 0]]],
  heart: [Array.from({ length: 129 }, (_, i): Point => {
    const t = i / 128 * Math.PI * 2;
    return [16 * Math.sin(t) ** 3 / 24, (13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t) + 2.5) / 20];
  })],
  star: [Array.from({ length: 6 }, (_, i): Point => {
    const t = i * Math.PI * 4 / 5;
    return [Math.sin(t) * .76, Math.cos(t) * .76];
  })],
};

/** Arc-length samples keep the burning tip at an even pace, without drawing between separate strokes. */
export function sparklerPath(letter: Letter, count = SAMPLES): { x: number; y: number; progress: number }[] {
  const strokes = letterStrokes[letter];
  if (!strokes || !Number.isInteger(count) || count < 2 || count > 512) return [];
  const segments: { a: Point; b: Point; start: number; length: number }[] = [];
  let length = 0;
  for (const stroke of strokes) for (let i = 1; i < stroke.length; i++) {
    const span = Math.hypot(stroke[i][0] - stroke[i - 1][0], stroke[i][1] - stroke[i - 1][1]);
    segments.push({ a: stroke[i - 1], b: stroke[i], start: length, length: span }); length += span;
  }
  return Array.from({ length: count }, (_, i) => {
    const progress = i / (count - 1), at = progress * length;
    const segment = segments.find(s => at <= s.start + s.length) ?? segments[segments.length - 1];
    const t = clamp((at - segment.start) / segment.length, 0, 1);
    return { x: segment.a[0] + (segment.b[0] - segment.a[0]) * t, y: segment.a[1] + (segment.b[1] - segment.a[1]) * t, progress };
  });
}

const drawingPaths = new Map<Letter, ReturnType<typeof sparklerPath>>();
function drawingPath(letter: Letter) {
  let path = drawingPaths.get(letter);
  if (!path) { path = sparklerPath(letter, DRAW_SAMPLES); drawingPaths.set(letter, path); }
  return path;
}

/** The arm and the shader share the same arc-length samples and server-time clock. */
export function sampleSparklerTip(letter: Letter, age: number) {
  const path = drawingPath(letter);
  const progress = clamp((age - SPARKLER_DRAW_START) / SPARKLER_DRAW_SECONDS, 0, 1);
  const at = progress * (path.length - 1), index = Math.min(path.length - 2, Math.floor(at)), mix = at - index;
  const a = path[index], b = path[index + 1];
  return { x: (a.x + (b.x - a.x) * mix) * DRAW_SCALE, y: (a.y + (b.y - a.y) * mix) * DRAW_SCALE,
    progress, drawing: age >= 0 && age <= SPARKLER_DRAW_START + SPARKLER_DRAW_SECONDS };
}

/** Old strokes dim while the hand is still drawing, then dissolve in drawing order. */
export function sparklerTrailOpacity(age: number, progress: number) {
  const elapsed = age - (SPARKLER_DRAW_START + clamp(progress, 0, 1) * SPARKLER_DRAW_SECONDS);
  return elapsed < 0 ? 0 : (1 - smooth(1.6, 8.0, elapsed)) * (1 - smooth(10.9, 12, age));
}

function seedOf(id: string) { let n = 2166136261; for (const c of id) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return (n >>> 0) / 4294967296; }

/** Pure, absolute-time motion: late arrivals and different frame rates see the same lantern. */
export function sampleWishLantern(event: Pick<UyuniMoment, "id" | "x" | "z" | "yaw">, age: number, floorY = 0) {
  const t = clamp(age, 0, 40), seed = seedOf(event.id), phase = seed * Math.PI * 2;
  return {
    x: event.x - Math.sin(event.yaw) * 2.2 + (Math.sin(t * .34 + phase) - Math.sin(phase)) * .42 + t * (seed - .5) * .055,
    y: floorY + 1.75 + t * .36 + (Math.sin(t * .7 + phase) - Math.sin(phase)) * .07,
    z: event.z - Math.cos(event.yaw) * 2.2 - t * .075 + (Math.cos(t * .26 + phase) - Math.cos(phase)) * .28,
    yaw: event.yaw + Math.sin(t * .24 + phase) * .14,
    tilt: Math.sin(t * .55 + phase) * .055,
    opacity: smooth(0, .8, t) * (1 - smooth(31, 40, t)),
  };
}

function validEvent(value: UyuniMoment): boolean {
  if (!value || typeof value.id !== "string" || !value.id || value.id.length > 128
    || typeof value.fromPid !== "string" || !value.fromPid || value.fromPid.length > 128
    || typeof value.fromNick !== "string" || Array.from(value.fromNick).length > 100
    || ![value.x, value.z, value.yaw, value.startedAt].every(Number.isFinite)
    || Math.abs(value.x) > 10000 || Math.abs(value.z) > 10000 || !Number.isSafeInteger(value.startedAt) || value.startedAt < 0
    || (value.color !== undefined && (typeof value.color !== "string" || !Object.hasOwn(COLORS, value.color)))) return false;
  return value.kind === "sparkler" ? value.durationMs === 12000 && typeof value.letter === "string" && Object.hasOwn(letterStrokes, value.letter)
    : value.kind === "lantern" && value.durationMs === 40000 && typeof value.wish === "string"
      && typeof value.color === "string" && Object.hasOwn(COLORS, value.color)
      && value.wish.trim().length > 0 && Array.from(value.wish).length <= 80;
}
function fingerprint(event: UyuniMoment) {
  return JSON.stringify([event.kind, event.fromPid, event.fromNick, event.x, event.z, event.yaw, event.startedAt, event.durationMs, event.letter, event.color, event.wish]);
}
function sparkGeometry(letter: Letter) {
  const path = drawingPath(letter), points: number[] = [], detail: number[] = [];
  // Three thin irregular filaments plus a soft halo; all quality levels keep the complete drawing.
  for (let strand = 0; strand < 4; strand++) for (let i = 0; i < path.length; i++) {
    const p = path[i], phase = i * 2.399963 + strand * 17.3;
    const jitter = strand === 0 || strand === 3 ? 0 : .007;
    points.push(p.x * DRAW_SCALE + Math.sin(phase * .19) * jitter, p.y * DRAW_SCALE + Math.cos(phase * .17) * jitter, 0);
    detail.push(p.progress, strand === 3 ? 1 : 0, phase);
  }
  // Each successive block covers the whole stroke so reduced quality never loses its ending.
  for (let spray = 0; spray < 6; spray++) for (let i = 0; i < path.length; i++) {
    const index = (i * 97) % path.length, p = path[index];
    points.push(p.x * DRAW_SCALE, p.y * DRAW_SCALE, 0);
    detail.push(p.progress, 2, index * 2.399963 + spray * 37.19);
  }
  // The live burning tip is part of this same draw call.
  for (let i = 0; i < 3; i++) { points.push(0, 0, 0); detail.push(0, 3, i); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute("detail", new THREE.Float32BufferAttribute(detail, 3));
  return geometry;
}
function sparkMaterial(yaw: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uAge: { value: 0 }, uViewport: { value: 844 }, uYaw: { value: Math.atan2(Math.sin(yaw),Math.cos(yaw)) }, uSide: { value: -1 },
      uTip: { value: new THREE.Vector3() }, uHeld: { value: 0 }, uSprays: { value: 6 }, uStop: { value: SPARKLER_DRAW_START + SPARKLER_DRAW_SECONDS } },
    vertexShader: `
      attribute vec3 detail; uniform float uAge, uViewport, uYaw, uSide, uHeld, uSprays, uStop;
      uniform vec3 uTip;
      varying float vAlpha, vMode, vHot;
      varying vec2 vDirection;
      void main() {
        float birth = ${SPARKLER_DRAW_START.toFixed(2)} + detail.x * ${SPARKLER_DRAW_SECONDS.toFixed(2)}, age = uAge - birth;
        vec3 p = position; vMode = detail.y;
        float endFade = 1.0 - smoothstep(10.9, 12.0, uAge);
        vHot = exp(-max(0.0, age) * 8.0);
        vAlpha = step(0.0, age) * step(birth,uStop) * endFade;
        float size = detail.y < 0.5 ? 0.017 : 0.075;
        vec3 velocity = vec3(0.0);
        if (detail.y > 2.5) {
          p = uTip; vAlpha = uHeld * (.84 + .16*sin(uAge*83.0)*sin(uAge*83.0));
          size = detail.z < .5 ? .045 : detail.z < 1.5 ? .13 : .23;
          vAlpha *= detail.z < .5 ? 1.0 : detail.z < 1.5 ? .22 : .055;
          vMode = 1.0; vHot = 1.0;
        } else if (detail.y > 1.5) {
          float t = max(0.0, age);
          float speed = .18 + .56 * fract(sin(detail.z * 7.17) * 13758.54);
          velocity = vec3(cos(detail.z) * speed, sin(detail.z) * speed, sin(detail.z * 1.7) * .19);
          p += velocity * t;
          p.y -= .48 * t * t;
          velocity.y -= .96 * t;
          float life = .18 + .48 * fract(sin(detail.z * 3.61) * 9271.27);
          vAlpha *= (1.0 - smoothstep(life * .35, life, t)) * (.52 + .48 * sin(t * 71.0 + detail.z) * sin(t * 71.0 + detail.z));
          size = .045 + speed * .075; vHot = 1.0 - smoothstep(0.0, life, t);
          // Suppress whole evenly distributed spray families without shortening the lettering.
          vAlpha *= step(fract(sin(detail.z*11.79)*5171.17),uSprays/6.0);
        } else {
          vAlpha *= (1.0 - smoothstep(1.6, 8.0, age)) * (detail.y < .5 ? .56 : .085);
          vAlpha *= .86 + .14 * sin(uAge * 9.0 + detail.z);
          p.y -= max(0.0,age-2.0) * .007;
          size += vHot * (detail.y < .5 ? .025 : .045);
        }
        p.x *= uSide;
        velocity.x *= uSide;
        p = vec3(cos(uYaw)*p.x + sin(uYaw)*p.z, p.y, -sin(uYaw)*p.x + cos(uYaw)*p.z);
        velocity = vec3(cos(uYaw)*velocity.x + sin(uYaw)*velocity.z, velocity.y, -sin(uYaw)*velocity.x + cos(uYaw)*velocity.z);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vec2 direction = (modelViewMatrix * vec4(velocity,0.0)).xy;
        vDirection = length(direction) > .0001 ? normalize(direction) : vec2(0.0,1.0);
        gl_PointSize = clamp(size * projectionMatrix[1][1] * uViewport / max(.1, -mv.z), 1.0, 48.0);
        if (vAlpha < .002) gl_Position = vec4(2.0,2.0,2.0,1.0);
      }`,
    fragmentShader: `
      varying float vAlpha, vMode, vHot; varying vec2 vDirection;
      void main() {
        vec2 uv = (gl_PointCoord - .5) * 2.0; uv.y = -uv.y;
        float r = length(uv);
        float glow = exp(-r*r*5.0) * (1.0-smoothstep(.75,1.0,r));
        if(vMode > 1.5) {
          float along = dot(uv,vDirection), across = dot(uv,vec2(-vDirection.y,vDirection.x));
          glow = exp(-across*across*160.0) * (1.0-smoothstep(.25,1.0,abs(along)));
        }
        float a = glow * vAlpha;
        if (a < .003) discard;
        gl_FragColor = vec4(mix(vec3(1.0,.37,.055), vec3(1.0,.93,.65), vMode < .5 ? .88 : vHot*.86)*1.65, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false,
  });
}

function lanternMaterial(part: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPart: { value: part } },
    vertexShader: `
      attribute float aFade, aPhase; varying vec2 vUv; varying vec3 vTint, vNormal;
      varying float vFade, vPhase;
      void main() {
        vUv=uv; vNormal=normal; vTint=instanceColor; vFade=aFade; vPhase=aPhase;
        gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);
      }`,
    fragmentShader: `
      uniform float uTime, uPart; varying vec2 vUv; varying vec3 vTint, vNormal;
      varying float vFade, vPhase;
      void main() {
        float flicker=.96+.04*sin(uTime*4.3+vPhase)*sin(uTime*6.1+vPhase*2.0);
        float ribs=pow(abs(cos(vUv.x*50.26548)),22.0);
        float grain=fract(sin(dot(vUv,vec2(371.17,149.31)))*43758.5453);
        float warmth=exp(-pow((vUv.y-.2)*3.2,2.0));
        vec3 paper=mix(vec3(1.0,.96,.85),vTint,.52)*(.76+.12*vNormal.y);
        paper*=1.0-ribs*.12+(grain-.5)*.035;
        paper+=mix(vTint,vec3(1.0,.52,.14),.5)*warmth*.55*flicker;
        float alpha=.86;
        if(uPart>.5 && uPart<1.5) { paper=vec3(.52,.28,.12)+vTint*.25; alpha=.9; }
        if(uPart>1.5 && uPart<2.5) { paper=mix(vec3(1.0,.35,.035),vec3(1.0,.91,.46),vUv.y)*1.75*flicker; alpha=.94; }
        if(uPart>2.5) { paper=vec3(.55,.34,.18); alpha=.85; }
        if(vFade<.003) discard;
        gl_FragColor=vec4(paper,alpha*vFade);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
}

/** Canvas text is inert raster content; wishes are never inserted into DOM/HTML. */
function wishTexture(wish: string): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 320;
  const ctx = canvas.getContext("2d"); if (!ctx) return null;
  ctx.fillStyle = "#fff3d8"; ctx.fillRect(0, 0, 512, 320);
  ctx.strokeStyle = "#b99156"; ctx.lineWidth = 4; ctx.strokeRect(14, 14, 484, 292);
  ctx.fillStyle = "#a47b3b"; ctx.beginPath(); ctx.arc(256, 22, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#9b7137"; ctx.font = '22px "Malgun Gothic", sans-serif'; ctx.textAlign = "center";
  ctx.fillText("소원을 담아", 256, 61);
  ctx.fillStyle = "#523b26";
  const text = wish.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  let lines: string[] = [];
  for(let fontSize=32;fontSize>=16;fontSize-=2) {
    ctx.font = `${fontSize}px "Malgun Gothic", sans-serif`;
    lines=[]; let line="";
    for(const char of Array.from(text)) {
      if(ctx.measureText(line+char).width>444 && line) { lines.push(line); line=""; }
      line+=char;
    }
    if(line) lines.push(line);
    if(lines.length<=6) break;
  }
  const lineHeight=Math.min(37,196/Math.max(1,lines.length-1));
  lines.forEach((value,i)=>ctx.fillText(value,256,94+i*lineHeight));
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

type Active = { event: UyuniMoment; floor: number; stop?: number; heldUntil?: number; spark?: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  tag?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; texture?: THREE.CanvasTexture };
type SparklerPose = (pid: string, tip: THREE.Vector3, age: number, gripTarget: THREE.Vector3) => THREE.Vector3 | null;
export class UyuniMoments {
  private readonly group = new THREE.Group();
  private readonly active = new Map<string, Active>();
  private readonly seen = new Map<string, string>();
  private readonly letters = new Map<Letter, THREE.BufferGeometry>();
  private readonly tagGeometry = new THREE.PlaneGeometry(.76, .475);
  private readonly fades = new THREE.InstancedBufferAttribute(new Float32Array(UYUNI_MOMENT_LIMIT), 1);
  private readonly phases = new THREE.InstancedBufferAttribute(new Float32Array(UYUNI_MOMENT_LIMIT), 1);
  private readonly lamps: THREE.InstancedMesh<THREE.BufferGeometry, THREE.ShaderMaterial>[];
  private readonly sticks: THREE.InstancedMesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private readonly transform = new THREE.Object3D();
  private readonly tip = new THREE.Vector3();
  private readonly gripTarget = new THREE.Vector3();
  private readonly stickDirection = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly newestSparkler = new Map<string, Active>();
  private readonly cameraPosition = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private clockOffset = 0;
  private lastServerTime = -Infinity;
  private lastTime = -Infinity;
  private quality: Quality = "high";
  private disposed = false;
  private readonly clock: () => number;
  private readonly floorHeight: (x: number, z: number) => number;
  private readonly poseSparkler?: SparklerPose;

  constructor(scene: THREE.Scene, options: { floorHeight?: (x: number, z: number) => number; now?: () => number; poseSparkler?: SparklerPose } = {}) {
    this.clock = options.now ?? Date.now; this.floorHeight = options.floorHeight ?? (() => 0);
    this.poseSparkler = options.poseSparkler;
    this.group.name = "uyuni-moments"; this.group.visible = false; scene.add(this.group);
    this.sticks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.005, .006, 1, 6),
      new THREE.MeshBasicMaterial({ color: 0x958575, toneMapped: false }), UYUNI_MOMENT_LIMIT);
    this.sticks.name = "uyuni-held-sparklers"; this.sticks.count = 0; this.sticks.frustumCulled = false;
    this.sticks.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(this.sticks);
    const profile = [[.18,-.52],[.26,-.48],[.34,-.30],[.38,.06],[.35,.39],[.26,.56],[.12,.63],[0,.65]];
    const body = new THREE.LatheGeometry(profile.map(([r,y]) => new THREE.Vector2(r,y)), 16);
    const rim = new THREE.TorusGeometry(.19, .016, 4, 16); rim.rotateX(Math.PI/2); rim.translate(0,-.51,0);
    const flame = new THREE.SphereGeometry(.055, 8, 6); flame.scale(.75, 2.25, .75); flame.translate(0,-.42,0);
    const string = new THREE.CylinderGeometry(.006,.006,.16,4); string.translate(0,-.61,0);
    this.lamps = [body,rim,flame,string].map((geometry, i) => {
      geometry.setAttribute("aFade",this.fades); geometry.setAttribute("aPhase",this.phases);
      const mesh = new THREE.InstancedMesh(geometry,lanternMaterial(i),UYUNI_MOMENT_LIMIT);
      mesh.name = ["uyuni-wish-paper","uyuni-wish-rims","uyuni-wish-flames","uyuni-wish-strings"][i];
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count=0; mesh.frustumCulled=false;
      // Allocate instanceColor once, before the first render compiles its shader variant.
      for(let slot=0;slot<UYUNI_MOMENT_LIMIT;slot++) mesh.setColorAt(slot,this.color.setHex(COLORS.amber));
      mesh.layers.enable(1); this.group.add(mesh); return mesh;
    });
  }

  /** Full room snapshot. Absent IDs disappear immediately; older snapshots cannot undo a privacy change. */
  apply(events: readonly UyuniMoment[], serverTime: number) {
    if(this.disposed || !Number.isFinite(serverTime) || serverTime < this.lastServerTime || !Array.isArray(events)) return;
    const local=this.clock(); if(!Number.isFinite(local)) return;
    const offset=serverTime-local;
    this.clockOffset=this.lastServerTime===-Infinity ? offset : Math.max(this.clockOffset,offset);
    this.lastServerTime=serverTime;
    const now=Math.max(this.lastTime,local+this.clockOffset);
    const accepted=new Map<string,UyuniMoment>(); let sparkCount=0,lanternCount=0;
    for(const event of events.slice(0,128)) {
      if(!validEvent(event) || now<event.startedAt || now>=event.startedAt+event.durationMs || accepted.has(event.id)) continue;
      const old=this.seen.get(event.id), key=fingerprint(event);
      if(old!==undefined && old!==key) continue;
      if(event.kind==="sparkler" ? sparkCount>=UYUNI_MOMENT_LIMIT : lanternCount>=UYUNI_MOMENT_LIMIT) continue;
      if(event.kind==="sparkler") sparkCount++; else lanternCount++;
      accepted.set(event.id,event);
    }
    for(const [id,item] of this.active) if(!accepted.has(id)) { this.remove(item); this.active.delete(id); }
    for(const [id,event] of accepted) if(!this.active.has(id)) {
      this.seen.set(id,fingerprint(event));
      const rawFloor=this.floorHeight(event.x,event.z), floor=Number.isFinite(rawFloor)?clamp(rawFloor,0,40):0;
      const item:Active={event:{...event},floor};
      if(event.kind==="sparkler") {
        const letter=event.letter!;
        if(!this.letters.has(letter)) this.letters.set(letter,sparkGeometry(letter));
        item.spark=new THREE.Points(this.letters.get(letter)!,sparkMaterial(event.yaw));
        item.spark.name="uyuni-sparkler-"+id;
        // A fixed writing plane at arm's reach. It never flips when an observer changes sides.
        item.spark.position.set(event.x-Math.sin(event.yaw)*.72,floor+1.38,event.z-Math.cos(event.yaw)*.72);
        item.stop = SPARKLER_DRAW_START + SPARKLER_DRAW_SECONDS;
        item.spark.frustumCulled=false; item.spark.layers.enable(1); this.group.add(item.spark);
      } else {
        const texture=wishTexture(event.wish!);
        if(texture) {
          item.texture=texture;
          item.tag=new THREE.Mesh(this.tagGeometry,new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));
          item.tag.name="uyuni-wish-tag-"+id; item.tag.layers.enable(1); item.tag.visible=false; this.group.add(item.tag);
        }
      }
      this.active.set(id,item);
    }
    // A person has one hand-held sparkler: the next choice stops the previous stroke,
    // while its already-painted embers remain in the air and continue fading.
    for (const item of this.active.values()) if (item.spark) {
      for (const next of this.active.values()) if (next.spark && next.event.fromPid === item.event.fromPid
        && next.event.startedAt > item.event.startedAt) item.stop = Math.min(item.stop!, (next.event.startedAt - item.event.startedAt) / 1000);
    }
    while(this.seen.size>512) this.seen.delete(this.seen.keys().next().value!);
    this.update(undefined,local);
  }

  update(camera?: THREE.Camera, now=this.clock(), viewportHeight=844) {
    if(this.disposed || !Number.isFinite(now) || this.lastServerTime===-Infinity) return;
    const time=Math.max(this.lastTime,now+this.clockOffset); this.lastTime=time;
    if(camera) { camera.updateWorldMatrix(true,false); camera.getWorldPosition(this.cameraPosition); }
    let slot=0, stickSlot=0;
    this.newestSparkler.clear();
    for(const item of this.active.values()) if(item.spark) {
      const previous=this.newestSparkler.get(item.event.fromPid);
      if(!previous || item.event.startedAt>previous.event.startedAt
        || (item.event.startedAt===previous.event.startedAt && item.event.id>previous.event.id)) this.newestSparkler.set(item.event.fromPid,item);
    }
    for(const [id,item] of this.active) {
      const event=item.event, age=(time-event.startedAt)/1000;
      if(age>=event.durationMs/1000) { this.remove(item); this.active.delete(id); continue; }
      if(item.spark) {
        const uniforms=item.spark.material.uniforms;
        uniforms.uAge.value=age; uniforms.uViewport.value=Number.isFinite(viewportHeight)?clamp(viewportHeight,1,1800):844;
        uniforms.uStop.value=item.stop; uniforms.uSprays.value=this.quality==="low"?2:this.quality==="medium"?4:6;
        uniforms.uHeld.value=0;
        const sample=sampleSparklerTip(event.letter!,age);
        uniforms.uTip.value.set(sample.x,sample.y,0);
        if(sample.drawing && age<=item.stop! && this.newestSparkler.get(event.fromPid)===item) {
          const c=Math.cos(event.yaw),s=Math.sin(event.yaw);
          this.tip.set(-sample.x*c,sample.y,sample.x*s).add(item.spark.position);
          this.gripTarget.set(event.x,item.floor+.92,event.z).sub(this.tip).normalize().multiplyScalar(.48).add(this.tip);
          const grip=this.poseSparkler?.(event.fromPid,this.tip,age,this.gripTarget);
          if(grip && [grip.x,grip.y,grip.z].every(Number.isFinite)) {
            const length=this.stickDirection.subVectors(this.tip,grip).length();
            if(length>.03 && length<1.4) {
              this.stickDirection.multiplyScalar(1/length);
              this.transform.position.copy(grip).add(this.tip).multiplyScalar(.5).addScaledVector(this.stickDirection,-.025);
              this.transform.quaternion.setFromUnitVectors(this.up,this.stickDirection);
              this.transform.scale.set(1,length+.05,1); this.transform.updateMatrix();
              this.sticks.setMatrixAt(stickSlot++,this.transform.matrix); uniforms.uHeld.value=1;
              item.heldUntil=age;
            }
          }
          // Walking away or resting leaves only the strokes already painted by the hand.
          // Do not cancel a newly received event while its avatar is still loading.
          if(uniforms.uHeld.value===0 && item.heldUntil!==undefined) item.stop=Math.min(item.stop!,item.heldUntil);
        }
        uniforms.uStop.value=item.stop;
      } else {
        const motion=sampleWishLantern(event,age,item.floor);
        this.transform.position.set(motion.x,motion.y,motion.z); this.transform.rotation.set(0,motion.yaw,motion.tilt); this.transform.scale.setScalar(1); this.transform.updateMatrix();
        this.fades.setX(slot,motion.opacity); this.phases.setX(slot,seedOf(event.id)*Math.PI*2);
        this.color.setHex(COLORS[event.color??"amber"]);
        for(const lamp of this.lamps) { lamp.setMatrixAt(slot,this.transform.matrix); lamp.setColorAt(slot,this.color); }
        if(item.tag) {
          item.tag.position.set(motion.x,motion.y-.93,motion.z);
          if(camera) item.tag.rotation.set(0,Math.atan2(this.cameraPosition.x-motion.x,this.cameraPosition.z-motion.z),motion.tilt*.5);
          const distance=camera?this.cameraPosition.distanceTo(item.tag.position):Infinity;
          item.tag.material.opacity=motion.opacity*(1-smooth(10,this.quality==="low"?15:20,distance));
          item.tag.visible=item.tag.material.opacity>.01;
        }
        slot++;
      }
    }
    for(const lamp of this.lamps) { lamp.count=slot; lamp.instanceMatrix.needsUpdate=true; lamp.instanceColor!.needsUpdate=true; lamp.material.uniforms.uTime.value=(time/1000)%(20*Math.PI); }
    this.sticks.count=stickSlot; this.sticks.instanceMatrix.needsUpdate=true;
    this.fades.needsUpdate=true; this.phases.needsUpdate=true; this.group.visible=this.active.size>0;
  }

  setQuality(quality: Quality) { if(quality==="high"||quality==="medium"||quality==="low") this.quality=quality; }
  private remove(item: Active) { item.spark?.removeFromParent(); item.spark?.material.dispose(); item.tag?.removeFromParent(); item.tag?.material.dispose(); item.texture?.dispose(); }
  dispose() {
    if(this.disposed) return; this.disposed=true;
    for(const item of this.active.values()) this.remove(item);
    this.active.clear(); this.seen.clear(); this.group.removeFromParent();
    for(const geometry of this.letters.values()) geometry.dispose(); this.letters.clear(); this.tagGeometry.dispose();
    this.sticks.geometry.dispose(); this.sticks.material.dispose(); this.sticks.dispose(); this.newestSparkler.clear();
    for(const lamp of this.lamps) { lamp.geometry.dispose(); lamp.material.dispose(); lamp.dispose(); }
  }
}
