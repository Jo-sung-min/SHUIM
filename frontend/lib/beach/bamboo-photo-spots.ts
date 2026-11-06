import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { groundHeight } from "./bamboo-trail";

/** Inward-facing side gardens. The +X garden sits behind the guestbook approach;
 * neither installation crosses the deck or the central view toward the river. */
export const BAMBOO_PHOTO_SPOTS = [
  { id: "rest", text: "오늘도 고생했어", x: 9.1, z: 93.8, yaw: -Math.PI / 2 },
  { id: "love", text: "사랑해", x: -9.1, z: 99.6, yaw: 2.3 },
] as const;

export function bambooPhotoWorld(site: (typeof BAMBOO_PHOTO_SPOTS)[number], x: number, z: number) {
  return { x: site.x + x * Math.cos(site.yaw) + z * Math.sin(site.yaw),
    z: site.z - x * Math.sin(site.yaw) + z * Math.cos(site.yaw) };
}

/** Faces receive a small cream fill from the existing nearest-four lamp pool. */
export const BAMBOO_PHOTO_LIGHTS = BAMBOO_PHOTO_SPOTS.map(site => {
  const p = bambooPhotoWorld(site, 0, 2.8);
  return { ...p, y: groundHeight(p.x, p.z) + 2.5, color: 0xffdfc2, strength: 0.8 };
});

