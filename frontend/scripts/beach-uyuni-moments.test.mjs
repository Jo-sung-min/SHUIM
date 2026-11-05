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
function fixture({dom=false,floor=()=>0,poseSparkler}={}) {
  let now=100000; const drawn=[];
  const context={THREE,Date:{now:()=>now}};
  if(dom) context.document={createElement(tag) {
    assert.equal(tag,"canvas");
    const ctx={fillRect(){},strokeRect(){},beginPath(){},arc(){},fill(){},measureText:s=>({width:Array.from(s).length*(parseFloat(ctx.font)||32)}),fillText:s=>drawn.push(s)};
    return {getContext:()=>ctx};
  }};
  vm.runInNewContext(`${source}\nglobalThis.api={UyuniMoments,sparklerPath,sampleWishLantern,sampleSparklerTip,sparklerTrailOpacity};`,context);
  const scene=new THREE.Scene(), moments=new context.api.UyuniMoments(scene,{floorHeight:floor,now:()=>now,poseSparkler});
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

test("handheld writing stays at arm's reach and does not mirror when the camera crosses its plane",()=>{
  const f=fixture({floor:()=>.48}); f.moments.apply([event(),event("two","sparkler",{letter:"L",x:2})],100000);
  const [one,two]=f.sparks(); assert.equal(one.geometry,two.geometry);
  close(one.position.y,1.86); close(one.position.z,2.28);
  f.camera.aspect=390/844; f.camera.position.set(0,2.03,-2); f.camera.lookAt(0,1.6,3); f.camera.updateProjectionMatrix(); f.camera.updateMatrixWorld();
  for(const letter of ["L","O","V","E","heart","star"]) for(const p of f.sparklerPath(letter)) {
    const projected=new THREE.Vector3(-p.x*.88,p.y*.88,0).add(one.position).project(f.camera);
    assert.ok(Math.abs(projected.x)<.9 && Math.abs(projected.y)<.9,"the portrait photo view contains the complete handheld drawing");
  }
  f.setTime(102600); f.moments.update(f.camera,102600,844);
  close(one.material.uniforms.uAge.value,2.6); assert.equal(one.material.uniforms.uSide.value,-1);
  const details=one.geometry.getAttribute("detail");
  assert.ok(Array.from({length:128},(_,i)=>details.getX(i)).filter(progress=>progress<=.5).length>60);
  f.camera.position.z=8; f.moments.update(f.camera,102600,844); assert.equal(one.material.uniforms.uSide.value,-1);
  f.moments.setQuality("low"); f.moments.update(f.camera,102600,844);
  assert.equal(one.material.uniforms.uSprays.value,2);
  assert.ok(one.geometry.getAttribute("position").count<3000,"bounded shared particle pool per shape");
  const lowSparks=Array.from({length:256},(_,i)=>details.getX(1024+i));
  assert.ok(Math.min(...lowSparks)<.05 && Math.max(...lowSparks)>.95,"every spray family spans the entire shape");
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
  assert.equal(geometries.size,10); assert.equal(textures.size,32);
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

test("hearts and stars close in one continuous stroke and the live tip uses the same path",()=>{
  const f=fixture();
  for(const shape of ["L","O","V","E","heart","star"]) {
    const path=f.sparklerPath(shape,256);
    for(let i=1;i<path.length;i++) assert.ok(Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y)<.04,"no teleport between strokes");
    if(["O","heart","star"].includes(shape)) {
      close(path[0].x,path.at(-1).x); close(path[0].y,path.at(-1).y);
    }
    for(let i=0;i<path.length;i+=17) {
      const tip=f.sampleSparklerTip(shape,.25+5.6*i/255);
      close(tip.x,path[i].x*.88); close(tip.y,path[i].y*.88);
    }
    f.moments.apply([event(shape,"sparkler",{letter:shape})],100000);
    assert.equal(f.sparks().length,1);
  }
  assert.equal(f.sampleSparklerTip("heart",6).drawing,false);
  f.moments.dispose();
});

test("older segments fade during drawing and the final stroke lingers briefly for a photograph",()=>{
  const f=fixture();
  assert.equal(f.sparklerTrailOpacity(.1,0),0);
  assert.ok(f.sparklerTrailOpacity(3,0)<f.sparklerTrailOpacity(3,.4));
  assert.ok(f.sparklerTrailOpacity(5.8,0)>.25,"the complete outline remains readable for a photograph");
  assert.equal(f.sparklerTrailOpacity(8.5,0),0);
  assert.ok(f.sparklerTrailOpacity(8.5,1)>.5,"newer embers linger after drawing ends");
  assert.equal(f.sparklerTrailOpacity(12,1),0);
  f.moments.dispose();
});

test("one held stick joins the actual palm to the burning tip and a new shape stops the old hand motion",()=>{
  const poses=[];
  const grip=new THREE.Vector3(.3,1.2,2.65);
  const f=fixture({poseSparkler:(pid,tip,age,target)=>{poses.push({pid,tip:tip.clone(),age,target:target.clone()}); return grip;}});
  f.moments.apply([event("old","sparkler",{letter:"heart"})],100000);
  f.setTime(102800); f.moments.update(f.camera,102800);
  const rods=f.object("uyuni-held-sparklers"); assert.equal(rods.count,1);
  const matrix=new THREE.Matrix4(); rods.getMatrixAt(0,matrix);
  const endpoint=new THREE.Vector3(0,.5,0).applyMatrix4(matrix);
  assert.ok(endpoint.distanceTo(poses.at(-1).tip)<1e-6,"the glowing tip is physically the end of the held rod");
  const last=poses.at(-1), direction=last.tip.clone().sub(grip).normalize();
  const bottom=new THREE.Vector3(0,-.5,0).applyMatrix4(matrix);
  assert.ok(bottom.distanceTo(grip.clone().addScaledVector(direction,-.05))<1e-6,"the grip is inside the bottom five centimeters of the stick");
  f.setTime(104000); f.moments.apply([event("old","sparkler",{letter:"heart"}),event("new","sparkler",{letter:"star",startedAt:104000})],104000);
  assert.equal(rods.count,1); assert.equal(f.sparks().length,2,"old embers remain while the next stroke starts");
  assert.equal(f.object("uyuni-sparkler-old").material.uniforms.uStop.value,4);
  assert.equal(f.object("uyuni-sparkler-old").material.uniforms.uHeld.value,0);
  assert.equal(f.object("uyuni-sparkler-new").material.uniforms.uHeld.value,1);
  const calls=poses.length; f.setTime(110000); f.moments.update(f.camera,110000);
  assert.equal(poses.length,calls); assert.equal(rods.count,0,"hand props stop after the drawing while trails finish fading");
  f.moments.apply([],110000); assert.equal(rods.count,0);
  f.moments.dispose();
});

test("leaving a drawing stops new strokes but keeps its fading embers, without cancelling avatar loading",()=>{
  let present=false;
  const f=fixture({poseSparkler:()=>present?new THREE.Vector3(.3,1.2,2.65):null});
  f.moments.apply([event("held","sparkler",{letter:"heart"})],100000);
  const spark=f.sparks()[0], rods=f.object("uyuni-held-sparklers");
  assert.equal(spark.material.uniforms.uStop.value,5.85,"loading a model is not a cancelled stroke");
  present=true; f.setTime(102000); f.moments.update(f.camera,102000); assert.equal(rods.count,1);
  present=false; f.setTime(104000); f.moments.update(f.camera,104000);
  assert.equal(spark.material.uniforms.uStop.value,2); assert.equal(rods.count,0); assert.equal(f.sparks().length,1);
  present=true; f.setTime(105000); f.moments.update(f.camera,105000);
  assert.equal(rods.count,0,"walking back does not restart an interrupted hand stroke");
  f.moments.dispose();
});
