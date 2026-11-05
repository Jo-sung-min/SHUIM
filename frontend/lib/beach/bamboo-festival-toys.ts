import * as THREE from "three";

export type BambooFestivalToy = "balloon" | "fan" | "propeller";
export interface BambooPropellerLaunch {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  startedAt: number;
  durationMs?: number;
}
const CAPACITY = 100;
export const BAMBOO_PROPELLER_LIFETIME_MS = 6000;
const TAU = Math.PI * 2;
const ease = THREE.MathUtils.smoothstep;
type Point = readonly [number, number, number];
type Glow = { point: Point; radius: number; tint: number; phase: number; aura?: boolean };
type Batch = THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>;
const bulbPalette = [0xffbe80, 0xff9ac4, 0x9ee8ff, 0xc8a7ff, 0xa5ffdd];

function idPhase(id: string) {
  let bits = 2166136261;
  for (let i = 0; i < id.length; i++) bits = Math.imul(bits ^ id.charCodeAt(i), 16777619);
  return (bits >>> 0) / 4294967296 * TAU;
}

/** Shared, unlit geometry for the fine wire, bamboo grips and colored rotor blades. */
class Parts {
  private positions: number[] = [];
  private colors: number[] = [];
  private pattern: number[] = [];
  private color = new THREE.Color();
  triangle(a: Point, b: Point, c: Point, tint: number, paper = 0) {
    this.color.setHex(tint);
    for (const p of [a, b, c]) {
      this.positions.push(...p);
      this.colors.push(this.color.r, this.color.g, this.color.b);
      this.pattern.push(paper);
    }
  }
  tube(a: Point, b: Point, radius: number, tint: number, sides = 5) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const dir = end.clone().sub(start).normalize(), axis = new THREE.Vector3(0, 1, 0);
    if (Math.abs(dir.y) > .9) axis.set(1, 0, 0);
    const right = axis.cross(dir).normalize().multiplyScalar(radius);
    const up = new THREE.Vector3().crossVectors(dir, right);
    const edge = (p: THREE.Vector3, i: number): Point => {
      const angle = i / sides * TAU;
      return p.clone().addScaledVector(right, Math.cos(angle)).addScaledVector(up, Math.sin(angle)).toArray();
    };
    for (let i = 0; i < sides; i++) {
      const p = edge(start, i), q = edge(end, i), r = edge(end, i + 1), s = edge(start, i + 1);
      this.triangle(p, q, r, tint); this.triangle(p, r, s, tint);
    }
  }
  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute("paper", new THREE.Float32BufferAttribute(this.pattern, 1));
    return geometry;
  }
}

const balloonCenter = new THREE.Vector3(.23, 1.74, -.08);
const balloonRadius = new THREE.Vector3(.25, .275, .25);
const neckY = balloonCenter.y - balloonRadius.y;

/** All balloon parts follow the same wind. The string bends from the palm and the globe moves as one piece. */
const balloonWind = `
  uniform float clock;
  attribute float toyPhase;
  vec3 balloonPosition(vec3 p) {
    float follow = smoothstep(0., ${neckY.toFixed(3)}, p.y);
    return p + follow * vec3(.09 * sin(clock * .86 + toyPhase), .018 * sin(clock * 1.3 + toyPhase), .055 * cos(clock * .70 + toyPhase));
  }`;

// The held first-person model occupies a shallow slice of the depth buffer. It
// remains intact against the rail or guestbook, while all other actors use real depth.
const handDepth = `
  attribute float firstPersonToy;
  void projectHand(inout vec4 clip) {
    if (firstPersonToy > .5) clip.z = -.999 * clip.w + .0004 * clip.z;
  }`;
