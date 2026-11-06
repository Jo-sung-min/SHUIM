import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { assets } from "./assets-fixture.mjs";

const source=stripTypeScriptTypes(await readFile(new URL("../lib/beach/fireworks.ts",import.meta.url),"utf8"))
  .replace(/^import\s+[^\n]+\n/gm,"").replace(/\bexport\s+(?=function\b|class\b|const\b)/g,"");
const variantSource=stripTypeScriptTypes(await readFile(new URL("../lib/beach/firework-festival-variants.ts",import.meta.url),"utf8"))
  .replace(/^import\s+[^\n]+\n/gm,"").replace(/\bexport\s+(?=function\b|class\b|const\b)/g,"");
const finaleSource=stripTypeScriptTypes(await readFile(new URL("../lib/beach/firework-songi-finale.ts",import.meta.url),"utf8")).replace(/\bexport\s+(?=const\b)/g,"");
const flowerSource=stripTypeScriptTypes(await readFile(new URL("../lib/beach/firework-songi-flowers.ts",import.meta.url),"utf8")).replace(/\bexport\s+(?=function\b|const\b)/g,"");
const event=(id="festival",variant="festival",startedAt=100000)=>({id,seed:1729,startedAt,durationMs:variant==="songi"?18000:12000,variant});
function fixture(options={mobile:true,grand:true,reflectWater:true}) {
  let time=100000;
  const context={THREE,Date:{now:()=>time},...assets};
  vm.runInNewContext(`${variantSource}\n${finaleSource}\n${flowerSource}\n${source}\nglobalThis.api={BeachFireworks,fireworkGeometry};`,context);
  const scene=new THREE.Scene(), fireworks=new context.api.BeachFireworks(scene,options);
  const camera=new THREE.PerspectiveCamera(82,390/844,.1,520); camera.position.set(0,1.55,10); camera.lookAt(0,40,-100);
  return {...context.api,scene,fireworks,camera,setTime:value=>time=value};
}
function glyphs(geometry) {
  const timing=geometry.getAttribute("timing"), velocity=geometry.getAttribute("velocity"), points=[];
  for(let i=0;i<timing.count;i++) if(timing.getW(i)===4 && timing.getY(i)===0 && velocity.getZ(i)===0) points.push([velocity.getX(i),velocity.getY(i)]);
  return points;
}

test("grand geometry is deterministic, dense and finite within fixed mobile and desktop budgets",()=>{
  const f=fixture();
  for(const mobile of [true,false]) for(const variant of ["festival","songi","love"]) {
    const geometry=f.fireworkGeometry(1729,mobile,variant,true), same=f.fireworkGeometry(1729,mobile,variant,true);
    const changed=f.fireworkGeometry(98,mobile,variant,true), beach=f.fireworkGeometry(1729,mobile,variant);
    const count=geometry.getAttribute("position").count;
    assert.ok(variant==="festival"?count>beach.getAttribute("position").count*7:count>10000,"each choreography has a dense but bounded set of individual ember trajectories");
    assert.ok(count<(mobile?40000:90000));
    for(const [name,attribute] of Object.entries(geometry.attributes)) {
      assert.equal(attribute.count,count); assert.ok(attribute.array.every(Number.isFinite));
      assert.deepEqual(attribute.array,same.attributes[name].array);
    }
    assert.notDeepEqual(geometry.getAttribute("detail").array,changed.getAttribute("detail").array,"the seed varies each spark's phase even when the heart outline stays recognizable");
    const timing=geometry.getAttribute("timing"), detail=geometry.getAttribute("detail");
    for(let i=0;i<count;i++) {
      assert.ok(timing.getX(i)+timing.getY(i)+timing.getZ(i)<=(variant==="songi"?18.00001:12.00001),"every tail completes within its authoritative show duration");
      assert.ok(detail.getX(i)>0 && detail.getZ(i)>=0 && detail.getZ(i)<=1);
    }
    for(const item of [geometry,same,changed,beach]) item.dispose();
  }
  f.fireworks.dispose();
});

test("wide layered shells, small satellites and low symmetric fans build a multi-colour gold finale",()=>{
  const f=fixture(), geometry=f.fireworkGeometry(1729,true,"festival",true);
  const positions=geometry.getAttribute("position"), timing=geometry.getAttribute("timing"), colors=geometry.getAttribute("sparkColor");
  const shells=[], fans=new Set(), jewels=new Set(), palette=new Set(); let longGold=0;
  for(let i=0;i<timing.count;i++) {
    const mode=timing.getW(i);
    if(mode===3) shells.push([positions.getX(i),positions.getY(i),positions.getZ(i),timing.getX(i)]);
    if(mode===8) fans.add(positions.getX(i));
    if(mode===7 && Math.abs(timing.getZ(i)-2.3)<.001) jewels.add(`${positions.getX(i)},${positions.getY(i)},${positions.getZ(i)}`);
    if(mode===6 && timing.getY(i)>1) longGold++;
    palette.add([colors.getX(i),colors.getY(i),colors.getZ(i)].join(","));
  }
  assert.equal(shells.length,19); assert.equal(jewels.size,8); assert.equal(fans.size,7); assert.ok(longGold>2000); assert.ok(palette.size>=8);
  assert.ok(Math.min(...shells.map(p=>p[0]))<=-70 && Math.max(...shells.map(p=>p[0]))>=70);
  assert.ok(shells.some(p=>p[2]>0));
  const seaward=shells.filter(p=>p[2]<0);
  assert.equal(seaward.length,16);
  for(const positionZ of [10,-50]) for(const [x,y,z] of seaward) {
    const elevation=Math.atan2(y-1.55,Math.hypot(x,z-positionZ));
    assert.ok(elevation>Math.PI/180*8 && elevation<Math.PI/180*27,"main flowers remain just above the horizon even at the front promenade boundary");
  }
  assert.equal(shells.filter(p=>p[3]>=7).length,8,"the finale combines distant and overhead layers");
  assert.deepEqual([...fans].sort((a,b)=>a-b),[-57,-38,-19,0,19,38,57]);
  geometry.dispose(); f.fireworks.dispose();
});

