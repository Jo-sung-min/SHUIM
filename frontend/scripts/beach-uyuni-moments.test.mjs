import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

const source=stripTypeScriptTypes(await readFile(new URL("../lib/beach/uyuni-moments.ts",import.meta.url),"utf8"))
  .replace(/^import\s+[^\n]+\n/gm,"").replace(/\bexport\s+(?=function\b|class\b|const\b)/g,"");
const event=(id="one",kind="sparkler",extra={})=>({id,kind,fromPid:"visitor",fromNick:"방문자",x:0,z:3,yaw:0,
  startedAt:100000,durationMs:kind==="sparkler"?12000:40000,...(kind==="sparkler"?{letter:"L"}:{wish:"모두 평안하기를",color:"amber"}),...extra});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≈ ${b}`);
function fixture({dom=false,floor=()=>0}={}) {
  let now=100000; const drawn=[];
  const context={THREE,Date:{now:()=>now}};
  if(dom) context.document={createElement(tag) {
    assert.equal(tag,"canvas");
    const ctx={fillRect(){},strokeRect(){},beginPath(){},arc(){},fill(){},measureText:s=>({width:Array.from(s).length*(parseFloat(ctx.font)||32)}),fillText:s=>drawn.push(s)};
    return {getContext:()=>ctx};
  }};
  vm.runInNewContext(`${source}\nglobalThis.api={UyuniMoments,sparklerPath,sampleWishLantern};`,context);
  const scene=new THREE.Scene(), moments=new context.api.UyuniMoments(scene,{floorHeight:floor,now:()=>now});
  const camera=new THREE.PerspectiveCamera(62,1, .1,520); camera.position.set(0,1.6,5);
  return {scene,moments,camera,drawn,...context.api,setTime:value=>now=value,
    object:name=>scene.getObjectByName(name), sparks:()=>scene.getObjectByName("uyuni-moments").children.filter(o=>o.isPoints)};
}

test("all four paths form readable uppercase letters with no diagonal E pen-up connector",()=>{
  const f=fixture();
  for(const letter of ["L","O","V","E"]) {
    const points=f.sparklerPath(letter);
    assert.equal(points.length,128);
    assert.ok(points.every(p=>[p.x,p.y,p.progress].every(Number.isFinite)));
    assert.ok(Math.min(...points.map(p=>p.y))<-.73 && Math.max(...points.map(p=>p.y))>.73);
    close(points[0].progress,0); close(points.at(-1).progress,1);
    if(letter==="L") assert.ok(points.every(p=>Math.abs(p.x+.5)<1e-6||Math.abs(p.y+.75)<1e-6));
    if(letter==="E") assert.ok(points.every(p=>Math.abs(p.x+.5)<1e-6||Math.abs(p.y)<1e-6||Math.abs(Math.abs(p.y)-.75)<1e-6));
    if(letter==="O") { close(points[0].x,points.at(-1).x); close(points[0].y,points.at(-1).y); }
    if(letter==="V") assert.ok(points.some(p=>Math.abs(p.x)<.02&&p.y<-.72));
  }
  assert.equal(f.sparklerPath("Q").length,0); assert.equal(f.sparklerPath("L",1).length,0);
  f.moments.dispose();
});

test("progressive sparks use shared letter buffers, hotel floor height and readable faces from both sides",()=>{
  const f=fixture({floor:()=>.48}); f.moments.apply([event(),event("two","sparkler",{letter:"L",x:2})],100000);
  const [one,two]=f.sparks(); assert.equal(one.geometry,two.geometry);
  close(one.position.y,2.28); close(one.position.z,.5);
  f.camera.aspect=390/844; f.camera.position.set(0,2.03,3); f.camera.updateProjectionMatrix(); f.camera.updateMatrixWorld();
  for(const letter of ["L","O","V","E"]) for(const p of f.sparklerPath(letter)) {
    const projected=new THREE.Vector3(p.x,p.y,0).add(one.position).project(f.camera);
    assert.ok(Math.abs(projected.x)<.9 && Math.abs(projected.y)<.9,"the owner's portrait view contains the entire letter");
  }
  f.setTime(102600); f.moments.update(f.camera,102600,844);
  close(one.material.uniforms.uAge.value,2.6); assert.equal(one.material.uniforms.uSide.value,1);
  const details=one.geometry.getAttribute("detail");
  assert.ok(Array.from({length:128},(_,i)=>details.getX(i)).filter(progress=>progress<=.5).length>60);
  f.camera.position.z=-4; f.moments.update(f.camera,102600,844); assert.equal(one.material.uniforms.uSide.value,-1);
  f.moments.setQuality("low"); f.moments.update(f.camera,102600,844);
  assert.equal(one.geometry.drawRange.count,288);
  const lowSparks=Array.from({length:32},(_,i)=>details.getX(256+i));
  assert.ok(Math.min(...lowSparks)<.05 && Math.max(...lowSparks)>.95,"low quality still emits throughout the whole letter");
  f.moments.dispose();
});

test("absolute server time does not restart on duplicate snapshots, late arrival or backwards local clock",()=>{
  const f=fixture(); f.setTime(1000); f.moments.apply([event()],103000);
  const spark=f.sparks()[0]; close(spark.material.uniforms.uAge.value,3);
  f.setTime(2000); f.moments.apply([event()],104000); assert.equal(f.sparks()[0],spark); close(spark.material.uniforms.uAge.value,4);
  f.moments.apply([],103500); assert.equal(f.sparks()[0],spark,"older empty snapshots cannot remove a current effect");
  f.moments.update(f.camera,500); close(spark.material.uniforms.uAge.value,4);
  f.setTime(3000); f.moments.apply([],105000); assert.equal(f.sparks().length,0);
  f.setTime(4000); f.moments.apply([event()],106000); close(f.sparks()[0].material.uniforms.uAge.value,6);
  f.setTime(10000); f.moments.update(f.camera,10000); assert.equal(f.sparks().length,0);
  f.moments.apply([event()],112000); assert.equal(f.sparks().length,0,"expired IDs cannot be replayed");
  f.moments.dispose();
});

test("full snapshots remove hidden wishes immediately and release their textures and materials",()=>{
  const f=fixture({dom:true}); const wish=event("wish","lantern"); f.moments.apply([wish],100000);
  const tag=f.object("uyuni-wish-tag-wish"), texture=tag.material.map; let textures=0,materials=0;
  texture.addEventListener("dispose",()=>textures++); tag.material.addEventListener("dispose",()=>materials++);
  f.setTime(101000); f.moments.update(f.camera,101000); assert.equal(tag.visible,true);
  f.moments.apply([],101000); assert.equal(f.object("uyuni-wish-tag-wish"),undefined);
  assert.equal(f.object("uyuni-wish-paper").count,0); assert.equal(textures,1); assert.equal(materials,1);
  f.moments.apply([wish],100500); assert.equal(f.object("uyuni-wish-paper").count,0);
  f.moments.dispose(); assert.equal(textures,1);
});

test("one release creates one rounded lantern, inert wish text, flame and tag with no real light",()=>{
  const f=fixture({dom:true,floor:()=>.48}); const wish="<img src=x onerror=alert(1)> 따뜻한 내일";
  f.moments.apply([event("wish","lantern",{wish,color:"rose"})],100000);
  assert.equal(f.object("uyuni-wish-paper").count,1); assert.equal(f.object("uyuni-wish-flames").count,1);
  assert.ok(f.drawn.join("").includes("<img src=x onerror=alert(1)>"));
  let lights=0; f.scene.traverse(object=>{if(object.isLight) lights++;}); assert.equal(lights,0);
  const paper=f.object("uyuni-wish-paper"), position=paper.geometry.getAttribute("position");
  const radii=Array.from({length:position.count},(_,i)=>Math.hypot(position.getX(i),position.getZ(i)));
  assert.ok(Math.max(...radii)>.37 && radii.some(r=>r>.17&&r<.19),"paper bulges above its open narrow base");
  f.setTime(101000); f.moments.update(f.camera,101000);
  const tag=f.object("uyuni-wish-tag-wish"); assert.ok(tag.position.y>1.2); assert.equal(tag.visible,true);
  f.camera.aspect=390/844; f.camera.position.set(0,2.03,3); f.camera.updateProjectionMatrix(); f.camera.updateMatrixWorld();
  f.moments.update(f.camera,101000); f.scene.updateMatrixWorld(true);
  const bodyMatrix=new THREE.Matrix4(); paper.getMatrixAt(0,bodyMatrix);
  for(const [geometry,matrix] of [[paper.geometry,bodyMatrix],[tag.geometry,tag.matrixWorld]]) {
    const vertices=geometry.getAttribute("position");
    for(let i=0;i<vertices.count;i++) {
      const projected=new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(matrix).project(f.camera);
      assert.ok(Math.abs(projected.x)<1 && Math.abs(projected.y)<1,"the owner's portrait view contains the released paper body and full wish tag");
    }
  }
  f.camera.position.set(100,1.6,100); f.moments.update(f.camera,101000); assert.equal(tag.visible,false);
  f.moments.dispose();
  const long=fixture({dom:true}), fullWish="봄".repeat(40)+"🌷".repeat(40);
  long.moments.apply([event("full","lantern",{wish:fullWish,fromNick:"🌷".repeat(100)})],100000);
  assert.equal(long.drawn.slice(1).join(""),fullWish,"the complete eighty-codepoint wish fits its tag without truncation");
  assert.ok(long.drawn.length<=7); long.moments.dispose();
});

test("lantern trajectory and fade are deterministic through forty seconds, including hotel height",()=>{
  const f=fixture(); const e=event("drift","lantern"); const start=f.sampleWishLantern(e,0,.48), end=f.sampleWishLantern(e,40,.48);
  close(start.y,2.23); close(start.z,.8); assert.equal(start.opacity,0); assert.equal(end.opacity,0);
  assert.ok(end.y>16 && Math.hypot(end.x-start.x,end.z-start.z)>1);
  let lastY=start.y;
  for(let age=0;age<=40;age+=.25) { const p=f.sampleWishLantern(e,age,.48); assert.ok(p.y>=lastY); lastY=p.y; assert.ok(p.opacity>=0&&p.opacity<=1); }
  assert.deepEqual(f.sampleWishLantern(e,17,.48),f.sampleWishLantern(e,17,.48));
  assert.notDeepEqual(f.sampleWishLantern(e,17),f.sampleWishLantern({...e,id:"other"},17));
  f.moments.apply([e],100000); f.setTime(139999); f.moments.update(f.camera,139999); assert.equal(f.object("uyuni-wish-paper").count,1);
  f.setTime(140000); f.moments.update(f.camera,140000); assert.equal(f.object("uyuni-wish-paper").count,0);
  f.moments.dispose();
});

test("room budgets are bounded, repeated snapshots allocate nothing and disposal is idempotent",()=>{
  const f=fixture({dom:true}); const events=Array.from({length:40},(_,i)=>[event(`spark${i}`,"sparkler",{letter:["L","O","V","E"][i%4]}),event(`lamp${i}`,"lantern")]).flat();
  f.moments.apply(events,100000); assert.equal(f.sparks().length,32); assert.equal(f.object("uyuni-wish-paper").count,32);
  const geometries=new Set(),materials=new Set(),textures=new Set();
  f.scene.traverse(o=>{if(o.geometry) geometries.add(o.geometry); if(o.material) {materials.add(o.material);if(o.material.map)textures.add(o.material.map);}});
  assert.equal(geometries.size,9); assert.equal(textures.size,32);
  const before=[...f.object("uyuni-moments").children]; f.moments.apply(events,100000); assert.deepEqual(f.object("uyuni-moments").children,before);
  let disposed=0; for(const resource of [...geometries,...materials,...textures]) resource.addEventListener("dispose",()=>disposed++);
  f.moments.dispose(); assert.equal(disposed,geometries.size+materials.size+textures.size); assert.equal(f.scene.children.length,0);
  f.moments.dispose(); f.moments.apply(events,100000); f.moments.update(f.camera,100000); assert.equal(f.scene.children.length,0);
});

test("malformed and changed-ID events cannot inject geometry, text or unbounded coordinates",()=>{
  const f=fixture({dom:true});
  const malformed=[null,{},event("bad","sparkler",{letter:["L"]}),event("bad","sparkler",{letter:"Q"}),event("bad","sparkler",{x:Infinity}),
    event("bad","sparkler",{x:10001}),event("bad","sparkler",{durationMs:100000}),event("bad","sparkler",{startedAt:100001}),
    event("bad","lantern",{wish:"x".repeat(81)}),event("bad","lantern",{wish:null}),event("bad","lantern",{color:"red"}),event("bad","lantern",{color:undefined})];
  f.moments.apply(malformed,100000); assert.equal(f.sparks().length,0); assert.equal(f.object("uyuni-wish-paper").count,0); assert.equal(f.drawn.length,0);
  f.moments.apply([event()],100000); f.moments.apply([event("one","sparkler",{letter:"E"})],100000); assert.equal(f.sparks().length,0);
  f.moments.apply(null,100000); f.moments.apply([],NaN); f.moments.update(f.camera,NaN);
  f.moments.dispose();
});
