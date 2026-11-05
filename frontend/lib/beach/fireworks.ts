import * as THREE from "three";
import { assetLoader, assetUrl } from "../assets";
import type { FireworkEvent, FireworkVariant } from "./net";
import { festivalVariantGeometry } from "./firework-festival-variants";

export const FIREWORK_SPARK_URL = "/beach/fx/firework-spark-v1.webp";
const PALETTE = [0xffc777, 0xff83b1, 0x87eaff, 0xb89aff, 0x95ffd1, 0xffb88c];
const CENTERS = [[-28, 50, -58], [0, 64, -76], [28, 53, -60], [-26, 78, -46], [27, 82, -44], [-33, 77, 8], [0, 101, -12], [33, 80, 10]];
const STARTS = [1.3, 1.3, 1.3, 3.7, 3.7, 6.4, 6.4, 6.4];
export const FIREWORK_TEXT = { songi: "송이 안녕?", love: "사랑해" } as const;
export const FIREWORK_TEXT_CENTER = [0, 72, -45] as const;
export const FIREWORK_SKY_TEXT_CENTER = [0, 90, 28] as const;

// Fixed 24×26 glyph samples from Malgun Gothic Bold, rendered once during authoring.
// Only these eight glyphs are stored: every browser gets identical Hangul particle
// positions without downloading a font, raster image or relying on Canvas fonts.
const GLYPHS: Record<string, string> = {
  "송": "0.0.0.iyo.iyo.1beo.2rk0.lxq8.2f4qo.27740.iyo.iyo.4zso0.4zso0.0.5lhc.mgw0.166io.13clc.13clc.166io.mgw0.5lhc.0.0.0",
  "이": "0.0.0.26nsw.26txc.270cg.27a9s.276ww.27w80.27w80.27w80.27pwg.27w80.27w80.27w80.27740.27a9s.270cg.26tq8.26nsw.26nsw.26nsw.26nsw.26nsw.0.0",
  "안": "0.0.0.xpmo.xvr4.y280.yc3k.yy1s.yxy8.9pl5s.9pl5s.yy1s.yc3k.y280.xvr4.xpmo.xpmo.xr0g.1ds.1ds.1ds.2hw5c.2hw5c.0.0.0",
  "녕": "0.0.0.26nsw.26ny8.2hjuo.2hjuo.26ny8.2hjuo.2hjuo.26ny8.26ny8.29gw0.29gw0.26nsw.b6yo.18xs0.2cd1c.26p6o.26p6o.2cd1c.18xs0.b6yo.0.0.0",
  "?": "0.0.0.0.0.0.0.rk.35c.35c.2s0.2rk.2rk.2yo.1hc.ow.cg.5c.cg.0.cg.cg.cg.0.0.0",
  "사": "0.0.0.xpmo.xse8.xse8.xse8.xse8.xse8.xse8.xse8.xvk0.9oiyo.9oi68.y1ds.yc3k.yy1s.106b4.yexs.xpmo.xpmo.xpmo.xpmo.xpmo.0.0",
  "랑": "0.0.0.xpmo.yew0.yew0.y8lc.y8lc.9p23k.9p23k.xpsw.xpsw.10iqo.10iqo.xpmo.5kow.mgow.13da8.xr0g.xr0g.13da8.mgow.5kow.0.0.0",
  "해": "0.0.0.1zocg.1zocg.1zocg.20c8g.20c8g.1zmyo.1zmyo.1zq0w.1zt8g.2gt0g.2gt0g.1zwio.1zy74.1zy74.1zt8g.1zq0w.1zmyo.1zmyo.1zmyo.1zmyo.1vf9c.0.0",
};

function textPoints(text: string) {
  const points: [number, number][] = [];
  let advance = 0;
  for (const character of text) {
    if (character === " ") { advance += 12; continue; }
    GLYPHS[character].split(".").forEach((row, y) => {
      const bits = parseInt(row, 36);
      for (let x = 0; x < 24; x++) if (bits & (1 << x)) points.push([advance + x, -y]);
    });
    advance += character === "?" ? 16 : 26;
  }
  const minX = Math.min(...points.map(p => p[0])), maxX = Math.max(...points.map(p => p[0]));
  const minY = Math.min(...points.map(p => p[1])), maxY = Math.max(...points.map(p => p[1]));
  return points.map(([x, y]) => [(x - (minX + maxX) / 2) * 0.43, (y - (minY + maxY) / 2) * 0.43] as const);
}