test("songi keeps every Hangul head in the phone view including its final expansion",()=>{
  const f=fixture();
  const grand=f.fireworkGeometry(12,true,"songi",true), beach=f.fireworkGeometry(12,true,"songi",false);
  const embers=glyphs(grand), original=glyphs(beach);
  assert.equal(embers.length,original.length); assert.equal(grand.userData.phrase,"송이 안녕?");
  for(let i=0;i<original.length;i++) for(let axis=0;axis<2;axis++) {
    assert.ok(Math.abs(embers[i][axis]-original[i][axis]*1.8)<.00001,"a readable head preserves every glyph sample");
  }
  grand.dispose(); beach.dispose();
  f.fireworks.apply([event("words","songi")],100000); f.camera.rotation.set(-.08,0,0);
  const object=f.scene.getObjectByName("beach-fireworks-words"), uniforms=object.material.uniforms;
  for(const z of [10,-50]) {
    f.camera.position.z=z; f.fireworks.update(f.camera,105000,844);
    assert.deepEqual(uniforms.uTextCenter.value.toArray(),[0,66,-205]);
    for(const [x,y] of glyphs(object.geometry)) {
      const p=uniforms.uTextCenter.value.clone().addScaledVector(uniforms.uTextRight.value,x*uniforms.uTextScale.value*1.28)
        .addScaledVector(uniforms.uTextUp.value,y*uniforms.uTextScale.value*1.28).project(f.camera);
      assert.ok(Math.abs(p.x)<.9 && Math.abs(p.y)<.9);
    }
  }
  assert.ok(uniforms.uTextWidth.value>80); f.fireworks.dispose();
});

test("songi bursts once, then short tails burn out into scattered gold tips without a static sign",()=>{
  const variant="songi";
  for(const mobile of [true,false]) {
    const f=fixture({mobile,grand:true,reflectWater:true});
    f.fireworks.apply([event("message",variant)],100000);
    const object=f.scene.children[0], geometry=object.geometry;
    const {timing,velocity,position}=geometry.attributes;
    const points=glyphs(geometry), starts=new Set(), centralBursts=new Set();
    for(let i=0;i<timing.count;i++) {
      if(timing.getW(i)===4 && velocity.getZ(i)===0) {
        starts.add(timing.getX(i));
        assert.ok(timing.getY(i)<=.55001,"short shared tails follow the head rather than scan the text");
        assert.ok(timing.getZ(i)>2 && timing.getZ(i)<2.91,"each letter ember burns briefly");
      }
      if(timing.getW(i)===4) assert.ok(timing.getX(i)+timing.getY(i)+timing.getZ(i)<5.6,"no letter or tail survives as an eight-second sign");
      if(timing.getW(i)===3 && position.getX(i)===0) centralBursts.add(timing.getX(i));
    }
    assert.equal(starts.size,1); assert.ok(centralBursts.has([...starts][0]));
    assert.equal(geometry.userData.phrase,"송이 안녕?");
    assert.ok(!object.material.vertexShader.includes("float reserve"),"the background stays continuous behind the lettering");
    assert.ok(object.material.vertexShader.includes("expansion=1.28*(1.0-exp(-1.05*t))"),"the text uses the existing heart's moving trajectory");

    const core=points;
    const minX=Math.min(...core.map(p=>p[0])),maxX=Math.max(...core.map(p=>p[0]));
    assert.ok(Math.abs(minX+maxX)<1e-5,"visible pixels are horizontally centered without trailing space");
    const burnouts=new Set();
    for(let i=0;i<timing.count;i++) if(timing.getW(i)===4 && timing.getY(i)===0) burnouts.add(timing.getZ(i));
    assert.ok(burnouts.size>500,"individual embers burn out at different seeded times");
    const reflected=f.scene.children[1];
    assert.equal(reflected.geometry,geometry);
    assert.equal(reflected.material.uniforms.uTextScale,object.material.uniforms.uTextScale);
    f.fireworks.dispose();
  }
});

