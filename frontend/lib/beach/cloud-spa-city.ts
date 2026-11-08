import * as THREE from "three";

export const CLOUD_SPA_CITY = { size: 1100, y: -170, z: 42, feather: .012 } as const;

const PHOTO_UNIFORMS = `
uniform sampler2D uCityNW;
uniform sampler2D uCityNE;
uniform sampler2D uCitySW;
uniform sampler2D uCitySE;
uniform float uTiled;
uniform float uNight;
uniform float uTime;
`;
const PHOTO_FUNCTIONS = `
vec3 cityPhoto(vec2 uv) {
  vec3 photo=vec3(0.0);
  if(uTiled<.5) {
    photo=texture2D(uCityNW,clamp(uv,0.0,1.0)).rgb;
  } else {
    // Only the thin overlap at district boundaries blends; each neighbourhood keeps its full photographic detail.
    const float seam=${CLOUD_SPA_CITY.feather.toFixed(3)};
    vec2 low=clamp(uv/(.5+seam),0.0,1.0);
    vec2 high=clamp((uv-(.5-seam))/(.5+seam),0.0,1.0);
    vec2 blend=smoothstep(vec2(.5-seam),vec2(.5+seam),uv);
    vec3 south=mix(texture2D(uCitySW,low).rgb,texture2D(uCitySE,vec2(high.x,low.y)).rgb,blend.x);
    vec3 north=mix(texture2D(uCityNW,vec2(low.x,high.y)).rgb,texture2D(uCityNE,high).rgb,blend.x);
    photo=mix(south,north,blend.y);
  }
  return photo;
}
float citySeed(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
vec3 cityLights(vec3 photo,vec2 uv) {
  float luminance=dot(photo,vec3(.2126,.7152,.0722));
  float lit=smoothstep(.32,.68,luminance);
  vec2 block=floor(uv*vec2(1120.0,1040.0));
  float seed=citySeed(block);
  float selected=smoothstep(.48,.83,seed);
  // Independent seven-to-eighteen-second pulses affect bright lamps only; dark roofs and the overall exposure stay still.
  float pulse=sin(uTime*(.35+seed*.5)+seed*6.2831853);
  return photo*(1.0+lit*selected*pulse*.10*uNight);
}
`;

const CITY_VERTEX = `
varying vec2 vUv;
void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
`;
const CITY_FRAGMENT = `${PHOTO_UNIFORMS}
varying vec2 vUv;
${PHOTO_FUNCTIONS}
void main(){
  vec3 city=cityLights(cityPhoto(vUv),vUv);
  gl_FragColor=vec4(city*mix(.73,1.0,uNight),1.0);
  #include <colorspace_fragment>
}`;

const MOUNTAIN_VERTEX = `
attribute float aHeight;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight;
void main(){
  vec4 world=modelMatrix*vec4(position,1.0);
  vWorld=world.xyz; vNormal=normalize(mat3(modelMatrix)*normal); vHeight=aHeight;
  gl_Position=projectionMatrix*viewMatrix*world;
}`;
const MOUNTAIN_FRAGMENT = `${PHOTO_UNIFORMS}
uniform float uLayer;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight;
${PHOTO_FUNCTIONS}
void main(){
  vec3 normal=normalize(vNormal);
  float facet=.72+.28*max(0.0,dot(normal,normalize(vec3(-.5,.7,.35))));
  float strata=sin(vWorld.x*.034+sin(vWorld.z*.026))*sin(vWorld.y*.062+vWorld.z*.019);
  vec3 navy=mix(vec3(.045,.073,.105),vec3(.009,.017,.031),uNight);
  navy*=facet*(1.0+strata*.07);
  vec3 haze=mix(vec3(.08,.115,.15),vec3(.016,.027,.045),uNight);
  float distanceHaze=smoothstep(570.0,1350.0,length(vWorld.xz-vec2(0.0,42.0)));
  vec3 mountain=mix(navy,haze,clamp(uLayer*.13+distanceHaze*.25,0.0,.7));
  // The first foothills share the actual city photograph at ground level, then become shaded three-dimensional slopes.
  vec2 photoUv=vec2(vWorld.x/${CLOUD_SPA_CITY.size.toFixed(1)}+.5,.5-(vWorld.z-${CLOUD_SPA_CITY.z.toFixed(1)})/${CLOUD_SPA_CITY.size.toFixed(1)});
  float suburb=(1.0-smoothstep(.1,6.5,vHeight))*(1.0-step(.5,uLayer));
  suburb*=step(0.0,photoUv.x)*step(photoUv.x,1.0)*step(0.0,photoUv.y)*step(photoUv.y,1.0);
  vec3 photo=cityLights(cityPhoto(photoUv),photoUv)*mix(.73,1.0,uNight);
  gl_FragColor=vec4(mix(mountain,photo,suburb),1.0);
  #include <colorspace_fragment>
}`;

