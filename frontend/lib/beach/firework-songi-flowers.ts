/** Destinations for moving firework embers, not a texture or a stationary line drawing. */
type Vec3 = readonly [number, number, number];
export type SongiFlowerKind = "rose" | "tulip" | "cosmos";
export type SongiFlowerParticle = {
  target: Vec3;
  center: Vec3;
  start: number;
  delay: number;
  life: number;
  color: number;
  alpha: number;
  phase: number;
  streak: number;
  flowerId: number;
  kind: SongiFlowerKind;
};

export const SONGI_FLOWER_MOTION = {
  expansion: 1.28, impulse: 1.05, gravity: .58, fallAfter: .8,
  tailSpan: .28, fadeStart: .53,
} as const;

const BLOOMS = [
  { kind: "rose", x: 0, y: 21, start: 9.1, color: 0xff345f, size: 2.1 },
  { kind: "tulip", x: -35, y: 9, start: 10.5, color: 0xff4b99, size: 1.92 },
  { kind: "tulip", x: 0, y: 35, start: 10.64, color: 0xffa154, size: 1.92 },
  { kind: "tulip", x: 35, y: 9, start: 10.78, color: 0xc574ff, size: 1.92 },
  { kind: "cosmos", x: -48, y: 8, start: 11.9, color: 0xff5cbd, size: 1.54 },
  { kind: "cosmos", x: -24, y: 35, start: 12.02, color: 0xff82a2, size: 1.54 },
  { kind: "cosmos", x: 0, y: 9, start: 12.14, color: 0xc983ff, size: 1.54 },
  { kind: "cosmos", x: 24, y: 35, start: 12.26, color: 0xff687f, size: 1.54 },
  { kind: "cosmos", x: 48, y: 8, start: 12.38, color: 0xff9cd6, size: 1.54 },
] as const;

function mixColor(a: number, b: number, t: number) {
  return [16, 8, 0].reduce((hex, shift) => hex | Math.round(((a >> shift) & 255) * (1-t) + ((b >> shift) & 255) * t) << shift, 0);
}

function quadratic(a: readonly number[], b: readonly number[], c: readonly number[], t: number): [number, number] {
  const s = 1-t;
  return [s*s*a[0]+2*s*t*b[0]+t*t*c[0], s*s*a[1]+2*s*t*b[1]+t*t*c[1]];
}

/** A green stem and a pair of short leaves still expand from the same burst centre. */
function stem(i: number, count: number): Vec3 {
  if (i < count/2) return [.5*Math.sin(i*1.4), -7-i/(count/2-1)*12, -.9];
  const leaf = i-count/2, half = count/4, side = leaf<half ? -1 : 1;
  const t = (leaf % half)/(half-1);
  return [side*Math.sin(Math.PI*t)*5, -11-t*5+Math.sin(Math.PI*t)*3, -.5];
}