test("songi uses the existing heart impulse and burns its heads at individual times",()=>{
  const f=fixture();
  f.fireworks.apply([event("songi","songi"),event("heart","love")],100000);
  const word=f.scene.getObjectByName("beach-fireworks-songi"), heart=f.scene.getObjectByName("beach-fireworks-heart");
  const block=word.material.vertexShader.match(/if\(velocity.z<\.5\) \{([\s\S]*?)\n\s+\} else \{/)[1];
  const impulse=block.match(/float expansion=([^,;]+(?:,[^,;]+)*?), fall=/)[1];
  assert.ok(heart.material.vertexShader.includes(`float expansion=${impulse}, fall=`),"the greeting reuses the approved heart's exact expansion rather than a fast settle");
  const context={exp:Math.exp,max:Math.max,sin:Math.sin,pow:Math.pow,
    mix:(a,b,t)=>a*(1-t)+b*t,
    smoothstep:(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}};
  const twinkle=word.material.vertexShader.match(/float fireworkTwinkle\(([^)]*)\)\s*\{([^}]*)\}/);
  const scalar=block.replace(/^\s*\/\/.*$/gm,"").replace(/^\s*(?:vec2 localRay|offset=|motion=)[^;]*;/gm,"").replace(/\bfloat\s+/g,"let ");
  vm.runInNewContext(`function fireworkTwinkle(${twinkle[1].replace(/\bfloat\s+/g,"")}){${twinkle[2].replace(/\bfloat\s+/g,"let ")}}
    globalThis.sample=(elapsed,delay,phase,life)=>{const t=max(0,elapsed-delay),shellAge=max(0,elapsed),head=delay===0?1:0,glint=fireworkTwinkle(t,phase),timing={z:life};let fade=0,sparkle=0,vTextTip=0;
    ${scalar} return {expansion,fade,sparkle,vTextTip};};`,context);
  assert.ok(context.sample(.1,0,0,2.6).expansion<.2,"early fire remains near the burst, not instantly fully formed");
  assert.ok(context.sample(2,0,0,2.6).expansion-context.sample(1.2,0,0,2.6).expansion>.2,"readable letters keep moving outward");
  assert.ok(context.sample(1.1,.3,0,2.6).fade>.25,"the reading phase still has fiery trails");
  const {timing,detail,velocity}=word.geometry.attributes, late=[];
  for(let i=0;i<timing.count;i++) if(timing.getW(i)===4 && timing.getY(i)===0 && velocity.getZ(i)===0) {
    assert.ok(context.sample(.7,0,detail.getY(i),timing.getZ(i)).fade>.5,"the early message is complete enough to read");
    late.push(context.sample(2.3,0,detail.getY(i),timing.getZ(i)).fade);
    assert.equal(context.sample(3,0,detail.getY(i),timing.getZ(i)).fade,0);
  }
  assert.ok(Math.min(...late)===0 && Math.max(...late)>.1,"head burnouts break up the letters instead of fading a uniform sign");
  const shimmer=Array.from({length:60},(_,index)=>context.sample(2,0,index/60*Math.PI*2,2.8));
  assert.ok(shimmer.every(sample=>sample.vTextTip>.5),"fading letter heads become individual star tips");
  assert.ok(Math.max(...shimmer.map(sample=>sample.sparkle))>.6 && Math.min(...shimmer.map(sample=>sample.sparkle))<.05,
    "seeded bright flashes alternate with genuinely dim embers during the outgoing text");
  f.fireworks.dispose();
});

test("songi places three cool spherical shells behind warm foreground letters on every viewing basis",()=>{
  const f=fixture();
  for(const mobile of [true,false]) for(const grand of [true,false]) {
    const geo=f.fireworkGeometry(1729,mobile,"songi",grand),{timing,velocity,backdrop,sparkColor}=geo.attributes;
    const scale=grand?1.8:1, centers=new Set(), colors=new Set();let shellHeads=0;
    assert.ok(geo.getAttribute("position").count<(mobile?20000:32000),"the added shells remain within the mobile particle budget");
    for(let i=0;i<timing.count;i++) {
      if(timing.getW(i)===4) {
        assert.equal(backdrop.getZ(i),0);
        assert.ok(sparkColor.getX(i)>sparkColor.getZ(i)*1.8,"letters stay distinctly warm against the blue shells");
      }
      if(timing.getW(i)!==11)continue;
      centers.add(`${backdrop.getX(i)},${backdrop.getY(i)},${backdrop.getZ(i)}`);
      colors.add(`${sparkColor.getX(i)},${sparkColor.getY(i)},${sparkColor.getZ(i)}`);
      assert.ok(sparkColor.getZ(i)>sparkColor.getX(i)*2,"background shells have a separate cool palette");
      assert.ok(Math.abs(backdrop.getZ(i)-58*scale)<1e-5);
      if(timing.getY(i)===0)shellHeads++;
      for(const t of [0,.8,1.6,3.1]) {
        const travel=(1-Math.exp(-.46*t))/.46;
        assert.ok(backdrop.getZ(i)+velocity.getZ(i)*travel>18*scale,"the entire three-dimensional shell stays behind the text plane");
      }
      assert.ok(timing.getX(i)+timing.getY(i)+timing.getZ(i)<5,"background fire expires before the final letter glitter");
    }
    assert.equal(centers.size,3);assert.equal(colors.size,3);assert.equal(shellHeads,3*(mobile?96:160));
    geo.dispose();
  }
  f.fireworks.dispose();
});

test("the restored greeting particles and original greeting/puppy motion match the approved baseline",()=>{
  // SHA snapshots were calculated from the approved pre-flower-change source.
  // Only greeting attributes and the two restored shader branches are included:
  // new flowers may evolve without silently changing the user's chosen greeting.
  const baselines=[
    [true,true,"35332564b774ab4ddbe0b4751dd564d9e8c0691e647a3bb73bf36ff2f081403b"],
    [true,false,"a731b0d7cb8136f805134648da78562a39c6a46f5c625bbe448a51e7dfac2efb"],
    [false,true,"75bd1174b2688e17ae61abaef628183937870653cbcfbf14b8442887f0d7bff8"],
    [false,false,"e8e30601ddcb7549e1b532009f31a03e8132cd8840c222b554d0ae0407c6b09c"],
  ];
  const shaderHash=block=>createHash("sha256").update(block.replace(/\/\/[^\n]*/g,"").replace(/\s+/g,"")).digest("hex");
  for(const [mobile,grand,expected] of baselines) {
    const f=fixture({mobile,grand,reflectWater:true});f.fireworks.apply([event("restored","songi")],100000);
    const object=f.scene.children[0],{timing}=object.geometry.attributes,hash=createHash("sha256");
    for(const name of ["position","velocity","sparkColor","timing","detail","glyphCenter","backdrop"]) {
      const attr=object.geometry.attributes[name],values=[];
      for(let i=0;i<timing.count;i++)if(timing.getW(i)===4)for(let axis=0;axis<attr.itemSize;axis++)values.push(attr.array[i*attr.itemSize+axis]);
      hash.update(new Uint8Array(new Float32Array(values).buffer));
    }
    assert.equal(hash.digest("hex"),expected,"the exact text destinations, phase, timing, colour and alpha are restored");
    const shader=object.material.vertexShader,begin=shader.indexOf("if (timing.w > 3.5 && timing.w < 4.5) {"),end=shader.indexOf("} else if(timing.w>11.5",begin);
    assert.equal(shaderHash(shader.slice(begin,end)),"527b76d29e4e3a10162d09ab562bdcc03300e0ec207db469d9ee284a202fad99");
    const puppy=shader.match(/else if\(timing.w>13\.5 && timing.w<14\.5\) \{([\s\S]*?)\n\s+\} else if/)[1];
    assert.equal(shaderHash(puppy),"413d81ad99e6252cd0ebba27df90826b4e4b00f6996e5258e8e373d7d2c524b5");
    f.fireworks.dispose();
  }
});

