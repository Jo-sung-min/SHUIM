import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import * as timing from "../lib/beach/sparkler-timing.ts";

const source=stripTypeScriptTypes(await readFile(new URL("../lib/beach/uyuni-moments.ts",import.meta.url),"utf8"))
  .replace(/^import\s+[^\n]+\n/gm,"").replace(/\bexport\s+(?=function\b|class\b|const\b)/g,"");
const event=(id="one",kind="sparkler",extra={})=>({id,kind,fromPid:"visitor",fromNick:"방문자",x:0,z:3,yaw:0,
  startedAt:100000,durationMs:kind==="sparkler"?12000:40000,...(kind==="sparkler"?{letter:"L"}:{wish:"모두 평안하기를",color:"amber"}),...extra});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≈ ${b}`);
function fixture({dom=false,floor=()=>0,poseSparkler}={}) {
  let now=100000; const drawn=[];
  const context={THREE,Date:{now:()=>now},...timing};
  if(dom) context.document={createElement(tag) {
    assert.equal(tag,"canvas");
    const ctx={fillRect(){},strokeRect(){},beginPath(){},arc(){},fill(){},measureText:s=>({width:Array.from(s).length*(parseFloat(ctx.font)||32)}),fillText:s=>drawn.push(s)};
    return {getContext:()=>ctx};
  }};
  vm.runInNewContext(`${source}\nglobalThis.api={UyuniMoments,sparklerPath,sparklerHand,sampleWishLantern,sampleSparklerTip,sparklerTrailOpacity};`,context);
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
  close(one.position.x,.10); close(one.position.y,1.86); close(one.position.z,2.40);
  f.camera.aspect=390/844; f.camera.position.set(0,2.03,-2); f.camera.lookAt(0,1.6,3); f.camera.updateProjectionMatrix(); f.camera.updateMatrixWorld();
  for(const letter of ["L","O","V","E","heart","star"]) for(let i=0;i<=240;i++) {
    const p=f.sampleSparklerTip(letter,timing.SPARKLER_DRAW_START+i*.01,f.sparklerHand("one"));
    const projected=new THREE.Vector3(-p.x,p.y,0).add(one.position).project(f.camera);
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
  const sprays=Array.from({length:details.count},(_,i)=>i).filter(i=>details.getY(i)===2);
  assert.ok(timing.SPARKLER_PASSES===5 && [0,1,2,3,4].every(lap=>sprays.some(i=>Math.floor(details.getX(i)*5)===lap)),"even on low quality, sparks can light all five laps");
  f.moments.dispose();
});

test("absolute server time does not restart on duplicate snapshots, late arrival or backwards local clock",()=>{
  const f=fixture(); f.setTime(1000); f.moments.apply([event()],101200);
  const spark=f.sparks()[0]; close(spark.material.uniforms.uAge.value,1.2);
  f.setTime(1500); f.moments.apply([event()],101700); assert.equal(f.sparks()[0],spark); close(spark.material.uniforms.uAge.value,1.7);
  f.moments.apply([],101400); assert.equal(f.sparks()[0],spark,"older empty snapshots cannot remove a current effect");
  f.moments.update(f.camera,500); close(spark.material.uniforms.uAge.value,1.7);
  f.setTime(2000); f.moments.apply([],102200); assert.equal(f.sparks().length,0);
  f.setTime(2400); f.moments.apply([event()],102600); close(f.sparks()[0].material.uniforms.uAge.value,2.6);
  let disposals=0; f.sparks()[0].material.addEventListener("dispose",()=>disposals++);
  f.setTime(4800); f.moments.update(f.camera,4800); assert.equal(f.sparks().length,0); assert.equal(disposals,1);
  f.moments.apply([event(),event("unknown")],105000); assert.equal(f.sparks().length,0,"even never-seen but server-active IDs cannot replay the spent sparkler");
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

test("all five laps follow the same seeded shader vertices as the hand, without jumping between laps",()=>{
  const f=fixture();
  for(const shape of ["L","O","V","E","heart","star"]) {
    const path=f.sparklerPath(shape,256);
    for(let i=1;i<path.length;i++) assert.ok(Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y)<.04,"no teleport between strokes");
    if(["O","heart","star"].includes(shape)) {
      close(path[0].x,path.at(-1).x); close(path[0].y,path.at(-1).y);
    }
    const hand=f.sparklerHand(shape);
    f.moments.apply([event(shape,"sparkler",{letter:shape})],100000);
    const spark=f.sparks()[0], positions=spark.geometry.attributes.position, detail=spark.geometry.attributes.detail;
    const uniforms=spark.material.uniforms;
    for(let i=0;i<480;i+=7) {
      const progress=detail.getX(i), sweep=progress*5, lap=Math.min(4,Math.floor(sweep)), phase=sweep-lap;
      const x=positions.getX(i), y=positions.getY(i), basis=new THREE.Vector4(x,y,1,x*y);
      const blend=THREE.MathUtils.smoothstep(phase,0,1);
      const projected=rows=>rows[lap].clone().lerp(rows[lap+1],blend).dot(basis);
      const tip=f.sampleSparklerTip(shape,timing.SPARKLER_DRAW_START+timing.SPARKLER_DRAW_SECONDS*progress,hand);
      assert.ok(Math.hypot(tip.x-projected(uniforms.uHandX.value),tip.y-projected(uniforms.uHandY.value))<.00001,"arm and GPU Float32 vertex agree within ten micrometers");
    }
    const launch=(age,handPose=hand)=>f.sampleSparklerTip(shape,age,handPose);
    for(let lap=1;lap<5;lap++) {
      const border=timing.SPARKLER_DRAW_START+lap*timing.SPARKLER_PASS_SECONDS;
      const left=launch(border-.00001), right=launch(border+.00001);
      assert.ok(Math.hypot(left.x-right.x,left.y-right.y)<.001,"wrist stays continuous at the turn");
    }
    const midpoints=Array.from({length:5},(_,lap)=>launch(timing.SPARKLER_DRAW_START+(lap+.5)*timing.SPARKLER_PASS_SECONDS));
    assert.ok(midpoints.slice(1).every((p,i)=>Math.hypot(p.x-midpoints[i].x,p.y-midpoints[i].y)>.005),"each lap has its own hand placement");
    const different=launch(1.14,f.sparklerHand(shape+"-other"));
    assert.ok(Math.hypot(different.x-midpoints[0].x,different.y-midpoints[0].y)>.01,"each launch's variation comes from its event ID");
  }
  assert.equal(f.sampleSparklerTip("heart",6).drawing,false);
  f.moments.dispose();
});

test("the fine core and halo connect consecutive hand samples without bridging across a lap",()=>{
  const f=fixture();
  for (const letter of ["L","O","V","E","heart","star"]) {
    f.moments.apply([event(letter,"sparkler",{letter})],100000);
    const {position,detail,nextKnot}=f.sparks()[0].geometry.attributes;
    let segments=0, ends=0;
    for(let i=0;i<detail.count;i++) {
      if(detail.getY(i)>=.75) continue;
      if(nextKnot.getZ(i)===detail.getX(i)) { ends++; continue; }
      close(nextKnot.getZ(i),detail.getX(i+1));
      close(nextKnot.getX(i),position.getX(i+1)); close(nextKnot.getY(i),position.getY(i+1));
      assert.equal(detail.getY(i),detail.getY(i+1));
      segments++;
    }
    assert.equal(ends,2*timing.SPARKLER_PASSES);
    assert.equal(segments,2*timing.SPARKLER_PASSES*95);
  }
  f.moments.dispose();
});

test("rapid laps overlap visibly, then the glow and sparse embers die in stroke order",()=>{
  const f=fixture();
  const {SPARKLER_DRAW_START:start, SPARKLER_DRAW_END:end, SPARKLER_DRAW_SECONDS:seconds}=timing;
  assert.ok(start>=.8 && timing.SPARKLER_PASS_SECONDS<=.5 && timing.SPARKLER_PASSES===5);
  assert.equal(f.sparklerTrailOpacity(start-.01,0),0);
  assert.ok(f.sparklerTrailOpacity(start+seconds*.5,0)<f.sparklerTrailOpacity(start+seconds*.5,.49));
  assert.ok(f.sparklerTrailOpacity(end,.80)>.60,"last complete loop remains bright at burnout");
  assert.ok(f.sparklerTrailOpacity(end,.60)>.10,"traces of the prior loop overlap the new one");
  assert.equal(f.sparklerTrailOpacity(end,0),0,"the opening stroke has disappeared by the final pass");
  close(f.sparklerTrailOpacity(end,1),1);
  assert.equal(f.sparklerTrailOpacity(end+.65,0),0); assert.ok(f.sparklerTrailOpacity(end+.65,1)>0);
  assert.equal(f.sparklerTrailOpacity(end+1.61,1),0);
  f.moments.dispose();
});

test("one held stick joins the actual palm to the burning tip and a new shape stops the old hand motion",()=>{
  const poses=[];
  const grip=new THREE.Vector3(.3,1.2,2.65);
  const f=fixture({poseSparkler:(pid,tip,age,target)=>{poses.push({pid,tip:tip.clone(),age,target:target.clone()}); return grip;}});
  f.moments.apply([event("old","sparkler",{letter:"heart"})],100000);
  f.setTime(101440); f.moments.update(f.camera,101440);
  const rods=f.object("uyuni-held-sparklers"); assert.equal(rods.count,1);
  const matrix=new THREE.Matrix4(); rods.getMatrixAt(0,matrix);
  const endpoint=new THREE.Vector3(0,.5,0).applyMatrix4(matrix);
  assert.ok(endpoint.distanceTo(poses.at(-1).tip)<1e-6,"the glowing tip is physically the end of the held rod");
  const last=poses.at(-1), direction=last.tip.clone().sub(grip).normalize();
  const bottom=new THREE.Vector3(0,-.5,0).applyMatrix4(matrix);
  assert.ok(bottom.distanceTo(grip.clone().addScaledVector(direction,-.05))<1e-6,"the grip is inside the bottom five centimeters of the stick");
  f.setTime(101760); f.moments.apply([event("old","sparkler",{letter:"heart"}),event("new","sparkler",{letter:"star",startedAt:101760})],101760);
  assert.equal(rods.count,1); assert.equal(f.sparks().length,2,"old embers remain while the next stroke starts");
  assert.equal(f.object("uyuni-sparkler-old").material.uniforms.uStop.value,1.76);
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
  assert.equal(spark.material.uniforms.uStop.value,timing.SPARKLER_DRAW_END,"loading a model is not a cancelled stroke");
  present=true; f.setTime(101130); f.moments.update(f.camera,101130); assert.equal(rods.count,1);
  present=false; f.setTime(101470); f.moments.update(f.camera,101470);
  assert.equal(spark.material.uniforms.uStop.value,1.13); assert.equal(rods.count,0); assert.equal(f.sparks().length,1);
  present=true; f.setTime(101760); f.moments.update(f.camera,101760);
  assert.equal(rods.count,0,"walking back does not restart an interrupted hand stroke");
  f.setTime(102740); f.moments.update(f.camera,102740); assert.equal(f.sparks().length,0);
  f.moments.apply([event("held","sparkler",{letter:"heart"})],102740);
  assert.equal(f.sparks().length,0,"a later full snapshot cannot recreate a cancelled drawing before its nominal end");
  f.moments.dispose();
});

test("a wide wrist sweep still lights the tip when a real grip briefly reaches farther from it",()=>{
  let distance=.48;
  const f=fixture({poseSparkler:(_pid,tip)=>tip.clone().addScaledVector(new THREE.Vector3(0,-1,0),distance)});
  f.moments.apply([event("large","sparkler",{letter:"V"})],100000);
  const drawing=f.sparks()[0], rods=f.object("uyuni-held-sparklers");
  distance=1.43; f.moments.update(f.camera,102480);
  assert.equal(rods.count,1); assert.equal(drawing.material.uniforms.uHeld.value,1);
  distance=.48; f.moments.update(f.camera,103100);
  assert.equal(rods.count,1); assert.equal(drawing.material.uniforms.uStop.value,timing.SPARKLER_DRAW_END);
  f.moments.dispose();
});

test("the hand follows the same tip at 60 fps, 8 fps, and a spectator's first mid-stroke snapshot",()=>{
  const frames=step=>{
    const poses=[];
    const f=fixture({poseSparkler:(_pid,tip,age,target)=>{poses.push([age,...tip.toArray()]);return target;}});
    const heart=event("heart","sparkler",{letter:"heart",yaw:.72});
    if(step>0) {
      f.moments.apply([heart],100000);
      for(let tick=step;tick<1640;tick+=step) f.moments.update(f.camera,100000+tick);
    }
    f.setTime(101640); f.moments.apply([heart],101640);
    assert.equal(f.object("uyuni-held-sparklers").count,1);
    assert.equal(f.sparks()[0].material.uniforms.uAge.value,1.64);
    const pose=poses.at(-1); f.moments.dispose(); return pose;
  };
  assert.deepEqual(frames(16),frames(125));
  assert.deepEqual(frames(125),frames(0));
});

test("only a previously held sparkler eases down after burnout, without a burning tip or stick",()=>{
  const poses=[];
  const f=fixture({poseSparkler:(_pid,tip,age,target)=>{poses.push({age,tip:tip.clone()});return target;}});
  const e=event("release","sparkler",{letter:"star"});
  f.moments.apply([e],100000);
  const end=100000+Math.round(timing.SPARKLER_DRAW_END*1000);
  f.moments.update(f.camera,end); assert.equal(f.object("uyuni-held-sparklers").count,1);
  const finalTip=poses.at(-1).tip;
  f.moments.update(f.camera,end+90);
  assert.equal(f.object("uyuni-held-sparklers").count,0);
  assert.equal(f.sparks()[0].material.uniforms.uHeld.value,0);
  assert.ok(poses.at(-1).tip.distanceTo(finalTip)<1e-8);
  close(poses.at(-1).age,timing.SPARKLER_DRAW_END+.09);
  const count=poses.length;
  f.moments.update(f.camera,end+210);
  assert.equal(poses.length,count);
  f.moments.dispose();

  const spectator=fixture({poseSparkler:()=>assert.fail("late arrival during release cannot raise an idle arm")});
  spectator.setTime(end+90); spectator.moments.apply([e],end+90);
  assert.equal(spectator.sparks().length,1); assert.equal(spectator.object("uyuni-held-sparklers").count,0);
  spectator.moments.dispose();
});