/** Seeded GPU trajectories let every visitor see the same show at its current age. */
export function fireworkGeometry(seed: number, mobile = false, variant: FireworkVariant = "festival", grand = false): THREE.BufferGeometry {
  if (variant === "bloom" || variant === "saturn" || variant === "willow" || variant === "stardust")
    return grand ? festivalVariantGeometry(seed, mobile, variant) : fireworkGeometry(seed, mobile, "festival", false);
  if (grand) return grandFireworkGeometry(seed, mobile, variant);
  let state = seed >>> 0;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const origin: number[] = [], velocity: number[] = [], color: number[] = [], timing: number[] = [], detail: number[] = [];
  const tint = new THREE.Color();
  const spokes = mobile ? 96 : 176, tails = mobile ? 4 : 5;
  const add = (burst: number, dx: number, dy: number, dz: number, delay: number, life: number, size: number, mode: number, hue: number, alpha: number) => {
    origin.push(...CENTERS[burst]); velocity.push(dx, dy, dz);
    tint.setHex(hue); color.push(tint.r, tint.g, tint.b);
    timing.push(STARTS[burst], delay, life, mode); detail.push(size, random() * Math.PI * 2, alpha);
  };
  for (let burst = 0; burst < CENTERS.length; burst++) {
    for (let ray = 0; ray < spokes; ray++) {
      const phi = ray * 2.399963, vertical = 1 - 2 * (ray + 0.5) / spokes;
      const radial = Math.sqrt(Math.max(0, 1 - vertical * vertical));
      const speed = 18.5 + random() * 7;
      const ring = burst === 4 && ray % 3 !== 0;
      const dx = (ring ? Math.cos(phi) : radial * Math.cos(phi)) * speed;
      const dy = (ring ? Math.sin(phi) : vertical) * speed;
      const dz = (ring ? (random() - 0.5) * 0.18 : radial * Math.sin(phi)) * speed;
      const willow = burst === 3 || burst === 6;
      const hue = willow ? PALETTE[0] : PALETTE[(burst + (seed % 6)) % PALETTE.length];
      const life = willow ? 4.8 : 3.8 + random() * 0.5;
      for (let tail = 0; tail < tails; tail++) {
        add(burst, dx, dy, dz, tail * 0.07, life, tail ? 0.4 : 0.85, willow ? 2 : 0, hue, tail ? 0.62 * (1 - tail / tails) : 0.98);
      }
    }
    for (let tail = 0; tail < 24; tail++) add(burst, 0, 0, 0, tail * 0.014, 1.3, tail ? 0.22 : 0.62, 1, 0xffdab0, 1 - tail / 26);
    add(burst, 0, 0, 0, 0, 0.28, 9, 3, 0xffe4c0, 0.95);
    add(burst, 0, 0, 0, 0, 0.45, 28, 5, hueFromBurst(burst, seed), 0.44);
  }
  const phrase = variant === "festival" ? "" : FIREWORK_TEXT[variant];
  const letters = phrase ? textPoints(phrase) : [];
  for (const [x, y] of letters) {
    origin.push(...FIREWORK_TEXT_CENTER); velocity.push(x, y, 0);
    tint.setHex(variant === "love" ? 0xffc9de : 0xffedbf); color.push(tint.r, tint.g, tint.b);
    timing.push(2.6, random() * 0.2, 6.8, 4); detail.push(0.39, random() * Math.PI * 2, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(origin, 3));
  geometry.setAttribute("velocity", new THREE.Float32BufferAttribute(velocity, 3));
  geometry.setAttribute("sparkColor", new THREE.Float32BufferAttribute(color, 3));
  geometry.setAttribute("timing", new THREE.Float32BufferAttribute(timing, 4));
  geometry.setAttribute("detail", new THREE.Float32BufferAttribute(detail, 3));
  geometry.userData.variant = variant;
  geometry.userData.phrase = phrase;
  geometry.userData.textWidth = letters.length ? Math.max(...letters.map(p => p[0])) - Math.min(...letters.map(p => p[0])) + 0.8 : 0;
  return geometry;
}

function hueFromBurst(burst: number, seed: number) { return PALETTE[(burst + seed % PALETTE.length) % PALETTE.length]; }

// Wide seaward tiers, a high crown and three overhead flowers. Tail samples are
// short oriented strokes, rather than larger dots, so the willow stays delicate.
const GRAND_SHELLS = [
  [-40,48,-210,1.3], [0,63,-225,1.3], [40,50,-210,1.3],
  [-65,49,-205,3], [-22,75,-215,3], [22,75,-215,3], [65,49,-205,3],
  [-42,79,-230,5], [0,94,-245,5], [42,79,-230,5], [0,53,-195,5],
  [-70,56,-215,7.1], [-32,74,-225,7.1], [0,88,-245,7.1], [32,74,-225,7.1], [70,56,-215,7.1],
  [-36,88,12,7.5], [0,107,18,7.5], [36,88,12,7.5],
];
const GRAND_PALETTE = [0xffb42e, 0xff3f75, 0x26d5ff, 0x8350ff, 0x31e8a1, 0xff7134];
function grandFireworkGeometry(seed: number, mobile: boolean, variant: "festival" | "songi" | "love") {
  if (variant !== "festival") return grandPersonalGeometry(seed, mobile, variant);
  let state=seed>>>0;
  const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  const origin:number[]=[], velocity:number[]=[], colors:number[]=[], timing:number[]=[], detail:number[]=[];
  const tint=new THREE.Color();
  const add=(center:readonly number[], direction:readonly number[], start:number, delay:number, life:number,
    mode:number, hue:number, size:number, alpha:number, phase:number)=>{
    origin.push(center[0],center[1],center[2]); velocity.push(direction[0],direction[1],direction[2]);
    tint.setHex(hue); colors.push(tint.r,tint.g,tint.b);
    timing.push(start,delay,life,mode); detail.push(size,phase,alpha);
  };
  const rays=mobile?80:136, tails=mobile?18:28;
  for(let shell=0;shell<GRAND_SHELLS.length;shell++) {
    const center=GRAND_SHELLS[shell], start=center[3], willow=shell%3===1 || (shell>=11 && shell%2===1);
    const span=willow?1.18:.65, step=span/(tails-1), life=Math.min(willow?5.6:4.4,11.92-start-span);
    for(let ray=0;ray<rays;ray++) {
      const phi=ray*2.399963+random()*.06, vertical=1-2*(ray+.5)/rays, radial=Math.sqrt(1-vertical*vertical);
      const speed=((shell>=11?23:19)+random()*7)*(ray%5===0?.56:1);
      const direction=[radial*Math.cos(phi)*speed,vertical*speed,radial*Math.sin(phi)*speed*.7];
      const phase=random()*Math.PI*2;
      const hue=willow?0xffbc42:GRAND_PALETTE[(shell+(seed%6)+Math.floor(ray/(rays/3)))%GRAND_PALETTE.length];
      for(let tail=0;tail<tails;tail++) add(center,direction,start,tail*step,life,willow?6:7,hue,step,
        (willow?.84:.9)*(1-.58*tail/tails),phase);
    }
    const coreRays=mobile?20:32, coreTails=mobile?8:10;
    for(let ray=0;ray<coreRays;ray++) {
      const phi=ray*2.399963, y=1-2*(ray+.5)/coreRays, radial=Math.sqrt(1-y*y), phase=random()*6.28;
      const speed=5+random()*9, direction=[Math.cos(phi)*radial*speed,y*speed,Math.sin(phi)*radial*speed*.65];
      const coreStart=start+.18, coreLife=Math.min(3.2,11.92-coreStart-.35);
      for(let tail=0;tail<coreTails;tail++) add(center,direction,coreStart,tail*.35/(coreTails-1),coreLife,7,
        ray%3===0?0xffc659:GRAND_PALETTE[(shell+seed%6)%6],.35/(coreTails-1),.86*(1-.6*tail/coreTails),phase);
    }
    // A narrow ascending comet and a restrained detonation glow; no giant white disc.
    for(let trail=0;trail<32;trail++) add(center,[0,0,0],start,trail*.011,1.2,1,0xffcf8d,trail?.20:.58,1-trail/36,random()*6.28);
    add(center,[0,0,0],start,0,.24,3,0xffd69a,4.2,.38,random()*6.28);
  }
  // Small jewel-like satellite flowers fill the spaces between large gold shells.
  const smallRays=mobile?20:36, smallTails=mobile?6:8;
  for(let shell=0;shell<8;shell++) {
    const center=[-56+shell*16,34+(shell%3)*11,-208+(shell%2)*12], start=2.2+Math.floor(shell/3)*2.15;
    for(let ray=0;ray<smallRays;ray++) {
      const angle=ray*2.399963, y=1-2*(ray+.5)/smallRays, radius=Math.sqrt(1-y*y), phase=random()*6.28;
      const direction=[Math.cos(angle)*radius*12,y*12,Math.sin(angle)*radius*8];
      for(let tail=0;tail<smallTails;tail++) add(center,direction,start,tail*.035,2.3,7,
        GRAND_PALETTE[(shell+seed%6)%6],.035,.65*(1-tail/(smallTails+1)),phase);
    }
  }
  // A low, symmetric fan frames the horizon below the aerial flowers.
  const fanRays=mobile?18:24, fanTails=mobile?12:18, fanStep=.82/(fanTails-1);
  for(let fan=0;fan<7;fan++) for(let ray=0;ray<fanRays;ray++) {
    const angle=-1.05+2.1*ray/(fanRays-1), speed=23+random()*8, phase=random()*6.28;
    const center=[(fan-3)*19,4,-190], direction=[Math.sin(angle)*speed,Math.cos(angle)*speed,0];
    for(let tail=0;tail<fanTails;tail++) add(center,direction,6.6,tail*fanStep,3.3,8,
      ray%3===0?GRAND_PALETTE[(fan+seed%6)%6]:0xffb841,fanStep,.61*(1-.7*tail/fanTails),phase);
  }
  const phrase=variant==="festival"?"":FIREWORK_TEXT[variant], letters=phrase?textPoints(phrase):[];
  for(const [x,y] of letters) add(FIREWORK_TEXT_CENTER,[x,y,0],2.6,random()*.2,6.8,4,
    (variant as FireworkVariant)==="love"?0xffc9de:0xffedbf,.39,1,random()*6.28);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(origin,3));
  geometry.setAttribute("velocity",new THREE.Float32BufferAttribute(velocity,3));
  geometry.setAttribute("sparkColor",new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute("timing",new THREE.Float32BufferAttribute(timing,4));
  geometry.setAttribute("detail",new THREE.Float32BufferAttribute(detail,3));
  geometry.userData.variant=variant; geometry.userData.phrase=phrase; geometry.userData.grand=true;
  geometry.userData.textWidth=letters.length?Math.max(...letters.map(p=>p[0]))-Math.min(...letters.map(p=>p[0]))+.8:0;
  return geometry;
}

const PERSONAL_TEXT_CENTER = [0, 66, -205] as const;
const HEART_SHELLS = [
  [0,65,-212,1.35,29], [-38,55,-205,3.0,20], [38,61,-222,4.35,23],
  [0,81,-239,6.0,32], [-15,51,-194,7.15,15],
];

/** Personal shows own their choreography; the approved festival stays byte-for-byte separate. */
function grandPersonalGeometry(seed: number, mobile: boolean, variant: "songi" | "love") {
  let state=seed>>>0;
  const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  const origin:number[]=[], velocity:number[]=[], colors:number[]=[], timing:number[]=[], detail:number[]=[];
  const tint=new THREE.Color();
  const add=(center:readonly number[], direction:readonly number[], start:number, delay:number, life:number,
    mode:number, hue:number, size:number, alpha:number, phase:number)=>{
    origin.push(center[0],center[1],center[2]); velocity.push(direction[0],direction[1],direction[2]);
    tint.setHex(hue); colors.push(tint.r,tint.g,tint.b);
    timing.push(start,delay,life,mode); detail.push(size,phase,alpha);
  };
  const comet=(center:readonly number[],start:number)=>{
    for(let i=0;i<32;i++) add(center,[0,0,0],start,i*.011,1.2,1,0xffbd69,i?.20:.58,1-i/36,random()*6.28);
    add(center,[0,0,0],start,0,.24,3,0xffc98c,4,.4,random()*6.28);
  };
  if(variant==="songi") {
    const shells=[[0,66,-205,1.2,1.35],[-38,56,-215,1.6,.8],[38,56,-215,1.6,.8],[-68,42,-230,6.5,.65],[68,42,-230,6.9,.65]];
    const rays=mobile?100:176, tails=mobile?24:34;
    for(let shell=0;shell<shells.length;shell++) {
      const center=shells[shell], start=center[3], step=.85/(tails-1), life=Math.min(shell<3?2.6:3.8,11.92-start-.85);
      for(let ray=0;ray<rays;ray++) {
        const angle=ray*2.399963, y=1-2*(ray+.5)/rays, radial=Math.sqrt(1-y*y), phase=random()*6.28;
        const speed=(16+random()*7)*center[4]*(ray%5===0?.55:1);
        const direction=[Math.cos(angle)*radial*speed,y*speed,Math.sin(angle)*radial*speed*.65];
        for(let tail=0;tail<tails;tail++) add(center,direction,start,tail*step,life,6,
          ray%6===0?0xff8c52:0xffc25a,step,.82*(1-.6*tail/tails),phase);
      }
      comet(center,start);
    }
    for(const [x,y] of textPoints(FIREWORK_TEXT.songi)) for(let ember=0;ember<3;ember++) {
      const jitter=ember===0?0:.23;
      add(PERSONAL_TEXT_CENTER,[x*1.8+(random()-.5)*jitter,y*1.8+(random()-.5)*jitter,ember],
        2.0,random()*.28,8.7,4,ember===2?0xffbb7b:0xffdfa0,ember===0?.86:.58,
        ember===0?.95:.30,random()*Math.PI*2);
    }
  } else {
    const samples=mobile?128:224, tails=mobile?18:26, goldTails=mobile?12:18;
    for(let shell=0;shell<HEART_SHELLS.length;shell++) {
      const center=HEART_SHELLS[shell], start=center[3], radius=center[4], tilt=(shell%2===0?1:-1)*.17;
      const span=.62, step=span/(tails-1), life=Math.min(3.5,11.92-start-span);
      for(let ray=0;ray<samples;ray++) {
        const angle=ray/samples*Math.PI*2, x=Math.pow(Math.sin(angle),3);
        const y=(13*Math.cos(angle)-5*Math.cos(2*angle)-2*Math.cos(3*angle)-Math.cos(4*angle))/17+.13;
        const phase=random()*6.28, depth=Math.sin(angle*2)*radius*.13;
        for(let layer=0;layer<2;layer++) {
          const scale=(layer===0?1:.78)*(.97+.06*random());
          const direction=[(x*Math.cos(tilt)+y*Math.sin(tilt))*radius*scale,
            (y*Math.cos(tilt)-x*Math.sin(tilt))*radius*scale,depth+(layer===0?2:-2)];
          for(let tail=0;tail<tails;tail++) add(center,direction,start,tail*step,life,9,
            shell%2===0?0xff4986:0xff8b9d,step,(tail===0?.85:.52)*(layer===0?1:.72)*(1-.6*tail/tails),phase);
        }
        const goldStart=start+1.6, goldSpan=.6, goldLife=Math.min(3.6,11.92-goldStart-goldSpan);
        const direction=[(x*Math.cos(tilt)+y*Math.sin(tilt))*radius,(y*Math.cos(tilt)-x*Math.sin(tilt))*radius,depth+2];
        for(let tail=0;tail<goldTails;tail++) add(center,direction,goldStart,tail*goldSpan/(goldTails-1),goldLife,10,
          ray%4===0?0xff926b:0xffc45f,goldSpan/(goldTails-1),.72*(1-.66*tail/goldTails),phase);
      }
      comet(center,start);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(origin,3));
  geometry.setAttribute("velocity",new THREE.Float32BufferAttribute(velocity,3));
  geometry.setAttribute("sparkColor",new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute("timing",new THREE.Float32BufferAttribute(timing,4));
  geometry.setAttribute("detail",new THREE.Float32BufferAttribute(detail,3));
  geometry.userData.variant=variant; geometry.userData.phrase=variant==="songi"?FIREWORK_TEXT.songi:""; geometry.userData.grand=true;
  const letters=variant==="songi"?textPoints(FIREWORK_TEXT.songi):[];
  geometry.userData.textWidth=letters.length?(Math.max(...letters.map(p=>p[0]))-Math.min(...letters.map(p=>p[0]))+.8)*1.8:0;
  return geometry;
}

function personalMaterial(material: THREE.ShaderMaterial, variant: "songi" | "love") {
  if(variant==="songi") {
    // Only this variant receives the ember motion. The festival shader source is untouched.
    const begin=material.vertexShader.indexOf("if (timing.w > 3.5 && timing.w < 4.5) {");
    const end=material.vertexShader.indexOf("} else if (timing.w > 5.5) {",begin);
    material.vertexShader=material.vertexShader.slice(0,begin)+`if (timing.w > 3.5 && timing.w < 4.5) {
              float t=max(0.0,age), settle=smoothstep(.05,1.15,t);
              float fall=max(0.0,t-3.6), scatter=smoothstep(3.6,8.4,t);
              vec2 flutter=vec2(sin(detail.y+t*.65),cos(detail.y*1.7+t*.5));
              vec2 offset=velocity.xy*mix(.88,1.0,settle);
              offset+=flutter*((1.0-settle)*3.4+.12+scatter*1.6);
              offset.y-=fall*fall*(.12+.08*sin(detail.y)*sin(detail.y));
              p=uTextCenter+(uTextRight*offset.x+uTextUp*offset.y)*uTextScale;
              p+=cross(uTextRight,uTextUp)*sin(detail.y)*(.4+scatter)*uTextScale;
              fade=smoothstep(.25,1.1,t)*(1.0-smoothstep(5.0,timing.z,t));
              fade*=.72+.28*fireworkTwinkle(t,detail.y);
              sparkle=fireworkTwinkle(t,detail.y)*.4;
            `+material.vertexShader.slice(end);
    material.vertexShader=material.vertexShader.replace("vec2(uTextWidth*.55,6.8)","vec2(uTextWidth*.57,11.5)")
      .replace("reserve*.68*smoothstep(2.7,3.5,uAge)","reserve*.92*smoothstep(2.0,2.75,uAge)");
  } else {
    material.vertexShader=material.vertexShader.replace("} else if (timing.w > 5.5) {",`}
            else if(timing.w>8.5) {
              float t=max(0.0,age);
              if(timing.w<9.5) {
                float expansion=1.28*(1.0-exp(-1.05*t)), fall=max(0.0,t-1.2);
                p+=velocity*expansion;
                p.y-=.58*fall*fall;
                tangent=velocity*1.344*exp(-1.05*t)-vec3(0.0,1.16*fall,0.0);
                fade=smoothstep(.08,.4,t)*(1.0-smoothstep(1.4,timing.z,t));
                if(timing.y>.001) fade*=exp(-max(0.0,t-.7)*1.5);
                fade*=.75+.25*fireworkTwinkle(t,detail.y);
              } else {
                vec3 drift=velocity*vec3(.12,.06,.08)+vec3(sin(detail.y)*.8,-2.0,cos(detail.y)*.45);
                p+=velocity+drift*t;
                p.y-=1.4*t*t;
                tangent=drift-vec3(0.0,2.8*t,0.0);
                fade=smoothstep(0.0,.45,t)*(1.0-smoothstep(timing.z*.4,timing.z,t));
                fade*=.48+.52*fireworkTwinkle(t,detail.y);
              }
              sparkle=fireworkTwinkle(t,detail.y)*.22;
            } else if (timing.w > 5.5) {`);
  }
}

// A seeded phase also changes each spark's tempo, so a blossom shimmers instead of flashing as one.
const TWINKLE_GLSL = `
float fireworkTwinkle(float age, float phase) {
  float rate = 8.0 + 2.4 * sin(phase * 3.7);
  float wave = 0.5 + 0.5 * sin(age * rate + phase);
  return pow(wave, 6.0);
}
float fireworkSparkFade(float age, float life, float phase) {
  float envelope = step(0.0, age) * (1.0 - smoothstep(life * 0.38, life, age));
  float linger = smoothstep(life * 0.45, life * 0.8, age) * 0.36;
  envelope = mix(envelope, sqrt(envelope), linger);
  float shimmer = 0.42 + 0.58 * fireworkTwinkle(max(0.0, age), phase);
  return envelope * mix(1.0, shimmer, smoothstep(0.04, 0.35, age));
}
float fireworkLetterShimmer(float age, float phase) {
  return 0.86 + 0.14 * fireworkTwinkle(age, phase);
}
`;

type Show = { event: FireworkEvent; object: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  reflection?: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> };
export class BeachFireworks {
  private shows = new Map<string, Show>();
  private seen = new Set<string>();
  private clockOffset = 0;
  private lastServerTime = -Infinity;
  private texture: THREE.Texture | null = null;
  private textureRequested = false;
  private textureReady = false;
  private disposed = false;
  private scene: THREE.Scene;
  private options: { mobile: boolean; grand?: boolean; reflectWater?: boolean };
  private cameraRight = new THREE.Vector3(1, 0, 0);
  private cameraUp = new THREE.Vector3(0, 1, 0);
  private cameraForward = new THREE.Vector3(0, 0, -1);
  private cameraPosition = new THREE.Vector3();
  private textCenter = new THREE.Vector3(...FIREWORK_TEXT_CENTER);
  private textFromCamera = new THREE.Vector3();
  constructor(scene: THREE.Scene, options: { mobile: boolean; grand?: boolean; reflectWater?: boolean } = { mobile: false }) {
    this.scene = scene; this.options = options;
  }

  apply(events: readonly FireworkEvent[], serverTime: number) {
    if (this.disposed || !Number.isFinite(serverTime) || serverTime < this.lastServerTime) return;
    const now = Date.now(), incomingOffset = serverTime - now;
    if (this.lastServerTime === -Infinity) this.clockOffset = incomingOffset;
    else if (serverTime > this.lastServerTime) this.clockOffset = Math.max(this.clockOffset, incomingOffset);
    this.lastServerTime = serverTime;
    this.update(undefined, now);
    const currentServerTime = now + this.clockOffset;
    for (const event of events.slice(0, 2)) {
      if (!event || !Number.isSafeInteger(event.seed) || event.seed < 0 || typeof event.id !== "string" || !event.id
        || !Number.isFinite(event.startedAt) || event.durationMs !== 12000 || this.seen.has(event.id)
        || (event.variant !== undefined && !["festival", "songi", "love", "bloom", "saturn", "willow", "stardust"].includes(event.variant))
        || currentServerTime < event.startedAt || currentServerTime >= event.startedAt + event.durationMs || this.shows.size >= 2) continue;
      this.seen.add(event.id);
      if (this.seen.size > 64) this.seen.delete(this.seen.values().next().value!);
      if (!this.textureRequested && typeof document !== "undefined") {
        this.textureRequested = true;
        assetLoader(new THREE.TextureLoader()).load(assetUrl(FIREWORK_SPARK_URL), texture => {
          if (this.disposed) { texture.dispose(); return; }
          texture.colorSpace = THREE.SRGBColorSpace;
          this.texture = texture; this.textureReady = true;
        }, undefined, () => { /* Soft shader particles remain visible if the optional image fails. */ });
      }
      const material = new THREE.ShaderMaterial({
        uniforms: { uAge: { value: 0 }, uViewport: { value: 700 }, uSpark: { value: this.texture }, uImage: { value: this.textureReady ? 1 : 0 },
          uTextRight: { value: this.cameraRight.clone() }, uTextUp: { value: this.cameraUp.clone() }, uTextScale: { value: 1 },
          uTextCenter: { value: this.textCenter.clone() }, uPointScale: { value: 1 },
          uGrand: { value: this.options.grand ? 1 : 0 }, uReflection: { value: 0 },
          uCameraPosition: { value: this.cameraPosition.clone() }, uTextWidth: { value: 0 } },
        vertexShader: `
          attribute vec3 velocity; attribute vec3 sparkColor; attribute vec4 timing; attribute vec3 detail;
          uniform float uAge; uniform float uViewport; uniform float uTextScale; uniform float uPointScale;
          uniform float uGrand; uniform float uReflection; uniform float uTextWidth;
          uniform vec3 uTextRight; uniform vec3 uTextUp; uniform vec3 uTextCenter;
          uniform vec3 uCameraPosition;
          varying vec3 vColor; varying float vAlpha; varying float vAngle; varying float vMode; varying float vProgress; varying float vTwinkle;
          varying float vTrailAspect; varying float vWater;
          ${TWINKLE_GLSL}
          void main() {
            float age = uAge - timing.x - timing.y;
            vec3 p = position;
            vec3 tangent = vec3(0.0);
            float fade = 0.0;
            float sparkle = 0.0;
            if (timing.w > 3.5 && timing.w < 4.5) {
              p = uTextCenter;
              float t = max(0.0, age), settle = smoothstep(0.0, 0.95, t);
              float disperse = smoothstep(4.5, timing.z, t);
              vec2 offset = velocity.xy * mix(0.12, 1.0, settle);
              offset += vec2(sin(detail.y), cos(detail.y)) * disperse * 1.25;
              offset.y -= disperse * disperse * 1.8;
              p += (uTextRight * offset.x + uTextUp * offset.y) * uTextScale;
              fade = smoothstep(0.08, 0.55, t) * (1.0 - smoothstep(4.55, timing.z, t));
              fade *= fireworkLetterShimmer(t, detail.y);
              sparkle = fireworkTwinkle(t, detail.y) * 0.28;
            } else if (timing.w > 5.5) {
              float t=max(0.0,age);
              float drag=timing.w<6.5?.33:(timing.w<7.5?.46:.27);
              float gravity=timing.w<6.5?1.28:(timing.w<7.5?.88:2.4);
              p+=velocity*(1.0-exp(-drag*t))/drag;
              p.y-=gravity*t*t;
              tangent=velocity*exp(-drag*t)-vec3(0.0,2.0*gravity*t,0.0);
              fade=step(0.0,age)*(1.0-smoothstep(timing.z*.42,timing.z,t));
              fade*=.78+.22*fireworkTwinkle(t,detail.y);
              sparkle=fireworkTwinkle(t,detail.y)*.18;
            } else if (timing.w > 0.5 && timing.w < 1.5) {
              float flight = age + timing.z;
              float t = clamp(flight / timing.z, 0.0, 1.0);
              p = mix(vec3(position.x * 0.6, 1.0, position.z + 15.0), position, t);
              p.x += sin(t * 8.0 + detail.y) * 0.08;
              fade = step(0.0, flight) * (1.0 - step(timing.z, flight));
            } else {
              float t = max(0.0, age), travel = (1.0 - exp(-0.45 * t)) / 0.45;
              p += velocity * travel;
              p.y -= (timing.w > 1.5 && timing.w < 2.5 ? 1.1 : 0.74) * t * t;
              fade = step(0.0, age) * (1.0 - smoothstep(timing.z * 0.38, timing.z, age));
              if (timing.w < 0.5 || (timing.w > 1.5 && timing.w < 2.5)) {
                fade = fireworkSparkFade(age, timing.z, detail.y);
                sparkle = fireworkTwinkle(t, detail.y) * smoothstep(0.02, 0.18, t);
              }
            }
            vColor = mix(sparkColor, vec3(1.0, 0.96, 0.88), sparkle * 0.22);
            vAlpha = fade * detail.z; vAngle = detail.y; vTwinkle = sparkle;
            vMode = timing.w; vProgress = clamp(age / timing.z, 0.0, 1.0);
            vTrailAspect=1.0; vWater=0.0;
            vec3 imagePoint=p;
            if(uReflection>.5) {
              // Reflect in world space, then intersect that viewing ray with the
              // actual water. Its correct depth lets opaque hotels occlude it.
              imagePoint.y=.016-p.y; tangent.y=-tangent.y;
              imagePoint.x+=sin(imagePoint.z*.38+uAge*1.4)*.11;
              float denominator=uCameraPosition.y-imagePoint.y;
              float along=(uCameraPosition.y-.018)/max(.001,denominator);
              p=mix(uCameraPosition,imagePoint,clamp(along,0.0,1.0)); p.y=.018;
              vAlpha*=.42*step(.03,uCameraPosition.y)*step(.001,denominator)*step(0.0,along)*step(along,1.0);
              vAlpha*=1.0-smoothstep(930.0,995.0,max(abs(p.x),abs(p.z)));
              vAlpha*=smoothstep(3.45,3.85,length(p.xz-vec2(7.0,7.0)));
              vWater=sin(p.z*46.0+uAge*1.8)*.5+.5;
            }
            vec4 view = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * view;
            vec4 imageView=modelViewMatrix*vec4(imagePoint,1.0);
            float worldSize = detail.x * (timing.w > 3.5 && timing.w < 4.5 ? uTextScale : 1.0) * (1.0 + sparkle * 0.14);
            float imageDepth=uReflection>.5?-imageView.z:-view.z;
            gl_PointSize = clamp(worldSize * projectionMatrix[1][1] * uViewport / max(1.0, imageDepth), 1.6 * uPointScale, 96.0 * uPointScale);
            if(timing.w>5.5) {
              vec4 nextClip=projectionMatrix*modelViewMatrix*vec4(imagePoint+tangent*detail.x,1.0);
              vec4 imageClip=projectionMatrix*imageView;
              vec2 delta=(nextClip.xy/max(.01,nextClip.w)-imageClip.xy/max(.01,imageClip.w))
                *vec2(projectionMatrix[1][1]/projectionMatrix[0][0],1.0)*uViewport*.5;
              vAngle=atan(delta.y,delta.x);
              float width=clamp(.18*projectionMatrix[1][1]*uViewport/max(1.0,imageDepth),2.1*uPointScale,2.7*uPointScale);
              gl_PointSize=clamp(length(delta)*1.7+width,3.0*uPointScale,38.0*uPointScale);
              vTrailAspect=clamp(width/gl_PointSize,.025,.65);
            }
            if(uGrand>.5 && uTextWidth>0.0 && (timing.w<3.5 || timing.w>4.5) && uReflection<.5) {
              vec4 textClip=projectionMatrix*modelViewMatrix*vec4(uTextCenter,1.0);
              vec4 textView=modelViewMatrix*vec4(uTextCenter,1.0);
              vec2 extent=vec2(uTextWidth*.55,6.8)*uTextScale*vec2(projectionMatrix[0][0],projectionMatrix[1][1])/max(1.0,-textView.z);
              vec2 relative=abs(gl_Position.xy/max(.01,gl_Position.w)-textClip.xy/max(.01,textClip.w));
              float reserve=(1.0-smoothstep(extent.x,extent.x*1.2,relative.x))*(1.0-smoothstep(extent.y,extent.y*1.2,relative.y));
              vAlpha*=1.0-reserve*.68*smoothstep(2.7,3.5,uAge)*(1.0-smoothstep(7.5,9.4,uAge));
            }
            if (vAlpha < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          }`,
        fragmentShader: `
          uniform sampler2D uSpark; uniform float uImage; uniform float uGrand; uniform float uReflection;
          varying vec3 vColor; varying float vAlpha; varying float vAngle; varying float vMode; varying float vProgress; varying float vTwinkle;
          varying float vTrailAspect; varying float vWater;
          float fireworkStrokeGlow(float along, float across, float aspect) {
            float squared=across/max(.012,aspect*.45); squared*=squared;
            return (exp(-squared*2.0)+.13*exp(-squared*.4))*(1.0-smoothstep(.32,.5,abs(along)));
          }
          void main() {
            vec2 p = gl_PointCoord - 0.5;
            float radius = length(p) * 2.0;
            float glow = exp(-radius * radius * 4.4) * (1.0 - smoothstep(0.65, 1.0, radius));
            if (vMode > 4.5 && vMode < 5.5) glow = exp(-pow((radius - mix(0.12, 0.82, vProgress)) * 13.0, 2.0)) * (1.0 - smoothstep(0.9, 1.0, radius));
            vec2 uv = mat2(cos(vAngle), -sin(vAngle), sin(vAngle), cos(vAngle)) * p + 0.5;
            vec2 starPoint = uv - 0.5;
            float starRays = exp(-min(abs(starPoint.x), abs(starPoint.y)) * 70.0)
              * pow(max(0.0, 1.0 - radius), 1.7);
            glow += starRays * vTwinkle * 0.35;
            vec4 sprite = texture2D(uSpark, clamp(uv, 0.0, 1.0));
            float imageGlow = sprite.a * dot(sprite.rgb, vec3(0.299,0.587,0.114));
            float useImage = (vMode > 3.5) ? 0.0 : uImage;
            float alpha = mix(glow, max(glow * 0.85, imageGlow * 1.45), useImage) * vAlpha;
            if(vMode>5.5) {
              // gl_PointCoord is top-down, while the projected tangent is bottom-up.
              vec2 screen=vec2(p.x,-p.y);
              vec2 stroke=vec2(cos(vAngle)*screen.x+sin(vAngle)*screen.y,-sin(vAngle)*screen.x+cos(vAngle)*screen.y);
              glow=fireworkStrokeGlow(stroke.x,stroke.y,vTrailAspect);
              alpha=glow*vAlpha;
            }
            if(uReflection>.5) alpha*=.62+.38*vWater;
            if (alpha < 0.003) discard;
            vec3 radiance=vColor*2.2+vec3(.55+vTwinkle*.9)*pow(glow,3.0);
            if(uGrand>.5) radiance=vColor*(vMode>5.5?1.85:1.65)+vColor*pow(glow,3.0)*.14;
            gl_FragColor = vec4(radiance, alpha);
            #include <colorspace_fragment>
          }`,
        transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false,
      });
      const object = new THREE.Points(fireworkGeometry(event.seed, this.options.mobile, event.variant ?? "festival", this.options.grand), material);
      if(this.options.grand && (event.variant==="songi" || event.variant==="love")) personalMaterial(material,event.variant);
      material.uniforms.uTextWidth.value=object.geometry.userData.textWidth;
      object.name = "beach-fireworks-" + event.id;
      object.frustumCulled = false; object.renderOrder = 6; object.layers.enable(1);
      this.scene.add(object);
      let reflection:Show["reflection"];
      if(this.options.reflectWater) {
        // Share the time, glyph orientation and texture uniforms without cloning a texture.
        const reflectedMaterial=new THREE.ShaderMaterial({
          uniforms:{...material.uniforms,uReflection:{value:1}},vertexShader:material.vertexShader,fragmentShader:material.fragmentShader,
          transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,toneMapped:false,
        });
        reflection=new THREE.Points(object.geometry,reflectedMaterial);
        reflection.name="uyuni-fireworks-reflection-"+event.id;
        reflection.frustumCulled=false; reflection.renderOrder=5;
        this.scene.add(reflection);
      }
      this.shows.set(event.id, { event: { ...event }, object, reflection });
    }
  }

  update(camera?: THREE.Camera, now = Date.now(), drawingBufferHeight?: number) {
    if (this.disposed || !Number.isFinite(now)) return;
    const cssHeight = typeof window === "undefined" ? 900 : Math.max(1, window.innerHeight);
    const viewportHeight = typeof drawingBufferHeight === "number" && Number.isFinite(drawingBufferHeight) && drawingBufferHeight > 0
      ? drawingBufferHeight : Math.min(1400, cssHeight);
    if (camera) {
      camera.updateWorldMatrix(true, false);
      this.cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
      this.cameraUp.setFromMatrixColumn(camera.matrixWorld, 1);
      this.cameraForward.setFromMatrixColumn(camera.matrixWorld, 2).negate();
      const center = camera.layers.mask === 2 ? FIREWORK_SKY_TEXT_CENTER : FIREWORK_TEXT_CENTER;
      this.textCenter.set(center[0], center[1], center[2]);
      this.cameraPosition.setFromMatrixPosition(camera.matrixWorld);
      this.textFromCamera.copy(this.textCenter).sub(this.cameraPosition);
    }
    const serverNow = now + this.clockOffset;
    for (const [id, show] of this.shows) {
      const age = (serverNow - show.event.startedAt) / 1000;
      if (age >= show.event.durationMs / 1000) { this.remove(show); this.shows.delete(id); continue; }
      show.object.material.uniforms.uAge.value = Math.max(0, age);
      show.object.material.uniforms.uViewport.value = viewportHeight;
      show.object.material.uniforms.uPointScale.value = viewportHeight / cssHeight;
      show.object.material.uniforms.uSpark.value = this.texture;
      show.object.material.uniforms.uImage.value = this.textureReady ? 1 : 0;
      if(show.reflection) show.reflection.visible=Boolean(camera && camera.layers.mask!==2 && this.cameraPosition.y>.03);
      if (camera) {
        if(this.options.grand && show.event.variant==="songi") {
          const anchor=camera.layers.mask===2?FIREWORK_SKY_TEXT_CENTER:PERSONAL_TEXT_CENTER;
          this.textCenter.set(anchor[0],anchor[1],anchor[2]);
          this.textFromCamera.copy(this.textCenter).sub(this.cameraPosition);
        } else {
          const anchor=camera.layers.mask===2?FIREWORK_SKY_TEXT_CENTER:FIREWORK_TEXT_CENTER;
          this.textCenter.set(anchor[0],anchor[1],anchor[2]);
          this.textFromCamera.copy(this.textCenter).sub(this.cameraPosition);
        }
        show.object.material.uniforms.uCameraPosition.value.copy(this.cameraPosition);
        show.object.material.uniforms.uTextRight.value.copy(this.cameraRight);
        show.object.material.uniforms.uTextUp.value.copy(this.cameraUp);
        show.object.material.uniforms.uTextCenter.value.copy(this.textCenter);
        const depth = Math.max(1, this.textFromCamera.dot(this.cameraForward));
        const halfFrame = depth / Math.max(0.01, Math.abs(camera.projectionMatrix.elements[0]));
        const centerOffset = Math.abs(this.textFromCamera.dot(this.cameraRight));
        const availableWidth = Math.max(0, 2 * (halfFrame * 0.84 - centerOffset));
        const width = show.object.geometry.userData.textWidth;
        show.object.material.uniforms.uTextScale.value = width ? Math.min(1, Math.max(0.15, availableWidth / width)) : 1;
      }
    }
  }

  private remove(show: Show) {
    show.reflection?.removeFromParent(); show.reflection?.material.dispose();
    show.object.removeFromParent(); show.object.geometry.dispose(); show.object.material.dispose();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const show of this.shows.values()) this.remove(show);
    this.shows.clear(); this.seen.clear(); this.texture?.dispose(); this.texture = null;
  }
}