test("the greeting's distant shells stay behind its screen position when the phrase is high above the viewer",()=>{
  const f=fixture();f.fireworks.apply([event("aligned","songi")],100000);
  const object=f.scene.getObjectByName("beach-fireworks-aligned");
  assert.ok(object.material.vertexShader.includes("normalize(uTextCenter-uCameraPosition)*backdrop.z"));
  for(const pitch of [0,-.2,-.5]) {
    f.camera.rotation.set(pitch,0,0); f.camera.updateMatrixWorld(true);
    f.fireworks.update(f.camera,102550,844);
    const center=object.material.uniforms.uTextCenter.value, factor=object.material.uniforms.uTextScale.value;
    const behind=center.clone().sub(f.camera.position).normalize().multiplyScalar(58*1.8*factor).add(center);
    const frontPixel=center.clone().project(f.camera), backPixel=behind.project(f.camera);
    assert.ok(Math.abs(frontPixel.x-backPixel.x)<1e-7 && Math.abs(frontPixel.y-backPixel.y)<1e-7,
      "depth changes size without dragging the background flower below the phrase");
    assert.ok(backPixel.z>frontPixel.z);
  }
  f.fireworks.dispose();
});

test("songi preserves both spherical waves, launches one rose, three tulips and five cosmos, then ends with the puppy",()=>{
  for (const mobile of [true,false]) for (const grand of [true,false]) {
    const f=fixture({mobile,grand,reflectWater:true}); f.fireworks.apply([event("encore","songi")],100000);
    const object=f.scene.getObjectByName("beach-fireworks-encore"), shader=object.material.vertexShader;
    const scalar=shader.slice(shader.indexOf("float slot=step"),shader.indexOf("vec3 direction=velocity"))
      .replace(/\b(?:float|vec3)\s+(?=\w+\s*=)/g,"let ");
    const context={step:(edge,x)=>x>=edge?1:0,max:Math.max,exp:Math.exp,vec3:(x,y,z)=>({x,y,z})};
    vm.runInNewContext(`globalThis.sample=(uAge,x,delay=0)=>{const backdrop={x},timing={x:1.35,y:delay,z:2.8};${scalar}return {slot,encore,shellStart,shellAge,life,t};};`,context);
    const {timing,backdrop,flower,flowerCenter,flowerBurn,flowerColor,velocity,sparkColor}=object.geometry.attributes, flashes=[];
    for(let i=0;i<timing.count;i++)if(timing.getW(i)===3&&timing.getX(i)>3)flashes.push(i);
    const starts=flashes.map(i=>timing.getX(i));
    assert.deepEqual(starts.map(t=>Number(t.toFixed(2))),[4.3,4.58,4.9,6.9,7.22,7.55,9.1,10.5,10.64,10.78,11.9,12.02,12.14,12.26,12.38,14.2]);
    const scale=grand?1.8:1;
    for(let slot=0;slot<3;slot++) {
      const x=(slot-1)*19*scale, early=context.sample(2.55,x,.2);
      assert.equal(early.encore,0); assert.ok(Math.abs(early.shellAge-1)<1e-9);
      for(let round=0;round<2;round++) {
        const sample=context.sample(starts[round*3+slot]+.001,x);
        assert.equal(sample.encore,round+1);assert.ok(sample.shellAge<.002);assert.equal(sample.life,1.95);
      }
    }
    const blooms=object.geometry.userData.songiTimeline.flowers;
    assert.deepEqual(Array.from(blooms,b=>b.kind),["rose",...Array(3).fill("tulip"),...Array(5).fill("cosmos")]);
    const counts=new Map(), heads=new Map();let lastEmber=0,bank=0;
    for(let i=0;i<timing.count;i++)if(timing.getW(i)===11) {
      bank++;
      const start=Number(flower.getW(i).toFixed(2)), bloom=blooms.find(b=>Math.abs(b.start-start)<1e-5);
      assert.ok(bloom,"every reused spherical particle belongs to one of the nine real flowers");
      counts.set(start,(counts.get(start)??0)+1);
      if(flowerBurn.getX(i)===0)heads.set(start,(heads.get(start)??0)+1);
      for(const [axis,get] of ["getX","getY","getZ"].entries()) assert.ok(Math.abs(flowerCenter[get](i)-bloom.center[axis])<1e-5);
      assert.ok(flowerBurn.getX(i)>=0&&flowerBurn.getX(i)<=.28001);
      assert.ok(Math.abs(flowerBurn.getY(i)-.28/(mobile?2:4))<1e-6,"streak length follows the actual delayed sample spacing");
      assert.ok(flowerBurn.getZ(i)>0&&flowerBurn.getZ(i)<=1);
      assert.ok([flowerColor.getX(i),flowerColor.getY(i),flowerColor.getZ(i)].every(n=>n>=0&&n<=1));
      lastEmber=Math.max(lastEmber,start+flowerCenter.getW(i));
    }
    assert.equal(bank,mobile?3168:7680,"flowers reuse the existing spherical bank rather than adding a particle cloud");
    assert.equal(counts.size,9);
    for(const bloom of blooms) {
      const expected=bloom.kind==="rose"?(mobile?192:320):bloom.kind==="tulip"?(mobile?128:192):(mobile?96:128);
      assert.equal(heads.get(bloom.start),expected);assert.equal(counts.get(bloom.start),expected*(mobile?3:5));
      const flash=flashes.find(i=>Math.abs(timing.getX(i)-bloom.start)<1e-5);assert.notEqual(flash,undefined);
      for(const [axis,get] of ["getX","getY","getZ"].entries()) assert.ok(Math.abs(backdrop[get](flash)-bloom.center[axis])<1e-5,"flower and rocket flash use the same destination");
    }
    assert.ok(lastEmber>14.2&&lastEmber<=14.38001,"cosmos embers bridge into the puppy finale without extending the event");
    for(const flash of flashes) {
      const rocket=[];
      for(let i=0;i<timing.count;i++)if(timing.getW(i)===12&&timing.getX(i)===timing.getX(flash))rocket.push(i);
      assert.equal(rocket.length,36);
      for(const i of rocket) for(const getter of ["getX","getY","getZ"])
        assert.equal(backdrop[getter](i),backdrop[getter](flash),"the rocket reaches the exact flash center");
      assert.ok(timing.getZ(rocket[0])>=1.29&&timing.getZ(rocket[0])<=1.41);
    }
    assert.ok(starts[0]-1.3<3.1);
    assert.ok(starts[3]-1.3<starts[2]+1.95&&starts[6]-1.3<starts[5]+1.95);
    assert.ok(starts.at(-1)-1.4<lastEmber);
    const finaleHeads=[],colours=new Set();
    for(let i=0;i<timing.count;i++)if(timing.getW(i)===14) {
      assert.ok(timing.getX(i)+timing.getY(i)+timing.getZ(i)<17.6);
      if(timing.getY(i)===0)finaleHeads.push(i);
      colours.add([sparkColor.getX(i),sparkColor.getY(i),sparkColor.getZ(i)].join(","));
      assert.ok(Math.abs(velocity.getX(i))<=37.5*scale&&Math.abs(velocity.getY(i))<=37.5*scale);
    }
    assert.equal(finaleHeads.length,1867);assert.equal(colours.size,2);
    assert.ok(object.geometry.attributes.position.count<=(mobile?20000:32000));
    f.fireworks.update(f.camera,115350,844);assert.equal(f.scene.children.length,2);
    f.fireworks.update(f.camera,118000,844);assert.equal(f.scene.children.length,0);f.fireworks.dispose();
  }
});