/** Each head has delayed siblings along the SAME trajectory, like the existing love heart. */
export function buildSongiFlowers(seed: number, mobile: boolean, scale = 1) {
  let state = (seed ^ 0x5a7f21) >>> 0;
  const random = () => ((state = (Math.imul(state, 1664525)+1013904223) >>> 0) / 4294967296);
  const tails = mobile ? 3 : 5;
  const streak = SONGI_FLOWER_MOTION.tailSpan/(tails-1);
  const particles: SongiFlowerParticle[] = [];
  const launches = BLOOMS.map((b, id) => ({ id, kind: b.kind, center: [b.x*scale, b.y*scale, 25*scale] as Vec3,
    start: b.start, color: b.color, flight: 1.3 }));
  for (const [id, bloom] of BLOOMS.entries()) {
    const heads = bloom.kind === "rose" ? (mobile ? 192 : 320) : bloom.kind === "tulip" ? (mobile ? 128 : 192) : (mobile ? 96 : 128);
    const stalks = bloom.kind === "rose" ? (mobile ? 24 : 40) : bloom.kind === "tulip" ? (mobile ? 24 : 32) : 0;
    for (let head = 0; head < heads; head++) {
      let target: Vec3, color: number;
      if (head < stalks) {
        target = stem(head, stalks); color = head % 3 ? 0x4cf0a0 : 0x9dff75;
      } else if (bloom.kind === "rose") {
        const n = head-stalks, layer = n%4, samples = Math.floor((heads-stalks+3-layer)/4);
        const a = Math.floor(n/4)/samples*Math.PI*2+layer*.58;
        const radius = (3.2+layer*3.9)*(.82+.18*Math.cos(5*a+layer*.8));
        const angle = a+.15*Math.sin(5*a+layer*.7);
        target = [Math.cos(angle)*radius, Math.sin(angle)*radius*.88+2, Math.sin(a*3+layer)*2.2+layer*.5];
        color = mixColor(0xffb17b, bloom.color, .3+layer*.22);
      } else if (bloom.kind === "tulip") {
        const n = head-stalks, petal = n%3, samples = Math.floor((heads-stalks+2-petal)/3);
        const u = Math.floor(n/3)/samples, t = u<.5 ? u*2 : (u-.5)*2;
        const base = petal===0 ? [-1,-7] : petal===1 ? [0,-7] : [1,-7];
        const tip = petal===0 ? [-7,10] : petal===1 ? [0,14] : [7,10];
        const left = petal===0 ? [-14,-1] : petal===1 ? [-7,3] : [-1,0];
        const right = petal===0 ? [2,0] : petal===1 ? [7,3] : [14,-1];
        const [x,y] = u<.5 ? quadratic(base,left,tip,t) : quadratic(tip,right,base,t);
        target = [x,y,(petal-1)*1.4+Math.sin(u*Math.PI*2)*1.1];
        color = mixColor(bloom.color,0xffd09d,petal===1?.16:.04);
      } else {
        const centres = 8, perPetal = (heads-centres)/8;
        if (head < centres) {
          const a = head/centres*Math.PI*2;
          target = [Math.cos(a)*2.2,Math.sin(a)*2.2,1]; color = 0xffc947;
        } else {
          const n = head-centres, petal = Math.floor(n/perPetal), t = (n%perPetal+.5)/perPetal;
          const angle = petal/8*Math.PI*2+.27*Math.sin(t*Math.PI*2);
          const radius = 2.6+11*Math.pow(Math.sin(t*Math.PI),.65);
          target = [Math.cos(angle)*radius,Math.sin(angle)*radius,Math.sin(t*Math.PI)*1.7];
          color = mixColor(bloom.color,0xffc6b5,.12+(petal%2)*.07);
        }
      }
      const jitter = .98+random()*.04;
      const ray: Vec3 = [target[0]*scale*bloom.size*jitter,target[1]*scale*bloom.size*jitter,target[2]*scale];
      const phase = random()*Math.PI*2, life = 1.83+random()*.17;
      for (let tail=0; tail<tails; tail++) particles.push({ target: ray, center: launches[id].center,
        start: bloom.start, delay: tail*streak, life, color, phase, streak,
        alpha: tail===0?.94:.32*(1-.58*tail/tails), flowerId: id, kind: bloom.kind });
    }
  }
  const maxHalfWidth = Math.max(...particles.map(p=>Math.abs(p.center[0]+p.target[0]*SONGI_FLOWER_MOTION.expansion)))+2;
  const maxHalfHeight = Math.max(...particles.map(p=>Math.abs(p.center[1]+p.target[1]*SONGI_FLOWER_MOTION.expansion)))+4;
  return { particles, launches, tails, maxHalfWidth, maxHalfHeight, firstBurst: BLOOMS[0].start, lastBurnout: 14.38 };
}

/**
 * Attribute contract:
 * flower = target.xyz/start; flowerCenter = centre.xyz/life;
 * flowerBurn = delay/streak/alpha/phase; flowerColor = linear RGB.
 * Returned alpha is absolute. The caller divides it by the original detail.z
 * before the shared vAlpha assignment, so old spherical-bank alpha is irrelevant.
 */
export const SONGI_FLOWER_GLSL = `
void songiFlowerMotion(vec4 flower, vec4 flowerCenter, vec4 flowerBurn, vec3 flowerColor,
  out vec3 p, out vec3 tangent, out float alpha, out float sparkle, out float tip, out vec3 colour) {
  float shellAge=uAge-flower.w, t=max(0.0,shellAge-flowerBurn.x);
  float head=1.0-step(.001,flowerBurn.x), fall=max(0.0,t-${SONGI_FLOWER_MOTION.fallAfter});
  float expansion=${SONGI_FLOWER_MOTION.expansion}*(1.0-exp(-${SONGI_FLOWER_MOTION.impulse}*t));
  vec3 offset=flower.xyz*expansion-vec3(0.0,${SONGI_FLOWER_MOTION.gravity}*fall*fall,0.0);
  vec3 motion=flower.xyz*${SONGI_FLOWER_MOTION.expansion*SONGI_FLOWER_MOTION.impulse}*exp(-${SONGI_FLOWER_MOTION.impulse}*t)
    -vec3(0.0,${2*SONGI_FLOWER_MOTION.gravity}*fall,0.0);
  vec3 behind=normalize(uTextCenter-uCameraPosition)*flowerCenter.z, back=cross(uTextRight,uTextUp);
  p=uTextCenter+(behind+uTextRight*(flowerCenter.x+offset.x)+uTextUp*(flowerCenter.y+offset.y)-back*offset.z)*uFlowerScale;
  tangent=(uTextRight*motion.x+uTextUp*motion.y-back*motion.z)*uFlowerScale;
  float glint=fireworkTwinkle(t,flowerBurn.w), burnout=smoothstep(.9,flowerCenter.w,shellAge);
  alpha=step(flowerBurn.x,shellAge)*smoothstep(.04,.25,t)*(1.0-smoothstep(flowerCenter.w*${SONGI_FLOWER_MOTION.fadeStart},flowerCenter.w,shellAge));
  alpha*=mix(exp(-max(0.0,t-.65)*1.5),1.0,head);
  alpha*=mix(.88+.12*glint,.12+.88*glint,burnout)*flowerBurn.z;
  tip=head*burnout; sparkle=glint*mix(.18,.8,burnout); colour=flowerColor;
}
`;
