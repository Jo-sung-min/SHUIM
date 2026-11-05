import * as THREE from "three";

export type FestivalVariant = "bloom" | "saturn" | "willow" | "stardust";
type Vector = readonly [number, number, number];
type Shell = readonly [number, number, number, number];

const COLORS = [0xffb42e, 0xff3f75, 0x26d5ff, 0x8350ff, 0x31e8a1, 0xff7134];
const GOLD = [0xffbd48, 0xffa42e, 0xffd578, 0xf29136];
const TAU = Math.PI * 2;
const END = 11.92;

/** These shows share the existing shader and water reflection, but never alter the approved festival. */
export function festivalVariantGeometry(seed: number, mobile: boolean, variant: FestivalVariant): THREE.BufferGeometry {
  if (!["bloom", "saturn", "willow", "stardust"].includes(variant)) throw new RangeError("Unknown festival variant");
  let state = seed >>> 0;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const seedColor = (seed >>> 0) % COLORS.length;
  const position: number[] = [], velocity: number[] = [], sparkColor: number[] = [], timing: number[] = [], detail: number[] = [];
  const tint = new THREE.Color();

  function add(center: readonly number[], direction: Vector, start: number, delay: number, life: number,
    mode: number, hue: number, size: number, alpha: number, phase: number) {
    position.push(center[0], center[1], center[2]);
    velocity.push(...direction);
    tint.setHex(hue); sparkColor.push(tint.r, tint.g, tint.b);
    timing.push(start, delay, Math.min(life, END - start - delay), mode);
    detail.push(size, phase, alpha);
  }

  function trail(center: readonly number[], direction: Vector, start: number, life: number,
    mode: 6 | 7, hue: number, samples: number, span: number, alpha = .82) {
    const phase = random() * TAU, step = span / (samples - 1);
    for (let tail = 0; tail < samples; tail++) {
      add(center, direction, start, tail * step, life, mode, hue, step,
        alpha * (1 - .64 * tail / samples), phase);
    }
  }

  function launch(center: readonly number[], start: number) {
    for (let i = 0; i < 32; i++) add(center, [0, 0, 0], start, i * .011, 1.15, 1,
      0xffc478, i ? .20 : .58, 1 - i / 36, random() * TAU);
    add(center, [0, 0, 0], start, 0, .22, 3, 0xffcd8c, 3.8, .32, random() * TAU);
  }

  function sphere(ray: number, rays: number, phase = 0): Vector {
    const y = 1 - 2 * (ray + .5) / rays;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = ray * 2.399963 + phase;
    return [radius * Math.cos(angle), y, radius * Math.sin(angle)];
  }

  if (variant === "bloom") {
    const shells: readonly Shell[] = [
      [-50, 52, -210, 1.25], [0, 72, -232, 1.25], [50, 52, -210, 1.25],
      [-52, 60, -220, 3.5], [0, 85, -245, 3.5], [52, 60, -220, 3.5],
      [-65, 52, -210, 6.65], [-23, 78, -235, 6.65], [23, 78, -235, 6.65], [65, 52, -210, 6.65],
    ];
    const rays = mobile ? 64 : 112, tails = mobile ? 18 : 24;
    for (let shell = 0; shell < shells.length; shell++) {
      const center = shells[shell], turn = random() * TAU;
      for (let layer = 0; layer < 3; layer++) {
        const speed = [10, 18, 27][layer], start = center[3] + layer * .12;
        const hue = COLORS[(seedColor + shell + layer * 2) % COLORS.length];
        for (let ray = 0; ray < rays; ray++) {
          const direction = sphere(ray, rays, turn + layer * .6);
          // Three complete shells remain concentric; gentle lobes soften the outer flower.
          const ripple = .95 + .05 * Math.cos(ray * 2.399963 * 5 + turn);
          trail(center, [direction[0] * speed * ripple, direction[1] * speed * ripple, direction[2] * speed * .66],
            start, 3.8, 7, hue, tails, [.42, .58, .72][layer], layer === 0 ? .68 : .8);
        }
      }
      launch(center, center[3]);
    }
  } else if (variant === "saturn") {
    const shells: readonly Shell[] = [
      [-48, 57, -215, 1.3], [0, 75, -238, 1.3], [48, 57, -215, 1.3],
      [-56, 63, -220, 3.75], [0, 87, -245, 3.75], [56, 63, -220, 3.75],
      [-52, 57, -215, 6.9], [0, 82, -242, 6.9], [52, 57, -215, 6.9],
    ];
    const coreRays = mobile ? 56 : 96, ringRays = mobile ? 144 : 216, tails = mobile ? 10 : 16;
    for (let shell = 0; shell < shells.length; shell++) {
      const center = shells[shell], turn = random() * .2;
      for (let ray = 0; ray < coreRays; ray++) {
        const d = sphere(ray, coreRays, turn);
        trail(center, [d[0] * 9, d[1] * 9, d[2] * 7], center[3], 3.9, 7,
          COLORS[(seedColor + shell + 1) % COLORS.length], tails, .42, .72);
      }
      for (let ring = 0; ring < 2; ring++) {
        const tilt = (shell % 2 ? -.42 : .42) + ring * .12;
        const orbitRadius = ring === 0 ? 22 : 30;
        for (let ray = 0; ray < ringRays; ray++) {
          const angle = ray / ringRays * TAU + turn;
          // Independent embers preserve the orbit plane without filling it as a smooth neon ribbon.
          const radius = orbitRadius * (.86 + random() * .28);
          const onset = random() * .15, life = 2.8 + random() * 1.1, alpha = .25 + random() * .4;
          const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius * .32;
          const direction: Vector = [x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt), Math.sin(angle) * radius * .93];
          trail(center, direction, center[3] + ring * .08 + onset, life, 7,
            COLORS[(seedColor + shell + ring * 3) % COLORS.length], tails, .5, alpha);
        }
      }
      launch(center, center[3]);
    }
  } else if (variant === "willow") {
    const shells: readonly Shell[] = [
      [-64, 60, -215, 1.2], [-22, 80, -237, 1.35], [22, 80, -237, 1.5], [64, 60, -215, 1.65],
      [-64, 65, -220, 3.8], [-22, 90, -245, 3.95], [22, 90, -245, 4.1], [64, 65, -220, 4.25],
      [-64, 60, -215, 6.4], [-22, 84, -238, 6.55], [22, 84, -238, 6.7], [64, 60, -215, 6.85],
    ];
    const rays = mobile ? 96 : 160, tails = mobile ? 26 : 40;
    for (let shell = 0; shell < shells.length; shell++) {
      const center = shells[shell], turn = random() * TAU;
      for (let ray = 0; ray < rays; ray++) {
        const d = sphere(ray, rays, turn), speed = 19 + random() * 5;
        // Slow-drag mode 6 carries a broad crown before gravity turns it into hanging gold rain.
        trail(center, [d[0] * speed, d[1] * 13 + 4, d[2] * speed * .64], center[3], 5.5, 6,
          GOLD[(ray + shell + seedColor) % GOLD.length], tails, 1.18, .76);
      }
      launch(center, center[3]);
    }
  } else {
    const shells: readonly Shell[] = [
      [-40, 63, -220, 1.15], [40, 63, -220, 1.35],
      [-60, 57, -215, 3.65], [0, 83, -245, 3.85], [60, 57, -215, 4.05],
      [-57, 61, -220, 6.35], [0, 84, -245, 6.55], [57, 61, -220, 6.75],
    ];
    const branches = 12, parentTails = mobile ? 18 : 24, rays = mobile ? 30 : 56, tails = mobile ? 10 : 16;
    for (let shell = 0; shell < shells.length; shell++) {
      const center = shells[shell], turn = random() * TAU;
      for (let branch = 0; branch < branches; branch++) {
        const d = sphere(branch, branches, turn), speed = 18 + random() * 5;
        const flight: Vector = [d[0] * speed, d[1] * speed * .8, d[2] * speed * .55];
        const delay = 1.12 + random() * .34, travel = (1 - Math.exp(-.46 * delay)) / .46;
        const child: Vector = [center[0] + flight[0] * travel, center[1] + flight[1] * travel - .88 * delay * delay, center[2] + flight[2] * travel];
        trail(center, flight, center[3], delay + .18, 7, 0xffc366, parentTails, .42, .6);
        for (let ray = 0; ray < rays; ray++) {
          const star = sphere(ray, rays, branch * .7 + turn), spread = 6.8 + random() * 3.8;
          // A child's center is the parent's exact existing-shader trajectory at its second detonation.
          trail(child, [star[0] * spread, star[1] * spread, star[2] * spread * .7], center[3] + delay,
            3.1, 7, COLORS[(seedColor + branch + shell) % COLORS.length], tails, .36, .76);
        }
        add(child, [0, 0, 0], center[3] + delay, 0, .18, 3, COLORS[(seedColor + branch + shell) % COLORS.length], 1.8, .25, random() * TAU);
      }
      launch(center, center[3]);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("velocity", new THREE.Float32BufferAttribute(velocity, 3));
  geometry.setAttribute("sparkColor", new THREE.Float32BufferAttribute(sparkColor, 3));
  geometry.setAttribute("timing", new THREE.Float32BufferAttribute(timing, 4));
  geometry.setAttribute("detail", new THREE.Float32BufferAttribute(detail, 3));
  Object.assign(geometry.userData, { variant, phrase: "", textWidth: 0, grand: true });
  return geometry;
}