test("the puppy finale fits portrait and landscape views, including the sky-only lying camera",()=>{
  for(const grand of [true,false]) for(const aspect of [320/900,390/844,16/9]) for(const skyOnly of [true,false]) {
    const f=fixture({mobile:true,grand,reflectWater:true});
    const target=skyOnly?[0,90,28]:grand?[0,66,-205]:[0,72,-45];
    f.camera.aspect=aspect;f.camera.updateProjectionMatrix();f.camera.lookAt(...target);
    if(skyOnly)f.camera.layers.set(1);
    f.setTime(115350);f.fireworks.apply([event("final-fit","songi")],115350);f.fireworks.update(f.camera,115350,844);
    const object=f.scene.getObjectByName("beach-fireworks-final-fit"),u=object.material.uniforms;
    const {timing,velocity,backdrop}=object.geometry.attributes;
    assert.ok(u.uFinalScale.value>0&&u.uFinalScale.value<=1);
    for(let i=0;i<timing.count;i++)if(timing.getW(i)===14&&timing.getY(i)===0) {
      const p=u.uTextCenter.value.clone()
        .addScaledVector(u.uTextRight.value,(backdrop.getX(i)+velocity.getX(i)*1.04)*u.uFinalScale.value)
        .addScaledVector(u.uTextUp.value,(backdrop.getY(i)+velocity.getY(i)*1.04)*u.uFinalScale.value).project(f.camera);
      assert.ok(Math.abs(p.x)<.9&&Math.abs(p.y)<.9,`outline fits ${aspect} grand=${grand} lying=${skyOnly}: ${p.toArray()}`);
    }
    assert.equal(f.scene.children[1].material.uniforms.uFinalScale,u.uFinalScale,"the reflection shares the same fit");
    f.fireworks.dispose();
  }
});

test("larger flowers fit independently of the greeting on phones, wide views and the lookout, with matching rocket endpoints",()=>{
  for(const [grand,summitDisplay] of [[false,false],[true,false],[true,true]])
    for(const aspect of [320/900,390/844,16/9]) for(const skyOnly of summitDisplay?[false]:[true,false]) {
    const f=fixture({mobile:true,grand,summitDisplay,reflectWater:true});
    const target=summitDisplay?[0,72,395]:skyOnly?[0,90,28]:grand?[0,66,-205]:[0,72,-45];
    f.camera.position.set(0,summitDisplay?22:1.55,summitDisplay?102.2:10);
    f.camera.aspect=aspect;f.camera.updateProjectionMatrix();f.camera.lookAt(...target);
    if(skyOnly)f.camera.layers.set(1);
    f.fireworks.apply([event("flower-fit","songi")],100000);f.fireworks.update(f.camera,112900,844);
    const object=f.scene.getObjectByName("beach-fireworks-flower-fit"),u=object.material.uniforms;
    const {timing,flower,flowerCenter,flowerBurn}=object.geometry.attributes;
    assert.ok(u.uFlowerScale.value>0&&u.uFlowerScale.value<=1);
    const ray=u.uTextCenter.value.clone().sub(f.camera.position).normalize(),back=new THREE.Vector3().crossVectors(u.uTextRight.value,u.uTextUp.value);
    for(let i=0;i<timing.count;i++)if(timing.getW(i)===11&&flowerBurn.getX(i)===0) {
      // Use the maximum expansion and both depth extremes, which bound the
      // actual shorter lived moving flower and its gravity drop.
      for(const depthSign of [-1,1]) {
        const p=u.uTextCenter.value.clone().addScaledVector(ray,flowerCenter.getZ(i)*u.uFlowerScale.value)
          .addScaledVector(u.uTextRight.value,(flowerCenter.getX(i)+flower.getX(i)*1.28)*u.uFlowerScale.value)
          .addScaledVector(u.uTextUp.value,(flowerCenter.getY(i)+flower.getY(i)*1.28-.9)*u.uFlowerScale.value)
          .addScaledVector(back,depthSign*Math.abs(flower.getZ(i))*1.28*u.uFlowerScale.value).project(f.camera);
        assert.ok(Math.abs(p.x)<.9&&Math.abs(p.y)<.9,`complete flower fits ${aspect} grand=${grand} summit=${summitDisplay} sky=${skyOnly}: ${p.toArray()}`);
      }
    }
    const scaleExpressions=[...object.material.vertexShader.matchAll(/float showScale=([^;]+);/g)].map(match=>
      new Function("timing","uFinalScale","uFlowerScale","uTextScale",`return ${match[1]};`));
    assert.equal(scaleExpressions.length,2,"both rocket and primary flash choose their display's scale");
    for(const choose of scaleExpressions)for(const launch of object.geometry.userData.songiTimeline.flowers)
      assert.equal(choose({x:launch.start},.2,.61,.8),.61,"each flower rocket meets the independently fitted flower centre");
    for(const choose of scaleExpressions) {
      assert.equal(choose({x:4.3},.2,.61,.8),.8);assert.equal(choose({x:14.2},.2,.61,.8),.2);
    }
    assert.equal(f.scene.children[1].material.uniforms.uFlowerScale,u.uFlowerScale);
    f.fireworks.dispose();
  }
});

