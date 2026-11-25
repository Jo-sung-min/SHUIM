import * as THREE from "three";
import type { Daylight } from "./daylight";

export const HIDEOUT_SKY = `
varying vec3 vDir;
uniform vec3 uSkyTop, uSkyHorizon, uSun, uMoon;
uniform float uStars;
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.7, 285.3))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
}
void main(){
  vec3 d=normalize(vDir);
  vec3 horizon=mix(uSkyHorizon,vec3(.52,.64,.68),.28*(1.-uStars));
  vec3 col=mix(horizon,uSkyTop,smoothstep(-.02,.8,d.y));
  vec2 uv=d.xz/max(.08,d.y+.12);
  float cloud=noise(uv*.75)*.55+noise(uv*1.9)*.30+noise(uv*5.)*.15;
  col=mix(col,mix(vec3(.77,.81,.82),vec3(.15,.2,.30),uStars),smoothstep(.47,.8,cloud)*smoothstep(.005,.16,d.y)*.72);
  col+=vec3(.85,.65,.34)*pow(max(dot(d,uSun),0.),220.)*.48;
  col+=vec3(.72,.81,.86)*smoothstep(.9992,.9997,dot(d,uMoon))*uStars;
  float star=hash(floor(d.xz*560./max(.1,d.y+1.)));
  col+=smoothstep(.9982,1.,star)*uStars*smoothstep(.05,.4,d.y);
  gl_FragColor=vec4(col,1.);
}`;

// A finite sea plane below the playable ledge. Moving swell, broken crests and distance haze share the room clock.
export class HideoutWater {
  readonly material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, night: { value: 0 }, haze: { value: new THREE.Color() } },
    vertexShader: `
      varying vec3 surface;
      uniform float time;
      void main() {
        vec4 p=modelMatrix*vec4(position,1.);
        p.y+=.23*sin(p.z*.46+time*1.3+.9*sin(p.x*.15))+.11*sin(p.x*.68-p.z*.27-time*.92);
        surface=p.xyz; gl_Position=projectionMatrix*viewMatrix*p;
      }`,
    fragmentShader: `
      varying vec3 surface;
      uniform float time,night; uniform vec3 haze;
      void main() {
        vec2 p=surface.xz;
        float swell=p.y*.46+time*1.3+.9*sin(p.x*.15);
        float ripple=sin(p.x*2.4+p.y*1.3-time*1.8+sin(p.y*.7))+sin(p.y*4.+sin(p.x*.55)+time*2.);
        float dist=length(cameraPosition-surface);
        float fine=1.-smoothstep(40.,150.,dist);
        float wave=sin(swell)+.33*sin(p.x*.68-p.y*.27-time*.92);
        float froth=smoothstep(.92,1.22,wave+ripple*.09*fine);
        vec3 water=mix(vec3(.023,.17,.21),vec3(.17,.43,.44),.5+.34*wave+.10*ripple*fine);
        water=mix(water,vec3(.67,.81,.78),froth*(.55+.24*sin(p.x*.6+p.y*.2)));
        water+=vec3(.35,.41,.39)*smoothstep(1.60,1.99,ripple)*fine*.36;
        water*=mix(1.,.28,night);
        gl_FragColor=vec4(mix(water,haze,smoothstep(45.,220.,dist)*.94),1.);
      }`,
  });
  constructor(scene: THREE.Scene) {
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(620,620,175,175),this.material);
    mesh.rotation.x=-Math.PI/2; mesh.position.y=-4.7; scene.add(mesh);
  }
  applyDaylight(day: Daylight) {
    this.material.uniforms.night.value=day.stars;
    this.material.uniforms.haze.value.setRGB(...day.skyHorizon);
  }
}