function balloonDecoration() {
  const parts = new Parts(), beads: Glow[] = [];
  let previous: Point = [0, 0, 0];
  // A slight natural bow connects the grip continuously to the tied neck.
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    const point: Point = [balloonCenter.x * t + .22 * Math.sin(t * Math.PI), t * neckY, balloonCenter.z * t + .045 * Math.sin(t * TAU)];
    parts.tube(previous, point, .0045, 0xe0c7a3, 4);
    if (i % 2 === 0) beads.push({ point, radius: .022, tint: bulbPalette[i % 5], phase: i * 1.89 });
    previous = point;
  }
  parts.tube([balloonCenter.x, neckY - .012, balloonCenter.z], [balloonCenter.x, neckY + .014, balloonCenter.z], .017, 0xf1b88d, 7);
  beads.push({ point: balloonCenter.toArray(), radius: .41, tint: 0xffffff, phase: 0, aura: true });
  // LEDs follow a real three-dimensional wire wound around the clear bubble.
  for (let i = 0; i <= 44; i++) {
    const h = -.94 + i / 44 * 1.88, radius = Math.sqrt(1 - h * h), angle = i / 44 * TAU * 2.35;
    const point: Point = [balloonCenter.x + balloonRadius.x * radius * Math.cos(angle),
      balloonCenter.y + balloonRadius.y * h, balloonCenter.z + balloonRadius.z * radius * Math.sin(angle)];
    if (i) parts.tube(previous, point, .0015, 0xba9c8e, 3);
    if (i % 2 === 0) beads.push({ point, radius: .036, tint: bulbPalette[(i / 2) % 5], phase: i * 2.43 });
    previous = point;
  }
  return { wire: parts.geometry(), beads };
}

function fanGeometry() {
  const parts = new Parts(), center: Point = [0, .50, 0];
  const rim = (i: number): Point => {
    const t = TAU * i / 48;
    return [.193 * Math.cos(t) * (1 + .08 * Math.sin(t)), center[1] + .20 * Math.sin(t), 0];
  };
  for (let i = 0; i < 48; i++) {
    const a = rim(i), b = rim(i + 1);
    parts.triangle(center, a, b, 0xffffff, 1); parts.tube(a, b, .0035, 0xd4a463, 4);
    const lightA: Point = [a[0] * 1.11, center[1] + (a[1] - center[1]) * 1.11, 0];
    const lightB: Point = [b[0] * 1.11, center[1] + (b[1] - center[1]) * 1.11, 0];
    parts.triangle(a, lightA, lightB, 0xffce81, 2); parts.triangle(a, lightB, b, 0xffce81, 2);
  }
  parts.tube([0, -.038, 0], [0, .355, 0], .013, 0xc99b64, 8);
  parts.tube([0, .048, 0], [0, .074, 0], .014, 0x7e5537, 8);
  return parts.geometry();
}
function fanMaterial(clock: THREE.IUniform<number>) {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    toneMapped: false,
    transparent: true,
    depthWrite: false,
    forceSinglePass: true,
    uniforms: { clock },
    vertexShader: `
      ${handDepth}
      attribute float paper;
      varying vec2 local;
      varying vec3 tint;
      varying float face;
      void main() {
        local = vec2(position.x / .193, (position.y - .50) / .20);
        face = paper;
        tint = color;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.);
        projectHand(gl_Position);
      }`,
    fragmentShader: `
      uniform float clock;
      varying vec2 local;
      varying vec3 tint;
      varying float face;

      void main() {
        vec3 result = tint;
        float alpha = 1.;
        float rimRadius = length(vec2(local.x / (1. + .08 * local.y), local.y));
        if (face > 1.5) {
          alpha = .38 * (1. - smoothstep(1., 1.11, rimRadius));
          result = vec3(1., .63, .24);
        } else if (face > .5) {
          // Two opposing semicircles form the painted taegeuk on the fan paper.
          vec2 q = mat2(.966, -.259, .259, .966) * local / .77;
          float aa = max(.007, fwidth(q.x) + fwidth(q.y));
          float red = smoothstep(-aa, aa, q.y);
          red = max(red, 1. - smoothstep(.5 - aa, .5 + aa, length(q - vec2(-.5, 0.))));
          red *= smoothstep(.5 - aa, .5 + aa, length(q - vec2(.5, 0.)));
          vec3 ink = mix(vec3(.025, .16, .63), vec3(.88, .036, .095), red);
          float rib = .95 + .05 * cos(atan(local.x, local.y + 1.08) * 32.);
          result = mix(ink, vec3(.97, .77, .48), smoothstep(1. - aa, 1. + aa, length(q))) * rib;

          float distanceToRim = (rimRadius - .962) * 58.;
          float bead = pow(max(0., cos(atan(local.y, local.x) * 16.)), 7.) * exp(-distanceToRim * distanceToRim);
          result += vec3(1., .69, .32) * bead * (.35 + .22 * sin(2.4 * clock + 11. * local.x));
        }
        if (alpha < .004) discard;
        gl_FragColor = vec4(result, alpha);
        #include <colorspace_fragment>
      }`,
  });
}