test("late arrivals join the puppy at the current time while legacy twelve-second greetings still expire on time",()=>{
  const f=fixture();f.setTime(115350);f.fireworks.apply([event("late-puppy","songi")],115350);f.fireworks.update(f.camera,115350,844);
  assert.equal(f.scene.children[0].material.uniforms.uAge.value,15.35);
  f.fireworks.update(f.camera,118000,844);assert.equal(f.scene.children.length,0);
  f.setTime(120000);f.fireworks.apply([{...event("legacy","songi",120000),durationMs:12000}],120000);
  assert.equal(f.scene.children.length,2);f.fireworks.update(f.camera,132000,844);assert.equal(f.scene.children.length,0);
  f.fireworks.apply([{...event("invalid","festival",140000),durationMs:18000}],140000);
  assert.equal(f.scene.children.length,0,"longer windows are exclusive to the songi choreography");f.fireworks.dispose();
});

test("the approved festival keeps its exact six seeded geometries, shaders and reflection settings",()=>{
  const f=fixture(), digest=value=>createHash("sha256").update(value).digest("hex");
  const fixtures=[
    [true,0,"33dc3fc508dc37d06d1b1fb66a739c6e91d3cb6da69633c72c455599f69c3e0c"],
    [true,1729,"cd57c07717b41c6d2f42787afc03ad992f1033b602e01bc93a0bac6df3309a8b"],
    [true,1234567,"d1e0a5cfe0a4eb4033f3ddaacad1654485cf4259533e95cb8e8666f8b3e31291"],
    [false,0,"12f91cbc5de37ef68d07162c302b0ab5e7914d5408516913d6143b7c89b5650d"],
    [false,1729,"7fc7041b3fbf701c988555768bdd2f35e0e89ab18214eae1d4cb053c5f0b89d2"],
    [false,1234567,"081fb4449bd11bd4e438e150ed10037bca6c53321310eb1bb9ed0dcc71259f5f"],
  ];
  for(const [mobile,seed,expected] of fixtures) {
    const geometry=f.fireworkGeometry(seed,mobile,"festival",true), hash=createHash("sha256");
    for(const [name,a]of Object.entries(geometry.attributes)) { hash.update(name); hash.update(Buffer.from(a.array.buffer)); }
    hash.update(JSON.stringify(geometry.userData)); assert.equal(hash.digest("hex"),expected); geometry.dispose();
  }
  f.fireworks.apply([event()],100000);
  for(const [i,object] of f.scene.children.entries()) {
    const material=object.material;
    assert.equal(digest(material.vertexShader),"46b6acaedf3d141c9664cd5b03f23b7103cb16f5edc12a98c4745413ad99d852");
    assert.equal(digest(material.fragmentShader),"68d7f6c394b878cebd09bb3e0060fa4e2874271cc3151e884cbd15eeba4c8d05");
    assert.deepEqual([material.depthTest,material.depthWrite,material.blending,material.toneMapped,object.renderOrder,object.layers.mask],
      [true,false,THREE.AdditiveBlending,false,i===0?6:5,i===0?3:1]);
    assert.equal(material.uniforms.uReflection.value,i); assert.equal(material.uniforms.uGrand.value,1);
  }
  f.fireworks.dispose();
});

test("personal shows have no fans, and love is five sequential deep heart shells instead of text",()=>{
  const f=fixture();
  for(const variant of ["songi","love"]) {
    const geometry=f.fireworkGeometry(92,true,variant,true), timing=geometry.getAttribute("timing"), positions=geometry.getAttribute("position");
    const heartShells=new Map(); let gold=0, glyphCount=0;
    for(let i=0;i<timing.count;i++) {
      assert.notEqual(timing.getW(i),8,"the fountain fan belongs only to the festival");
      if(timing.getW(i)===4) glyphCount++;
      if(timing.getW(i)===10) gold++;
      if(timing.getW(i)===9 && timing.getY(i)===0) {
        const key=[positions.getX(i),positions.getY(i),positions.getZ(i),timing.getX(i)].join(",");
        const list=heartShells.get(key)??[]; list.push(i); heartShells.set(key,list);
      }
    }
    if(variant==="love") {
      assert.equal(heartShells.size,5); assert.equal(glyphCount,0); assert.equal(geometry.userData.phrase,""); assert.ok(gold>7000);
      const vectors=geometry.getAttribute("velocity");
      for(const indices of heartShells.values()) {
        const notch=vectors.getY(indices[0]), highest=Math.max(...indices.map(i=>vectors.getY(i)));
        assert.ok(highest>notch+5,"two upper lobes rise above the central heart notch");
        assert.ok(Math.min(...indices.map(i=>vectors.getY(i)))<-10,"the heart has a pointed lower lobe");
        assert.ok(Math.max(...indices.map(i=>vectors.getZ(i)))-Math.min(...indices.map(i=>vectors.getZ(i)))>6,"overlapping filaments have real world depth");
      }
    } else { assert.equal(glyphs(geometry).length,659); assert.ok(glyphCount>10000); assert.equal(heartShells.size,0); }
    geometry.dispose();
  }
  f.fireworks.dispose();
});

