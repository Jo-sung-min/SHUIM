import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import ts from "typescript";

const require = createRequire(import.meta.url), cache = new Map();
function load(file) {
  const path=resolve(dirname(fileURLToPath(import.meta.url)),file);
  if(cache.has(path))return cache.get(path).exports;
  const module={exports:{}};cache.set(path,module);
  const source=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const localRequire=name=>name==="three"?THREE:name.startsWith(".")?load(resolve(dirname(path),name+".ts")):require(name);
  vm.runInNewContext(source,{module,exports:module.exports,require:localRequire,console});return module.exports;
}
const trail=load("../lib/beach/bamboo-trail.ts");
const photo=load("../lib/beach/bamboo-photo-spots.ts");

test("both exact phrases sit beside the deck, with walkable photo poses and an unobstructed guestbook approach",()=>{
  assert.deepEqual(Array.from(photo.BAMBOO_PHOTO_SPOTS,s=>s.text),["오늘도 고생했어","사랑해"]);
  for(const site of photo.BAMBOO_PHOTO_SPOTS) {
    assert.ok(Math.abs(site.x)>8 && Math.abs(site.x)<12);
    for(const [x,z] of [[0,1.05],[-1,1.3],[1,1.3],[0,2.6]]) {
      const p=photo.bambooPhotoWorld(site,x,z),resolved=trail.resolveTrail(p.x,p.z);
      assert.ok(Math.hypot(resolved[0]-p.x,resolved[1]-p.z)<.001,"the portrait pose and its approach remain walkable");
      assert.ok(Math.abs(trail.bambooFloorHeight(p.x,p.z)-trail.groundHeight(p.x,p.z))<1e-5,"no raised deck is hidden under the portrait position");
    }
    const pose=photo.bambooPhotoWorld(site,0,1.05),camera=photo.bambooPhotoWorld(site,0,9.5);
    for(let i=0;i<=50;i++) {
      const t=i/50,x=pose.x+(camera.x-pose.x)*t,z=pose.z+(camera.z-pose.z)*t;
      assert.ok(trail.BAMBOO_PAVILION_COLLIDERS.every(w=>x<w.minX||x>w.maxX||z<w.minZ||z>w.maxZ),"a wide portrait camera does not photograph through the deck railing");
    }
  }
  const scene=new THREE.Scene(),spots=photo.buildBambooPhotoSpots(scene,true);scene.updateMatrixWorld(true);
  for(const z of [98.2,100,101.8]) {
    const eye=new THREE.Vector3(5.2,trail.groundHeight(5.2,z)+1.6,z);
    const ray=new THREE.Raycaster(eye,new THREE.Vector3(1,0,0),0,6.7);
    assert.equal(ray.intersectObject(spots.root,true).length,0,"the original bulletin board stays visible from the deck side");
  }
  spots.dispose();
});

test("the central night view stays clear from standing and seated lookout positions",()=>{
  const scene=new THREE.Scene(),spots=photo.buildBambooPhotoSpots(scene,true);scene.updateMatrixWorld(true);
  for(const x of [-3.75,0,3.75])for(const z of [97,100,102.2])for(const yaw of [-.48,-.24,0,.24,.48])for(const pitch of [-.08,.1,.3]) {
    const eye=new THREE.Vector3(x,trail.bambooFloorHeight(x,z)+1.3,z);
    const direction=new THREE.Vector3(Math.sin(yaw),Math.sin(pitch),Math.cos(yaw)).normalize();
    assert.equal(new THREE.Raycaster(eye,direction,0,100).intersectObject(spots.root,true).length,0,`central city ray ${x},${z},${yaw},${pitch}`);
  }
  spots.dispose();
});

test("both neon gardens use nine bounded batches, no extra lights, flush paving and one-time disposal",t=>{
  for(const mobile of [true,false]) {
    const scene=new THREE.Scene(),spots=photo.buildBambooPhotoSpots(scene,mobile);scene.updateMatrixWorld(true);
    let triangles=0,meshes=0;const resources=new Set();
    scene.traverse(o=>{
      assert.ok(!o.isLight);if(!o.isMesh)return;meshes++;
      const p=o.geometry.getAttribute("position");assert.ok(Array.from(p.array).every(Number.isFinite));
      triangles+=(o.geometry.index?.count??p.count)/3;assert.equal(o.castShadow,false);
      resources.add(o.geometry);resources.add(o.material);if(o.material.map)resources.add(o.material.map);
      if(o.name==="bamboo-photo-stones")for(let i=0;i<p.count;i++)assert.ok(Math.abs(p.getY(i)-trail.groundHeight(p.getX(i),p.getZ(i))-.009)<1e-4);
    });
    assert.equal(meshes,9);assert.ok(triangles<36000,`${triangles} triangles for both photo zones`);
    const halo=scene.getObjectByName("bamboo-photo-halos").material;
    const core=scene.getObjectByName("bamboo-photo-neon").material;
    spots.setNight(0);assert.equal(halo.uniforms.uNight.value,0);assert.equal(core.color.r,.5);
    for(const site of photo.BAMBOO_PHOTO_SPOTS){
      const words=scene.getObjectByName(`bamboo-photo-words-${site.id}`),glow=scene.getObjectByName(`bamboo-photo-word-glow-${site.id}`);
      assert.equal(words.material.color.r,.6,"daytime word intensity is unchanged");
      assert.equal(glow.material.uniforms.uNight.value,0,"extra soft glow is off by day");
      assert.equal(glow.material.uniforms.uMap.value,words.material.map,"the halo reuses its existing glyph texture");
      assert.equal(glow.geometry,words.geometry,"the extra glow shares the tiny sign plane buffer");
    }
    spots.setNight(1);assert.equal(halo.uniforms.uNight.value,1);assert.equal(core.color.r,1.35);
    for(const site of photo.BAMBOO_PHOTO_SPOTS){
      assert.equal(scene.getObjectByName(`bamboo-photo-word-glow-${site.id}`).material.uniforms.uNight.value,1);
      assert.ok(Math.abs(scene.getObjectByName(`bamboo-photo-words-${site.id}`).material.color.r-1.3)<1e-12);
    }
    const counts=new Map([...resources].map(r=>[r,0]));for(const r of resources)r.addEventListener("dispose",()=>counts.set(r,counts.get(r)+1));
    spots.dispose();spots.dispose();assert.equal(scene.children.length,0);assert.ok([...counts.values()].every(count=>count===1));
    t.diagnostic(`${mobile?"mobile":"desktop"}: ${meshes} draws, ${triangles} triangles, no added lights`);
  }
});

test("photo fill lights face the portrait poses and stay within the existing four-light pool",()=>{
  assert.equal(photo.BAMBOO_PHOTO_LIGHTS.length,2);
  for(const [i,light] of photo.BAMBOO_PHOTO_LIGHTS.entries()) {
    const site=photo.BAMBOO_PHOTO_SPOTS[i],pose=photo.bambooPhotoWorld(site,0,1.05);
    assert.ok(Math.hypot(light.x-pose.x,light.z-pose.z)<2);
    assert.ok(light.y>trail.groundHeight(pose.x,pose.z)+2);
    assert.ok(light.strength<=1 && light.color===0xffdfc2);
  }
  const world=readFileSync(new URL("../lib/beach/bamboo.ts",import.meta.url),"utf8");
  assert.match(world,/lantern\.pavilionId === "summit" \? \.65 : 1/);
  assert.match(world,/const active = this.low \? 2 : 4/);
});