function rotorGeometry() {
  const parts = new Parts(), beads: Glow[] = [];
  parts.tube([0, -.035, 0], [0, .18, 0], .008, 0x9dafbc, 6);
  parts.tube([0, .15, 0], [0, .184, 0], .023, 0xeec275, 8);
  for (let i = 0; i < 3; i++) {
    const angle = TAU * i / 3;
    const point = (r: number, offset: number, y: number): Point =>
      [r * Math.cos(angle) - offset * Math.sin(angle), y, r * Math.sin(angle) + offset * Math.cos(angle)];
    const a = point(.012, -.012, .158), b = point(.105, -.017, .168), c = point(.2, .013, .181);
    const d = point(.189, .044, .185), e = point(.085, .028, .180), f = point(.012, .012, .173);
    const tint = [0x80f3e0, 0xfda5cb, 0xa39cff][i];
    parts.triangle(a, b, e, tint); parts.triangle(a, e, f, tint);
    parts.triangle(b, c, d, tint); parts.triangle(b, d, e, tint);
    parts.tube(b, c, .003, 0xf6e8eb, 3);
    beads.push({ point: c, radius: .040, tint, phase: i * 2.1 }, { point: b, radius: .025, tint, phase: i + 1 });
  }
  beads.push({ point: [0, .186, 0], radius: .058, tint: 0xffe3a0, phase: .7 });
  return { blades: parts.geometry(), beads };
}

function bubbleMaterial(clock: THREE.IUniform<number>) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { clock },
    vertexShader: `
      ${handDepth}
      ${balloonWind}
      varying vec3 globeColor;
      varying vec3 surfaceNormal;
      varying vec3 viewDirection;
      void main() {
        globeColor = instanceColor;
        vec4 eye = modelViewMatrix * instanceMatrix * vec4(balloonPosition(position), 1.);
        surfaceNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        viewDirection = -eye.xyz;
        gl_Position = projectionMatrix * eye;
        projectHand(gl_Position);
      }`,
    fragmentShader: `
      varying vec3 globeColor;
      varying vec3 surfaceNormal;
      varying vec3 viewDirection;
      void main() {
        vec3 n = normalize(surfaceNormal);
        float edge = pow(1. - abs(dot(n, normalize(viewDirection))), 2.);
        float reflection = pow(max(0., dot(n, normalize(vec3(-.48, .67, .56)))), 65.);
        vec3 pearl = mix(globeColor, vec3(1.), .12 * edge + .67 * reflection);
        gl_FragColor = vec4(pearl, .32 + .46 * edge + .18 * reflection);
        #include <colorspace_fragment>
      }`,
  });
}