test("all shows share the same choreography on the beach and Uyuni, and only Uyuni draws a reflection",()=>{
  for(const variant of ["festival","songi","love","bloom","saturn","willow","stardust","offbeat","aurora","jewels"]) {
    const salt=fixture(), shore=fixture({mobile:true,grand:true,reflectWater:false});
    for(const f of [salt,shore]) {
      f.fireworks.apply([event(variant,variant)],100000);
      f.fireworks.update(f.camera,105000,844);
    }
    const [main,reflection]=salt.scene.children, [coastal]=shore.scene.children;
    assert.equal(salt.scene.children.length,2); assert.equal(shore.scene.children.length,1);
    assert.equal(main.geometry,reflection.geometry);
    assert.equal(coastal.geometry.userData.variant,variant);
    for(const name of Object.keys(main.geometry.attributes))
      assert.deepEqual(coastal.geometry.attributes[name].array,main.geometry.attributes[name].array);
    assert.equal(coastal.material.vertexShader,main.material.vertexShader);
    assert.equal(coastal.material.uniforms.uAge.value,5);
    shore.fireworks.dispose(); salt.fireworks.dispose();
  }
});

test("all bamboo shows burst toward the skyline and retain legible lettering from the front rail",()=>{
  for(const variant of ["festival","songi","love","bloom","saturn","willow","stardust","offbeat","aurora","jewels"]) {
    const summit=fixture({mobile:true,grand:true,summitDisplay:true}), ocean=fixture({mobile:true,grand:true});
    summit.fireworks.apply([event("summit",variant)],100000);
    ocean.fireworks.apply([event("shore",variant)],100000);
    assert.equal(summit.scene.children.length,1);
    const object=summit.scene.children[0], geo=object.geometry;
    assert.deepEqual(geo.attributes.timing.array,ocean.scene.children[0].geometry.attributes.timing.array);
    assert.equal(geo.userData.variant,variant);
    if(variant==="songi") assert.deepEqual(glyphs(geo),glyphs(ocean.scene.children[0].geometry));
    for(const x of [-3.75,0,3.75]) {
      const eyeY=22;
      summit.camera.position.set(x,eyeY,102.2);
      summit.camera.lookAt(x,eyeY-Math.tan(.20)*100,202.2);
      summit.fireworks.update(summit.camera,105000,844);
      const {position,timing}=geo.attributes;
      for(let i=0;i<timing.count;i++) if(timing.getW(i)===3) {
        const center=new THREE.Vector3().fromBufferAttribute(position,i);
        assert.ok(center.z>260 && center.distanceTo(summit.camera.position)<summit.camera.far && center.y>eyeY,`${variant} shell ${center.toArray()} must remain over the river and within the camera's visible distance`);
        const ndc=center.project(summit.camera);
        assert.ok(ndc.z<1 && Math.abs(ndc.x)<1 && Math.abs(ndc.y)<1,"each shell center is visible from the front bench");
      }
      if(variant==="songi") {
        const {uTextCenter,uTextUp,uTextRight,uTextScale}=object.material.uniforms;
        assert.ok(uTextCenter.value.z>350);
        for(const [dx,dy] of glyphs(geo)) {
          const p=uTextCenter.value.clone().addScaledVector(uTextRight.value,dx*uTextScale.value).addScaledVector(uTextUp.value,dy*uTextScale.value).project(summit.camera);
          assert.ok(Math.abs(p.x)<1 && Math.abs(p.y)<1,"the full message fits in the portrait lookout view");
        }
      }
    }
    summit.fireworks.dispose(); ocean.fireworks.dispose();
  }
});

test("reflection shares geometry and synchronized uniforms while respecting opaque depth and sky layers",()=>{
  const f=fixture(); f.fireworks.apply([event()],100000); f.fireworks.update(f.camera,105000,1688);
  const main=f.scene.getObjectByName("beach-fireworks-festival"), reflected=f.scene.getObjectByName("uyuni-fireworks-reflection-festival");
  assert.equal(f.scene.children.length,2); assert.equal(main.geometry,reflected.geometry);
  assert.notEqual(main.material,reflected.material);
  for(const name of ["uAge","uViewport","uTextCenter","uTextRight","uSpark","uCameraPosition"]) assert.equal(main.material.uniforms[name],reflected.material.uniforms[name]);
  assert.equal(main.material.uniforms.uReflection.value,0); assert.equal(reflected.material.uniforms.uReflection.value,1);
  assert.equal(main.material.uniforms.uAge.value,5); assert.equal(reflected.material.depthTest,true); assert.equal(reflected.material.depthWrite,false);
  assert.equal(reflected.visible,true); assert.equal(reflected.layers.isEnabled(1),false);
  f.camera.layers.set(1); f.fireworks.update(f.camera,105100); assert.equal(reflected.visible,false);
  f.camera.layers.set(0); f.camera.position.y=.01; f.fireworks.update(f.camera,105200); assert.equal(reflected.visible,false);
  f.camera.position.y=1.55; f.fireworks.update(f.camera,105300); assert.equal(reflected.visible,true);
  f.fireworks.dispose();
});

