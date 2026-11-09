import * as THREE from "three";

/** Lighting every cotton surface shares: sky and ground ambience, the moon or sun, and the handful of lanterns nearest the walker. */
export interface CloudSpaCottonUniforms {
  uTime: THREE.IUniform<number>;
  uSky: THREE.IUniform<THREE.Color>;
  uGround: THREE.IUniform<THREE.Color>;
  uLightDir: THREE.IUniform<THREE.Vector3>;
  uLightColor: THREE.IUniform<THREE.Color>;
  uNight: THREE.IUniform<number>;
  uLamps: THREE.IUniform<THREE.Vector4[]>;
  uLampColor: THREE.IUniform<THREE.Color>;
}
export const CLOUD_SPA_LAMP_COUNT = 6;
export function createCloudSpaCottonUniforms(): CloudSpaCottonUniforms {
  return {
    uTime: { value: 0 }, uSky: { value: new THREE.Color(0xa7bfeb) }, uGround: { value: new THREE.Color(0x8d9bad) },
    uLightDir: { value: new THREE.Vector3(-.35, .8, -.35).normalize() }, uLightColor: { value: new THREE.Color(0xc3d9ff) }, uNight: { value: 1 },
    uLamps: { value: Array.from({ length: CLOUD_SPA_LAMP_COUNT }, () => new THREE.Vector4(0, -1000, 0, 0)) }, uLampColor: { value: new THREE.Color(0xffc78c) },
  };
}

const COTTON_VERT = `
#ifdef DEPTH
attribute float aDepth;
varying float vDepth;
#endif
varying vec3 vWorld;
varying vec3 vNormal;
void main(){
  vec4 world=modelMatrix*vec4(position,1.0);
  vWorld=world.xyz; vNormal=normalize(mat3(modelMatrix)*normal);
  #ifdef DEPTH
  vDepth=aDepth;
  #endif
  gl_Position=projectionMatrix*viewMatrix*world;
}`;
const COTTON_FRAG = `
uniform sampler2D uCloudSurface;
uniform float uTime;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uNight;
uniform vec4 uLamps[${CLOUD_SPA_LAMP_COUNT}];
uniform vec3 uLampColor;
uniform vec3 uTint;
uniform float uErode;
varying vec3 vWorld;
varying vec3 vNormal;
#ifdef DEPTH
varying float vDepth;
#endif
float cottonHash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float cottonNoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(cottonHash(i),cottonHash(i+vec2(1.0,0.0)),f.x),mix(cottonHash(i+vec2(0.0,1.0)),cottonHash(i+vec2(1.0,1.0)),f.x),f.y);
}
void main(){
  vec3 n=normalize(vNormal);
  if(!gl_FrontFacing) n=-n;
  vec3 v=normalize(cameraPosition-vWorld);
  vec3 blend=pow(abs(n),vec3(4.0)); blend/=max(.001,blend.x+blend.y+blend.z);
  vec3 p=vWorld*.095;
  vec3 detail=texture2D(uCloudSurface,p.yz).rgb*blend.x+texture2D(uCloudSurface,p.xz).rgb*blend.y+texture2D(uCloudSurface,p.xy).rgb*blend.z;
  float lum=dot(detail,vec3(.299,.587,.114));
  // Slow, low-frequency mottling is what reads as smoke: it drifts, and it never has a hard edge.
  float mottle=cottonNoise(vWorld.xz*.06+vec2(uTime*.012,uTime*.007))*.6+cottonNoise(vWorld.xz*.19+vWorld.y*.11)*.4;
  float facing=max(0.0,dot(n,v));
  // Wrapped diffuse keeps shadow sides misty instead of navy; the rim glows with the sky as light bleeds through cotton.
  float wrap=dot(n,uLightDir)*.5+.5;
  vec3 ambient=mix(uGround,uSky,n.y*.5+.5);
  vec3 light=ambient*(.5+.32*mottle)+uLightColor*(.12+.3*wrap);
  light+=uSky*pow(1.0-facing,2.2)*.4;
  for(int i=0;i<${CLOUD_SPA_LAMP_COUNT};i++){
    vec3 d=uLamps[i].xyz-vWorld; float dist=max(.4,length(d));
    light+=uLampColor*(uLamps[i].w/(1.0+dist*dist*.085))*(dot(n,d/dist)*.5+.5);
  }
  vec3 color=uTint*(.58+.42*lum)*light;
  #ifdef DEPTH
  // Submerged cotton takes on the pool's turquoise, with a lazy caustic shimmer.
  float wet=smoothstep(0.0,.3,vDepth);
  color=mix(color,color*vec3(.52,.93,1.0),wet);
  float caustic=pow(max(0.0,sin(vWorld.x*1.7+uTime*.9)*sin(vWorld.z*1.9-uTime*.7))*.5+.5,6.0)*wet*.3;
  color+=vec3(.22,.5,.5)*caustic;
  // Terrace walls weep: faint sheets slide down every near-vertical face.
  float wall=1.0-smoothstep(.3,.6,abs(n.y));
  float streak=cottonNoise(vec2(atan(n.x,n.z)*7.0+(vWorld.x+vWorld.z)*.6,vWorld.y*1.3-uTime*1.1));
  color+=vec3(.3,.46,.5)*wall*smoothstep(.52,.9,streak)*.3;
  color+=uSky*wall*pow(1.0-facing,3.0)*.3;
  #endif
  // Distance haze lets far terraces melt into the sky the way the photographed banks do.
  float haze=smoothstep(45.0,170.0,length(cameraPosition-vWorld));
  color=mix(color,uSky*.85,haze*.55);
  float alpha=1.0;
  if(uErode>.5){
    // Silhouettes dissolve: grazing faces thin out through the mottle so no hard contour remains.
    alpha=smoothstep(.12,.6,facing+(mottle-.5)*.4);
    if(alpha<.02) discard;
  }
  gl_FragColor=vec4(color,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Walkable cotton: unlit-style wrapped shading with photographic detail; shells and storm clouds also erode at their silhouettes. */
export function createCloudSpaCottonMaterial(kind: "floor" | "cloud" | "storm", texture: THREE.Texture, shared: CloudSpaCottonUniforms): THREE.ShaderMaterial {
  const erode = kind !== "floor";
  const material = new THREE.ShaderMaterial({
    uniforms: { ...shared, uCloudSurface: { value: texture }, uErode: { value: erode ? 1 : 0 },
      uTint: { value: new THREE.Color(kind === "storm" ? 0x4c546c : kind === "floor" ? 0xf3f1ec : 0xf2f1f5) } },
    vertexShader: COTTON_VERT, fragmentShader: COTTON_FRAG, defines: kind === "floor" ? { DEPTH: 1 } : {},
    transparent: erode, depthWrite: true, side: erode ? THREE.DoubleSide : THREE.FrontSide, fog: false,
  });
  material.name = `cloud-spa-cotton-${kind}`;
  return material;
}