/** The billboards share one instanced draw and face the viewer as the toy turns. */
function beadBatch(beads: Glow[], count: number, clock: THREE.IUniform<number>, balloon = false) {
  const positions: number[] = [], corners: number[] = [], lights: number[] = [], tints: number[] = [];
  const color = new THREE.Color();
  const quad = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];

  for (const bead of beads) {
    color.setHex(bead.tint);
    for (const [x, y] of quad) {
      positions.push(...bead.point);
      corners.push(x, y);
      lights.push(bead.radius, bead.phase, bead.aura ? 1 : 0);
      tints.push(color.r, color.g, color.b);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("corners", new THREE.Float32BufferAttribute(corners, 2));
  geometry.setAttribute("led", new THREE.Float32BufferAttribute(lights, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(tints, 3));

  const material = new THREE.ShaderMaterial({
    vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { clock },
    vertexShader: `
      ${handDepth}
      ${balloon ? balloonWind : "attribute float toyPhase; uniform float clock;"}
      attribute vec2 corners;
      attribute vec3 led;
      varying vec2 uvGlow;
      varying vec3 lamp;
      varying float pulse, aura;
      void main() {
        vec4 eye = modelViewMatrix * instanceMatrix * vec4(${balloon ? "balloonPosition(position)" : "position"}, 1.);
        float seed = led.y + toyPhase;
        pulse = .43 + .57 * pow(.5 + .5 * sin(clock * (1.7 + .6 * sin(seed)) + seed), 2.);
        eye.xy += corners * led.x * length(instanceMatrix[0].xyz) * (.86 + .14 * pulse);
        uvGlow = corners;
        aura = led.z;
        lamp = ${balloon ? "mix(instanceColor, color, .12 * (1. - aura))" : "color"};
        gl_Position = projectionMatrix * eye;
        projectHand(gl_Position);
      }`,
    fragmentShader: `
      varying vec2 uvGlow;
      varying vec3 lamp;
      varying float pulse, aura;
      void main() {
        float radiusSquared = dot(uvGlow, uvGlow);
        if (radiusSquared > 1.) discard;
        float core = exp(-22. * radiusSquared);
        float halo = exp(-4.75 * radiusSquared) * (1. - smoothstep(.5, 1., radiusSquared));
        if (aura > .5) {
          float haze = exp(-2.4 * radiusSquared) * (1. - smoothstep(.38, 1., radiusSquared));
          gl_FragColor = vec4(lamp, (.55 + .08 * pulse) * haze);
        } else {
          gl_FragColor = vec4(mix(lamp, vec3(1., .98, .90), core * .62), pulse * (core + .58 * halo));
        }
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.InstancedMesh(geometry, material, count);
}

type Flight = BambooPropellerLaunch & { phase: number };
export class BambooFestivalToys {
  private readonly root = new THREE.Group();
  private readonly clock = { value: 0 };
  private readonly parts: Record<BambooFestivalToy, Batch[]>;
  private readonly batches: Batch[];
  private readonly transform = new THREE.Object3D();
  private readonly localRotation = new THREE.Quaternion();
  private readonly globeTint = new THREE.Color();
  private readonly angles = new THREE.Euler();
  private readonly flights = new Map<string, Flight>();
  private readonly floorHeight?: (x: number, z: number) => number;
  private latestServerNow = -Infinity;
  private disposed = false;

  constructor(scene: THREE.Scene, floorHeight?: (x: number, z: number) => number) {
    this.floorHeight = floorHeight;
    const solid = (balloon: boolean) => {
      const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
      material.onBeforeCompile = shader => {
        shader.uniforms.clock = this.clock;
        shader.vertexShader = handDepth + (balloon ? balloonWind : "") + "\n" + shader.vertexShader
          .replace("#include <begin_vertex>", balloon ? "vec3 transformed = balloonPosition(position);" : "#include <begin_vertex>")
          .replace("#include <project_vertex>", "#include <project_vertex>\nprojectHand(gl_Position);");
      };
      material.customProgramCacheKey = () => balloon ? "festival-tether" : "festival-rotor";
      return material;
    };
    const balloon = balloonDecoration();
    const rotor = rotorGeometry();
    const shell = new THREE.SphereGeometry(1, 20, 14);
    shell.scale(balloonRadius.x, balloonRadius.y, balloonRadius.z);
    shell.translate(...balloonCenter.toArray());

    const wire = new THREE.InstancedMesh(balloon.wire, solid(true), CAPACITY);
    const film = new THREE.InstancedMesh(shell, bubbleMaterial(this.clock), CAPACITY);
    const balloonLeds = beadBatch(balloon.beads, CAPACITY, this.clock, true);
    for (const colored of [film, balloonLeds]) {
      colored.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(THREE.DynamicDrawUsage);
    }
    const fan = new THREE.InstancedMesh(fanGeometry(), fanMaterial(this.clock), CAPACITY);
    const blades = new THREE.InstancedMesh(rotor.blades, solid(false), CAPACITY * 2);
    const rotorLeds = beadBatch(rotor.beads, CAPACITY * 2, this.clock);

    this.parts = { balloon: [wire, film, balloonLeds], fan: [fan], propeller: [blades, rotorLeds] };
    this.batches = [...this.parts.balloon, ...this.parts.fan, ...this.parts.propeller];
    const names = ["balloon-thread", "balloon-film", "balloon-leds", "taegeuk-fan", "propeller", "propeller-leds"];
    this.root.name = "bamboo-festival-toys";
    this.batches.forEach((batch, index) => {
      batch.name = "festival-" + names[index];
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (const name of ["toyPhase", "firstPersonToy"]) {
        batch.geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(batch.instanceMatrix.count), 1).setUsage(THREE.DynamicDrawUsage));
      }
      batch.count = 0;
      batch.visible = false;
      batch.frustumCulled = false;
      if (batch.material.transparent) batch.renderOrder = batch === film ? 4 : 5;
      this.root.add(batch);
    });
    scene.add(this.root);
  }

  beginFrame(timeSeconds: number) {
    if (Number.isFinite(timeSeconds)) this.clock.value = timeSeconds;
    for (const batch of this.batches) batch.count = 0;
  }

  private writeToy(kind: BambooFestivalToy, phase: number, firstPerson = false) {
    this.transform.updateMatrix();
    for (const batch of this.parts[kind]) {
      const index = batch.count;
      if (index >= batch.instanceMatrix.count) continue;
      batch.setMatrixAt(index, this.transform.matrix);
      batch.geometry.getAttribute("toyPhase").setX(index, phase);
      batch.geometry.getAttribute("firstPersonToy").setX(index, Number(firstPerson));
      if (batch.instanceColor) batch.setColorAt(index, this.globeTint);
      batch.count++;
    }
  }

  hold(
    kind: BambooFestivalToy, gripWorld: THREE.Vector3, yaw: number, actorId: string,
    firstPersonCamera?: THREE.PerspectiveCamera, balloonHue?: number,
  ) {
    if (this.disposed || !actorId || !Object.hasOwn(this.parts, kind)) return;
    const phase = idPhase(actorId);
    const time = this.clock.value;
    const pose = this.transform;
    pose.scale.setScalar(1);

    if (firstPersonCamera) {
      // Frame the visible globe or fan paper, rather than framing the hand and letting
      // the object extend past the phone's right edge or into the bottom controls.
      const depth = .58;
      const halfHeight = Math.tan(THREE.MathUtils.degToRad(firstPersonCamera.getEffectiveFOV()) * .5) * depth;
      const halfWidth = halfHeight * firstPersonCamera.aspect;
      if (kind === "balloon") {
        const scale = Math.min(halfHeight * .96 / balloonCenter.y, halfWidth * .32 / .41);
        pose.scale.setScalar(scale);
        pose.position.set(halfWidth * .46 - balloonCenter.x * scale, halfHeight * .33 - balloonCenter.y * scale, -depth - balloonCenter.z * scale);
      } else if (kind === "fan") {
        const scale = Math.min(halfHeight * 1.12, halfWidth * 1.22);
        pose.scale.setScalar(scale);
        pose.position.set(halfWidth * .45 - .13 * scale, -halfHeight * .10 - .45 * scale, -depth);
      } else {
        pose.scale.setScalar(Math.min(.78, halfWidth * 1.45));
        pose.position.set(.48 * halfWidth, -.65 * halfHeight, -depth);
      }
      firstPersonCamera.updateWorldMatrix(true, false);
      pose.position.applyMatrix4(firstPersonCamera.matrixWorld);
      firstPersonCamera.getWorldQuaternion(pose.quaternion);
    } else {
      pose.position.copy(gripWorld);
      pose.quaternion.setFromEuler(this.angles.set(0, yaw, 0, "YXZ"));
    }

    switch (kind) {
      case "balloon":
        this.globeTint.setHSL(Number.isFinite(balloonHue) ? balloonHue! / 360 : phase / TAU, .86, .66, THREE.SRGBColorSpace);
        this.angles.set(0, 0, 0);
        break;
      case "fan": {
        const wave = Math.sin(time * 2.8 + phase);
        if (firstPersonCamera) this.angles.set(-.10 + .08 * wave, -.25 + .13 * wave, -.27, "YXZ");
        else this.angles.set(-.36 + .09 * wave, .13 * wave, -1.14 + .07 * wave, "YXZ");
        break;
      }
      case "propeller":
        this.angles.set(.15, time * 1.8 + phase, -.12, "XYZ");
        break;
    }
    pose.quaternion.multiply(this.localRotation.setFromEuler(this.angles));
    this.writeToy(kind, phase, !!firstPersonCamera);
  }

  launch(event: BambooPropellerLaunch, serverNowMs: number) {
    if (this.disposed || !event.id || event.id.length > 128) return;
    if (![event.x, event.y, event.z, event.yaw, event.startedAt, serverNowMs].every(Number.isFinite)) return;
    if (event.durationMs !== undefined && event.durationMs !== BAMBOO_PROPELLER_LIFETIME_MS) return;
    this.latestServerNow = Math.max(serverNowMs, this.latestServerNow);
    const age = this.latestServerNow - event.startedAt;
    if (age < 0 || age >= BAMBOO_PROPELLER_LIFETIME_MS) return;
    if (this.flights.has(event.id) || this.flights.size >= CAPACITY) return;
    this.flights.set(event.id, { ...event, phase: idPhase(event.id) });
  }

  private drawFlight(flight: Flight, elapsedMs: number) {
    const progress = elapsedMs / BAMBOO_PROPELLER_LIFETIME_MS;
    const seconds = elapsedMs / 1000;
    const { phase, yaw } = flight;
    const drift = 1 - (1 - progress) ** 2;
    const distance = drift * (2.5 + .45 * Math.sin(phase));
    const sway = (Math.sin(seconds * 2.2 + phase) - Math.sin(phase)) * .28 * ease(progress, 0, .23);
    const sinYaw = Math.sin(yaw), cosYaw = Math.cos(yaw);
    const x = flight.x - sinYaw * distance + cosYaw * sway;
    const z = flight.z - cosYaw * distance - sinYaw * sway;

    const ground = this.floorHeight?.(x, z) ?? flight.y - .85;
    const apex = flight.y + 4.5 + .55 * Math.cos(phase);
    const ascent = Math.min(1, progress / .30);
    const height = progress <= .30
      ? THREE.MathUtils.lerp(flight.y, apex, 1 - (1 - ascent) ** 2)
      : THREE.MathUtils.lerp(apex, ground + .04, ease(progress, .30, 1));
    this.transform.position.set(x, height, z);
    this.transform.scale.setScalar(1 - ease(progress, .88, 1));

    // Integrate a gradually slowing spin while the blades wobble in the air.
    this.transform.rotation.set(
      .13 * Math.sin(seconds * 3 + phase),
      phase + 25 * seconds - 1.42 * seconds ** 2,
      .20 * Math.sin(seconds * 2.6 + phase),
      "XYZ",
    );
    this.writeToy("propeller", phase);
  }

  endFrame(serverNowMs: number) {
    if (this.disposed) return;
    if (Number.isFinite(serverNowMs)) this.latestServerNow = Math.max(this.latestServerNow, serverNowMs);
    for (const [id, flight] of this.flights) {
      const elapsedMs = this.latestServerNow - flight.startedAt;
      if (elapsedMs >= BAMBOO_PROPELLER_LIFETIME_MS) this.flights.delete(id);
      else this.drawFlight(flight, elapsedMs);
    }

    for (const batch of this.batches) {
      batch.visible = batch.count > 0;
      if (!batch.visible) continue;
      batch.instanceMatrix.clearUpdateRanges();
      batch.instanceMatrix.addUpdateRange(0, batch.count * 16);
      batch.instanceMatrix.needsUpdate = true;
      for (const attribute of [batch.geometry.getAttribute("toyPhase"), batch.geometry.getAttribute("firstPersonToy"), batch.instanceColor]) {
        if (attribute instanceof THREE.InstancedBufferAttribute) {
          attribute.clearUpdateRanges();
          attribute.addUpdateRange(0, batch.count * attribute.itemSize);
          attribute.needsUpdate = true;
        }
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.flights.clear();
    for (const batch of this.batches) {
      batch.dispose();
      batch.geometry.dispose();
      batch.material.dispose();
    }
    this.root.clear();
  }
}