test("water-projected virtual reflection has the same screen location and foreground depth",()=>{
  // Test the production shader's ray-plane scalar expression, including edge cameras.
  const f=fixture(); f.fireworks.apply([event()],100000);
  const shader=f.scene.children[0].material.vertexShader;
  const expression=shader.match(/float along=([^;]+);/)[1].replaceAll("uCameraPosition.y","eyeY");
  const intersect=new Function("eyeY","denominator","max",`return ${expression}`);
  for(const eye of [new THREE.Vector3(0,1.55,10),new THREE.Vector3(12,2.03,27),new THREE.Vector3(-10,18,40)]) {
    f.camera.position.copy(eye); f.camera.lookAt(0,0,-35); f.camera.updateMatrixWorld();
    for(const actual of [new THREE.Vector3(-70,68,-85),new THREE.Vector3(0,142,-65),new THREE.Vector3(36,88,12)]) {
      const reflected=actual.clone(); reflected.y=.016-reflected.y;
      const along=intersect(eye.y,eye.y-reflected.y,Math.max), surface=eye.clone().lerp(reflected,along);
      assert.ok(along>0 && along<1); assert.ok(Math.abs(surface.y-.018)<1e-10);
      const a=reflected.clone().project(f.camera), b=surface.clone().project(f.camera);
      assert.ok(Math.abs(a.x-b.x)<1e-6 && Math.abs(a.y-b.y)<1e-6,"water depth changes occlusion without shifting the mirror image");
      assert.ok(eye.distanceTo(surface)<eye.distanceTo(reflected));
    }
  }
  assert.match(shader,/smoothstep\(3\.45,3\.85,length\(p\.xz-vec2\(7\.0,7\.0\)\)\)/,"the dry island masks reflected sparks");
  f.fireworks.dispose();
});

test("fine streak shader stays continuous along its centre and thin across the gold trail",()=>{
  const f=fixture(); f.fireworks.apply([event()],100000);
  const fragment=f.scene.children[0].material.fragmentShader, body=fragment.match(/float fireworkStrokeGlow\([^)]*\)\s*\{([^}]+)\}/)[1];
  const smoothstep=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  const glow=new Function("along","across","aspect","exp","pow","max","smoothstep","abs",body.replace(/\bfloat\s+/g,"let "));
  const at=(x,y)=>glow(x,y,.1,Math.exp,Math.pow,Math.max,smoothstep,Math.abs);
  for(let x=-.32;x<=.32;x+=.01) assert.ok(at(x,0)>.99,"overlapping oriented samples join without dotted gaps");
  assert.equal(at(.5,0),0); assert.ok(at(0,.08)<.05); assert.ok(at(0,.02)>.6);
  for(let across=-.5;across<=.5;across+=.01) {
    assert.ok(Number.isFinite(at(0,across))); assert.ok(Math.abs(at(0,across)-at(0,-across))<1e-10,"both halves remain defined on mobile GLSL implementations");
  }
  f.fireworks.dispose();
});

test("the smaller bamboo show retains its geometry and repeated frames allocate no new GPU resources",()=>{
  const legacy=fixture({mobile:true}), explicit=fixture({mobile:true,grand:false,reflectWater:false});
  legacy.fireworks.apply([event()],100000); explicit.fireworks.apply([event()],100000);
  assert.equal(legacy.scene.children.length,1); assert.equal(explicit.scene.children.length,1);
  for(const name of Object.keys(legacy.scene.children[0].geometry.attributes))
    assert.deepEqual(legacy.scene.children[0].geometry.attributes[name].array,explicit.scene.children[0].geometry.attributes[name].array);
  legacy.fireworks.dispose(); explicit.fireworks.dispose();
  const f=fixture(); f.fireworks.apply([event()],100000);
  const objects=[...f.scene.children], geometry=objects[0].geometry, resources=[geometry,...objects.map(o=>o.material)], disposed=new Map();
  for(const resource of resources) resource.addEventListener("dispose",()=>disposed.set(resource,(disposed.get(resource)??0)+1));
  const attributes=Object.values(geometry.attributes).map(a=>a.array), uniforms=objects[0].material.uniforms;
  for(let i=0;i<180;i++) { f.setTime(100000+i*16); f.fireworks.apply([event()],100000+i*16); f.fireworks.update(f.camera,100000+i*16); }
  assert.deepEqual(f.scene.children,objects); assert.equal(objects[0].material.uniforms,uniforms);
  Object.values(geometry.attributes).forEach((a,i)=>assert.equal(a.array,attributes[i]));
  f.setTime(112000); f.fireworks.update(f.camera,112000); assert.equal(f.scene.children.length,0);
  for(const resource of resources) assert.equal(disposed.get(resource),1);
  f.fireworks.dispose(); for(const resource of resources) assert.equal(disposed.get(resource),1);
});

test("late grand shows and their reflection share one lifetime without replay or extra lights",()=>{
  const f=fixture(); f.fireworks.apply([event("late","festival",95000)],100000); f.fireworks.update(f.camera);
  assert.equal(f.scene.children[0].material.uniforms.uAge.value,5);
  f.setTime(101000); f.fireworks.apply([event("late","festival",95000)],100000); f.fireworks.update(f.camera);
  assert.equal(f.scene.children[0].material.uniforms.uAge.value,6);
  assert.equal(f.scene.children.some(o=>o.isLight),false);
  f.setTime(107000); f.fireworks.update(f.camera); assert.equal(f.scene.children.length,0);
  f.fireworks.apply([event("late","festival",95000)],107000); assert.equal(f.scene.children.length,0);
  f.fireworks.dispose(); f.fireworks.dispose();
});