/** A broad irregular mountain belt rises from the image edge, with a smooth apron and several actual ridgelines. */
export function cloudSpaCityMountainGeometry(layer: number, mobile: boolean): THREE.BufferGeometry {
  const around = mobile ? 160 : 256, rings = 10, positions: number[] = [], heights: number[] = [], uv: number[] = [], indices: number[] = [];
  const inner = [458, 563, 713][layer], outer = [673, 841, 1050][layer];
  for (let ring = 0; ring <= rings; ring++) for (let step = 0; step <= around; step++) {
    const angle = step / around * Math.PI * 2, t = ring / rings;
    const wave = Math.sin(angle * 3 + layer * 1.7) * .055 + Math.sin(angle * 7 - layer) * .025;
    const square = Math.max(Math.abs(Math.sin(angle)), Math.abs(Math.cos(angle)));
    const half = inner + (outer - inner) * t;
    const radius = half / Math.max(.71, square) * (1 + wave * (.25 + .75 * t));
    const ridge = Math.pow(Math.max(0, Math.sin(Math.PI * t)), 1.45);
    const peaks = .53 + .22 * Math.sin(angle * 5 + layer * 2.3) + .14 * Math.cos(angle * 11 - layer * .7) + .08 * Math.sin(angle * 19 + .4);
    const height = ridge * ([69, 108, 152][layer] * peaks + 24) - Math.pow(t, 8) * (layer === 2 ? 95 : 12);
    positions.push(Math.sin(angle) * radius, CLOUD_SPA_CITY.y - .18 + height, CLOUD_SPA_CITY.z + Math.cos(angle) * radius);
    heights.push(height); uv.push(step / around, t);
    if (ring < rings && step < around) { const a = ring * (around + 1) + step, b = a + 1, c = a + around + 1; indices.push(a, c, b, b, c, c + 1); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.name = `cloud-spa-city-mountain-belt-${layer + 1}`;
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("aHeight", new THREE.Float32BufferAttribute(heights, 1));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

export interface CloudSpaCity {
  root: THREE.Group;
  city: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  update(time: number, night: number): void;
  dispose(): void;
}

export function buildCloudSpaCity(parent: THREE.Object3D, tiles: readonly THREE.Texture[], mobile = false): CloudSpaCity {
  if (!tiles[0]) throw new Error("Cloud spa city needs at least one photograph");
  const root = new THREE.Group(); root.name = "cloud-spa-city-and-mountain-valley"; parent.add(root);
  const shared = {
    uCityNW: { value: tiles[0] }, uCityNE: { value: tiles[1] ?? tiles[0] }, uCitySW: { value: tiles[2] ?? tiles[0] }, uCitySE: { value: tiles[3] ?? tiles[0] },
    uTiled: { value: tiles.length >= 4 ? 1 : 0 }, uNight: { value: 1 }, uTime: { value: 0 },
  };
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.ShaderMaterial[] = [];
  const material = new THREE.ShaderMaterial({ uniforms: shared, vertexShader: CITY_VERTEX, fragmentShader: CITY_FRAGMENT, fog: false, toneMapped: false });
  const plane = new THREE.PlaneGeometry(CLOUD_SPA_CITY.size, CLOUD_SPA_CITY.size); plane.rotateX(-Math.PI / 2);
  const city = new THREE.Mesh(plane, material); city.name = "cloud-spa-city-170m-below"; city.position.set(0, CLOUD_SPA_CITY.y, CLOUD_SPA_CITY.z); city.renderOrder = -2; root.add(city);
  geometries.push(plane); materials.push(material);
  for (let layer = 0; layer < 3; layer++) {
    const geometry = cloudSpaCityMountainGeometry(layer, mobile);
    const mountainMaterial = new THREE.ShaderMaterial({ uniforms: { ...shared, uLayer: { value: layer } }, vertexShader: MOUNTAIN_VERTEX, fragmentShader: MOUNTAIN_FRAGMENT, fog: false, toneMapped: false });
    const mountain = new THREE.Mesh(geometry, mountainMaterial); mountain.name = `cloud-spa-city-mountains-${layer + 1}`; root.add(mountain);
    geometries.push(geometry); materials.push(mountainMaterial);
  }
  let disposed = false;
  return { root, city,
    update(time, night) {
      if (disposed) return;
      if (Number.isFinite(time)) shared.uTime.value = time;
      if (Number.isFinite(night)) shared.uNight.value = THREE.MathUtils.clamp(night, 0, 1);
    },
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); root.clear(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