export function buildBambooPhotoSpots(parent: THREE.Object3D, mobile: boolean) {
  const root = new THREE.Group(); root.name = "bamboo-photo-spots"; parent.add(root);
  const coreParts: THREE.BufferGeometry[] = [], haloParts: THREE.BufferGeometry[] = [], metalParts: THREE.BufferGeometry[] = [];
  const stoneParts: THREE.BufferGeometry[] = [], poolParts: THREE.BufferGeometry[] = [];
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [], textures: THREE.Texture[] = [];
  const wordGlows: THREE.ShaderMaterial[] = [];
  const cream = 0xffe4b5, rose = 0xff95be, lilac = 0xbba5ff, mint = 0x83e2d2;
  const colorize = (g: THREE.BufferGeometry, hex: number) => {
    const c = new THREE.Color(hex), count = g.getAttribute("position").count, colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) c.toArray(colors, i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3)); return g;
  };
  const point = (site: (typeof BAMBOO_PHOTO_SPOTS)[number], x: number, y: number, z: number) => {
    const p = bambooPhotoWorld(site, x, z);
    return new THREE.Vector3(p.x, groundHeight(p.x, p.z) + y, p.z);
  };
  const tube = (site: (typeof BAMBOO_PHOTO_SPOTS)[number], positions: number[][], color: number, radius = .028, closed = false) => {
    const curve = new THREE.CatmullRomCurve3(positions.map(([x,y,z]) => point(site,x,y,z)), closed, "centripetal");
    const steps = Math.min(mobile ? 48 : 64, Math.max(8, positions.length * 2));
    coreParts.push(colorize(new THREE.TubeGeometry(curve, steps, radius, 5, closed), color));
    haloParts.push(colorize(new THREE.TubeGeometry(curve, steps, radius * 5.5, 6, closed), color));
  };
  const place = (site: (typeof BAMBOO_PHOTO_SPOTS)[number], g: THREE.BufferGeometry, x: number, y: number, z: number, list: THREE.BufferGeometry[]) => {
    g.rotateY(site.yaw); const p=point(site,x,y,z); g.translate(p.x,p.y,p.z); list.push(g);
  };
  const star = (site: (typeof BAMBOO_PHOTO_SPOTS)[number], x:number,y:number,z:number,r:number,color:number) => {
    tube(site,Array.from({length:8},(_,i)=>{const a=Math.PI/2+i*Math.PI/4,s=r*(i%2?.22:1);return [x+Math.cos(a)*s,y+Math.sin(a)*s,z];}),color,.022,true);
  };
  const circle = (site: (typeof BAMBOO_PHOTO_SPOTS)[number], x:number,y:number,z:number,r:number,color:number) =>
    tube(site,Array.from({length:36},(_,i)=>{const a=i/36*Math.PI*2;return [x+r*Math.cos(a),y+r*Math.sin(a),z];}),color,.026,true);
  const pool = (site: (typeof BAMBOO_PHOTO_SPOTS)[number], x:number,z:number,size:number,color:number) => {
    const g=new THREE.PlaneGeometry(size,size,2,2); g.rotateX(-Math.PI/2);
    const position=g.getAttribute("position");
    for(let i=0;i<position.count;i++) { const p=point(site,x+position.getX(i),.018,z+position.getZ(i));position.setXYZ(i,p.x,p.y,p.z); }
    poolParts.push(colorize(g,color));
  };

  for(const site of BAMBOO_PHOTO_SPOTS) {
    // Flush oval stones conform to the existing ground; no new step or invisible wall.
    const disk=new THREE.CircleGeometry(1,40); disk.rotateX(-Math.PI/2);
    const vertices=disk.getAttribute("position");
    for(let i=0;i<vertices.count;i++){const p=point(site,vertices.getX(i)*3.05,.009,.6+vertices.getZ(i)*1.8);vertices.setXYZ(i,p.x,p.y,p.z);}
    disk.computeVertexNormals(); stoneParts.push(disk);
    // A broken edge leaves a broad approach from the centre of the clearing.
    tube(site,Array.from({length:42},(_,i)=>{const a=.38+i/41*(Math.PI*2-.76);return [Math.sin(a)*3.0,.08,.6+Math.cos(a)*1.72];}),site.id==="rest"?lilac:rose,.019);
    for(const x of [-2.65,2.65]) {
      place(site,new THREE.CylinderGeometry(.035,.045,3.85,7),x,1.925,-.55,metalParts);
      tube(site,[[x,.12,-.55],[x,3.38,-.55],[x*.8,3.98,-.55],[0,4.15,-.55]],site.id==="rest"?lilac:rose,.025);
      star(site,x,3.4,-.52,.16,cream);
    }
    if(site.id==="rest") {
      // A warm crescent to stand beside, with a small meteor and sleepy star cluster.
      const moon:number[][]=[];
      for(let i=0;i<=32;i++){const a=.7+i/32*(Math.PI*2-1.4);moon.push([-1.38+Math.cos(a)*1.05,1.4+Math.sin(a)*1.05,-.3]);}
      const tx=Math.cos(.7)*1.05,ty=Math.sin(.7)*1.05;
      for(let i=1;i<21;i++){const t=i/21;moon.push([-1.38+tx-Math.sin(t*Math.PI)*.94,1.4-ty+2*ty*t,-.3]);}
      tube(site,moon,cream,.043,true);
      star(site,.22,2.22,-.25,.33,lilac); star(site,.95,2.55,-.25,.18,cream);
      tube(site,[[.9,1.6,-.25],[1.4,1.7,-.25],[1.9,1.98,-.25]],mint,.025);
      star(site,1.95,2.0,-.25,.23,cream);
    } else {
      // Two overlapping heart outlines stay hollow so a visitor remains the subject.
      for(const [cx,cy,r,color] of [[-.35,1.48,1.45,rose],[1.45,2.08,.48,lilac]]) {
        tube(site,Array.from({length:64},(_,i)=>{const a=i/64*Math.PI*2;return [cx+Math.pow(Math.sin(a),3)*r,cy+(13*Math.cos(a)-5*Math.cos(2*a)-2*Math.cos(3*a)-Math.cos(4*a))/16*r,-.22];}),color,.036,true);
      }
      star(site,-2.05,2.35,-.2,.25,cream); star(site,2.15,1.95,-.2,.16,mint);
    }
    // Small luminous flowers and floating-orb outlines add varied silhouettes at the edges.
    for(const [x,z,h,color] of [[-2.9,.4,.68,mint],[2.62,.75,.86,lilac],[2.1,1.35,.52,rose]]) {
      tube(site,[[x,.04,z],[x+.1,h*.6,z],[x,h,z]],mint,.019);
      tube(site,Array.from({length:40},(_,i)=>{const a=i/40*Math.PI*2,r=.28+.09*Math.cos(a*5);return [x+Math.sin(a)*r,h+.22+Math.cos(a)*r,z];}),color,.022,true);
      circle(site,x,h+.22,z,.055,cream);
    }
    for(const [x,y,r] of [[-2.1,2.85,.13],[2.15,2.85,.19]])circle(site,x,y,-.45,r,mint);
    pool(site,0,.65,5,site.id==="rest"?lilac:rose);
    pool(site,-1.4,.8,2.8,cream);

    const texture=neonWords(site.text,mobile,site.id==="rest"?"#ffe5bd":"#ffacd0");textures.push(texture);
    const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.015,depthWrite:false,toneMapped:false});
    material.name=`bamboo-photo-words-${site.id}`;materials.push(material);
    const geometry=new THREE.PlaneGeometry(5.25,1.31);geometries.push(geometry);
    const sign=new THREE.Mesh(geometry,material);sign.name=material.name;sign.userData.text=site.text;
    sign.position.copy(point(site,0,3.4,-.5));sign.rotation.y=site.yaw;sign.renderOrder=5;root.add(sign);
    // Reuse the same glyph texture for a local, softly blurred halo. Only these
    // two small planes are sampled; no full-screen bloom or extra texture load.
    const glow=new THREE.ShaderMaterial({
      uniforms:{uMap:{value:texture},uNight:{value:0},uColor:{value:new THREE.Color(site.id==="rest"?0xffce80:0xff67a5)},
        uTexel:{value:new THREE.Vector2(1/(mobile?1024:1536),1/(mobile?256:384))}},
      transparent:true,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,
      vertexShader:"varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:`uniform sampler2D uMap;uniform vec2 uTexel;uniform vec3 uColor;uniform float uNight;varying vec2 vUv;
        void main(){float a=texture2D(uMap,vUv).a*.2;
          for(int i=0;i<8;i++){float angle=float(i)*.785398;vec2 d=vec2(cos(angle),sin(angle))*uTexel;
            a+=texture2D(uMap,vUv+d*12.).a*.065+texture2D(uMap,vUv+d*23.).a*.035;}
          gl_FragColor=vec4(uColor*1.45,a*.48*uNight);
          #include <colorspace_fragment>
        }`,
    });
    glow.name=`bamboo-photo-word-glow-${site.id}`;materials.push(glow);wordGlows.push(glow);
    const glowMesh=new THREE.Mesh(geometry,glow);glowMesh.name=glow.name;glowMesh.position.copy(sign.position);glowMesh.rotation.copy(sign.rotation);glowMesh.renderOrder=4;root.add(glowMesh);
  }

  const core=new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false});core.name="bamboo-photo-neon";
  const halo=new THREE.ShaderMaterial({uniforms:{uNight:{value:0}},vertexColors:true,toneMapped:false,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:"varying vec3 vColor;varying vec3 vNormal;varying vec3 vEye;void main(){vColor=color;vNormal=normalMatrix*normal;vec4 p=modelViewMatrix*vec4(position,1.);vEye=-p.xyz;gl_Position=projectionMatrix*p;}",
    fragmentShader:`uniform float uNight;varying vec3 vColor;varying vec3 vNormal;varying vec3 vEye;
      void main(){float face=max(0.,dot(normalize(vNormal),normalize(vEye)));float soft=pow(face,1.8);
        gl_FragColor=vec4(vColor*1.25,soft*.18*uNight);
        #include <colorspace_fragment>
      }`});halo.name="bamboo-photo-halos";
  const stone=new THREE.MeshStandardMaterial({color:0x68646b,roughness:.8,metalness:.04});stone.name="bamboo-photo-stones";
  const metal=new THREE.MeshStandardMaterial({color:0x8c8070,roughness:.46,metalness:.4});metal.name="bamboo-photo-bronze";
  const wash=new THREE.ShaderMaterial({uniforms:{uNight:{value:0}},vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:"varying vec2 vUv;varying vec3 vColor;void main(){vUv=uv;vColor=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader:"varying vec2 vUv;varying vec3 vColor;uniform float uNight;void main(){float r=length((vUv-.5)*2.);gl_FragColor=vec4(vColor,pow(max(0.,1.-r),2.)*.14*uNight);}"});wash.name="bamboo-photo-ground-glow";
  for(const [parts,material] of [[stoneParts,stone],[metalParts,metal],[coreParts,core],[haloParts,halo],[poolParts,wash]] as const) {
    const flat=parts.map(p=>p.index?p.toNonIndexed():p),geometry=mergeGeometries(flat,false)!;
    for(const g of new Set([...parts,...flat]))g.dispose();geometries.push(geometry);materials.push(material);
    const mesh=new THREE.Mesh(geometry,material);mesh.name=material.name;if(material.transparent)mesh.renderOrder=4;root.add(mesh);
  }
  let disposed=false;
  return {root,
    setNight(amount:number){if(disposed)return;const night=THREE.MathUtils.clamp(amount,0,1);core.color.setScalar(.5+.85*night);halo.uniforms.uNight.value=night;wash.uniforms.uNight.value=night;
      for(const glow of wordGlows)glow.uniforms.uNight.value=night;
      for(const material of materials)if(material.name.startsWith("bamboo-photo-words"))(material as THREE.MeshBasicMaterial).color.setScalar(.6+.7*night);},
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();root.clear();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();},
  };
}

function neonWords(text:string,mobile:boolean,color:string):THREE.Texture {
  if(typeof document==="undefined")return new THREE.Texture();
  const canvas=document.createElement("canvas");canvas.width=mobile?1024:1536;canvas.height=canvas.width/4;
  const ctx=canvas.getContext("2d")!;ctx.scale(canvas.width/1024,canvas.width/1024);
  ctx.textAlign="center";ctx.textBaseline="middle";ctx.font=`600 ${text.length>4?98:122}px 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif`;
  ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=14;ctx.lineWidth=1.4;ctx.strokeText(text,512,128);
  ctx.shadowBlur=6;ctx.fillStyle=color;ctx.fillText(text,512,128);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}
