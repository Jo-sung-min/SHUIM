import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { hotSpring } from "./beach-world-fixture.mjs";

const { ONSEN_BATHS, ONSEN_SEATS, ONSEN_FLOATS, ONSEN_REST_REACH, ONSEN_SEAT_Y, ONSEN_FLOAT_Y, ONSEN_FLOAT_BOB,
  claimedOnsenSeat, claimedOnsenFloat, onsenLedgeHeight, onsenFloatingY, buildOnsenRest, HOT_SPRING } = hotSpring;
const near = (a,b,tolerance=1e-6) => assert.ok(Math.abs(a-b)<tolerance,`${a} ≈ ${b}`);

test("every bath has nine bench seats and three floating places, distinct and inside its usable water",()=>{
  assert.equal(ONSEN_SEATS.length,27);assert.equal(ONSEN_FLOATS.length,9);assert.equal(ONSEN_REST_REACH,2.2);
  for(const [slot,seat] of ONSEN_SEATS.entries()){
    const angle=(-30+slot%9*30)*Math.PI/180,bath=ONSEN_BATHS[Math.floor(slot/9)];
    near(seat.x,bath.x+Math.cos(angle)*3.55);near(seat.z,bath.z+Math.sin(angle)*3.55);near(seat.baseY,HOT_SPRING.floorY+bath.lift);
    assert.equal(seat.spotId,'onsen-benches');assert.equal(seat.slot,slot);
    near(-Math.sin(seat.yaw),(bath.x-seat.x)/3.55);near(-Math.cos(seat.yaw),(bath.z-seat.z)/3.55);
    near(onsenLedgeHeight(seat.x,seat.z),seat.avatarY);
    assert.ok(seat.avatarY>seat.baseY&&seat.avatarY<HOT_SPRING.waterY+bath.lift);
  }
  for(const [slot,place] of ONSEN_FLOATS.entries()){
    assert.equal(place.spotId,'onsen-float');assert.equal(place.slot,slot);assert.equal(place.yaw,0);
    const bath=ONSEN_BATHS[Math.floor(slot/3)];
    near(place.x,bath.x+[-2.4,0,2.4][slot%3]);near(place.z,bath.z-1.7);near(place.avatarY,ONSEN_FLOAT_Y+bath.lift);
    // A 1.6m head centre plus a .4m head radius clears the curved pool rim.
    assert.ok(Math.hypot(place.x-bath.x,place.z-1.6-bath.z)+.4<HOT_SPRING.poolRadius);
    assert.equal(onsenLedgeHeight(place.x,place.z),null);
    for(const other of ONSEN_FLOATS)if(other.slot!==slot)assert.ok(Math.hypot(place.x-other.x,place.z-other.z)>=2.4);
  }
});

test("only matching authoritative onsen poses and integer slots resolve",()=>{
  for(const [claim,places,pose,id] of [[claimedOnsenSeat,ONSEN_SEATS,'sitting','onsen-benches'],[claimedOnsenFloat,ONSEN_FLOATS,'lying','onsen-float']]){
    for(const place of places)assert.equal(claim({pose,spotId:id,slot:place.slot}),place);
    for(const slot of [-1,places.length,.5,NaN,Infinity,'0',null,undefined])assert.equal(claim({pose,spotId:id,slot}),null);
    for(const spotId of ['starlight','fire-benches','hut-wave',id==='onsen-float'?'onsen-benches':'onsen-float'])assert.equal(claim({pose,spotId,slot:0}),null);
    assert.equal(claim({pose:'standing',spotId:id,slot:0}),null);
    assert.equal(claim({pose:pose==='lying'?'sitting':'lying',spotId:id,slot:0}),null);
  }
});

test("two small stone batches have flat seat surfaces and leave the side entry open",()=>{
  const scene=new THREE.Scene(),map=new THREE.Texture(),source=new THREE.MeshStandardMaterial({map,color:0x998877,roughness:.73});
  const sourceColor=source.color.clone(),compile=()=>{};source.onBeforeCompile=compile;
  const rest=buildOnsenRest(scene,source);scene.updateMatrixWorld(true);
  assert.equal(rest.group.children.length,2);assert.equal(rest.group.parent,scene);
  for(const mesh of rest.group.children){assert.ok(mesh.isInstancedMesh);assert.equal(mesh.count,27);assert.equal(mesh.castShadow,false);assert.equal(mesh.receiveShadow,false);assert.ok(mesh.geometry.index.count/3<150);assert.notEqual(mesh.material,source);assert.equal(mesh.material.map,map);assert.equal(mesh.material.onBeforeCompile,compile);}
  assert.ok(source.color.equals(sourceColor));assert.equal(source.roughness,.73);
  const upper=rest.group.getObjectByName('onsen-ledge-flat-seats');
  for(const seat of ONSEN_SEATS){
    const ray=new THREE.Raycaster(new THREE.Vector3(seat.x,seat.avatarY+1,seat.z),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObject(upper)[0];assert.ok(hit);near(hit.point.y,seat.avatarY,2e-6);
    assert.ok(hit.face.normal.y>.99,'the support surface is actually level');
  }
  // The bench is a C around three sides: the side facing the sea stays open.
  for(const bath of ONSEN_BATHS)for(let degrees=-130;degrees<=-50;degrees+=5){const angle=degrees*Math.PI/180;assert.equal(onsenLedgeHeight(bath.x+Math.cos(angle)*3.55,bath.z+Math.sin(angle)*3.55),null);}
  for(const bath of ONSEN_BATHS)for(let degrees=-40;degrees<=220;degrees+=5){const angle=degrees*Math.PI/180;near(onsenLedgeHeight(bath.x+Math.cos(angle)*3.55,bath.z+Math.sin(angle)*3.55),ONSEN_SEAT_Y+bath.lift);}
  for(const [x,z] of [[0,45],[0,42],[0,49.1],[4.1,47],[-4.1,47],[NaN,46],[1,Infinity]])assert.equal(onsenLedgeHeight(x,z),null);
  let materials=0,geometries=0,textures=0;
  upper.material.addEventListener('dispose',()=>materials++);
  for(const mesh of rest.group.children)mesh.geometry.addEventListener('dispose',()=>geometries++);
  map.addEventListener('dispose',()=>textures++);rest.dispose();rest.dispose();
  assert.equal(materials,1);assert.equal(geometries,2);assert.equal(textures,0);assert.equal(rest.group.parent,null);
  source.dispose();map.dispose();
});

test("floating gently bobs below the surface without accumulating drift or changing saved slots",()=>{
  const positions=ONSEN_FLOATS.map(slot=>({...slot}));
  for(let time=0;time<60;time+=.13)for(const slot of ONSEN_FLOATS){
    const y=onsenFloatingY(time,slot.slot);
    assert.ok(Math.abs(y-slot.avatarY)<=ONSEN_FLOAT_BOB+1e-9&&y<HOT_SPRING.waterY+slot.avatarY-ONSEN_FLOAT_Y);
    assert.ok(Math.abs(onsenFloatingY(time+.016,slot.slot)-y)<.0004);
    near(onsenFloatingY(time+Math.PI*2/.8,slot.slot),y);
  }
  for(const time of [NaN,Infinity,-Infinity])assert.ok(Number.isFinite(onsenFloatingY(time,0)));
  assert.deepEqual(ONSEN_FLOATS.map(slot=>({...slot})),positions);
});
