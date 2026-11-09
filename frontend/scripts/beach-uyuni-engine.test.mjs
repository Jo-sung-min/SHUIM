import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { hotSpring } from "./beach-world-fixture.mjs";

async function load(file, dependencies, names) {
  let source = stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), "utf8"))
    .replace(/^import\s+[^\n]+\n/gm, "").replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
  if (file.endsWith("/engine.ts")) source = source.replace(/\bonKey\s*=\s*\(([^)]*)\)\s*=>\s*\{/, "onKey($1) {");
  const context = { ...hotSpring, ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${names.join(",")} };`, context);
  return context.api;
}
const atlas = await load("../lib/beach/atlas.ts", {}, ["CHAR_ATLAS", "CHAR_VIEW", "CHAR_ANIM"]);
const stars = await load("../lib/beach/stargazing.ts", { THREE }, ["STARGAZING", "stargazingSlot", "claimedStargazingSlot", "stargazingBodyPoint", "stargazingApproach", "stargazingCameraDistance", "applyLyingTransform", "buildStargazingZone"]);
const textiles = await load("../lib/beach/shelter-textiles.ts", { THREE }, ["createShelterDuvetGeometry", "createShelterPillowGeometry", "createShelterTextileMaterial"]);
const huts = await load("../lib/beach/shelters.ts", { THREE, RoundedBoxGeometry, ...textiles }, ["SHELTERS", "SHELTER_SEATS", "SHELTER_COLLIDERS", "BED_CAPACITY", "bedSlot", "claimedBedSlot"]);
const benches = await load("../lib/beach/fire-benches.ts", { THREE }, ["FIRE_BENCH_SEATS", "FIRE_BENCH_REACH", "claimedFireBenchSlot"]);
const navigation = await load("../lib/beach/navigation.ts", {}, ["resolveWalls", "findWalkingPath", "findClearApproach"]);
const daylight = await load("../lib/beach/daylight.ts", {}, ["daylightAt", "uyuniDaylightAt", "cloudSpaDaylightAt", "baikalDaylightAt"]);
const sky = await load("../lib/beach/sky-shader.ts", {}, ["SKY_FRAGMENT", "SKY_UNIFORMS", "SKY_FUNCTIONS"]);
const coast = await load("../lib/beach/uyuni-coast.ts", {}, ["UYUNI_COAST_FUNCTIONS"]);
const uyuniSky = await load("../lib/beach/uyuni-shader.ts", { ...sky, ...coast }, ["UYUNI_SKY_FRAGMENT"]);
const { BeachEngine } = await load("../lib/beach/engine.ts", {
  THREE, ...atlas, ...stars, ...huts, ...benches, ...navigation, ...daylight, ...sky, ...uyuniSky, CAMPFIRE: { x: 0, z: 12 }, performance,
  document: { createElement: () => ({ getContext: () => null }) },
  window: { innerWidth: 390, innerHeight: 844, devicePixelRatio: 3 },
  BeachFireworks: class {
    constructor(scene, options) { this.scene = scene; this.options = options; this.events = []; }
    apply(events, serverTime) { this.events.push({ events, serverTime }); }
  },
  UyuniMoments: class {
    constructor(scene, options) { this.scene = scene; this.options = options; this.events = []; }
    setQuality(quality) { this.quality = quality; }
    apply(events, serverTime) { this.events.push({ events, serverTime }); }
  },
}, ["BeachEngine"]);
const { STARGAZING, stargazingSlot } = stars;
const { UYUNI_HOTELS, UYUNI_HOTEL_DECK, UYUNI_HOTEL_COLLIDERS, UYUNI_HOTEL_SEATS,
  uyuniHotelBedSlot, uyuniHotelFloorHeight, uyuniHotelCeilingHeight } = hotSpring;
const plain = value => JSON.parse(JSON.stringify(value));
const close = (actual, expected, message = `${actual} ≈ ${expected}`) => assert.ok(Math.abs(actual - expected) < 1e-6, message);
const pool = kind => ({ ready: true, canLoad: true, create() {
  return { kind, root: new THREE.Group(), states: [], update(dt, state) { this.states.push({ dt, ...state }); }, dispose() {} };
} });

function bunkerFixture() {
  const value = fixture(), { engine, uyuni } = value;
  Object.assign(engine, { bunkerTransition: null, lastBunkerState: "", running: true, pavilionSeat: null });
  uyuni.layers = []; uyuni.setBunkerActive = id => uyuni.layers.push(id);
  engine.applyDaylight = () => {};
  return value;
}
function bunkerRest(id = "dawn") {
  const room = hotSpring.bunkerById(id);
  return { pose: "standing", spotId: null, slot: null, x: room.arrival.x, z: room.arrival.z, yaw: room.arrival.yaw, bunkerId: id };
}

test("bunker floor isolates sky, outdoor actions and collisions until confirmed exit", async () => {
  const { engine, uyuni } = bunkerFixture(), room = hotSpring.bunkerById("dawn");
  Object.assign(engine.self, room.entry); engine.updateSelf(0);
  assert.equal(engine.bunkerState.nearId, "dawn");
  engine.applyRest(bunkerRest()); engine.updateSelf(0);
  assert.equal(engine.bunkerId, "dawn"); assert.equal(engine.sky.visible, false);
  assert.equal(engine.getSelf().bunkerId, "dawn"); assert.equal(engine.bunkerState.ladderNear, true);
  assert.equal(engine.getBedState(), null); assert.equal(engine.nearbySeat(), null);
  close(engine.deckHeight(room.x, room.z), -8.6);
  assert.equal(await engine.walkToBed("hotel-dawn"), "cancelled");
  assert.equal(await engine.walkToStargazing(), "cancelled");
  for (const [x,z] of [[room.x-60,room.z],[room.x+60,room.z],[room.x,room.z-50],[room.x,room.z+50]]) {
    const [cx,cz] = engine.collide(x,z);
    assert.ok(cx >= room.bounds.minX+.4 && cx <= room.bounds.maxX-.4);
    assert.ok(cz >= room.bounds.minZ+.4 && cz <= room.bounds.maxZ-.4);
  }
  engine.applyRest({ pose:"standing",spotId:null,slot:null,x:room.entry.x,z:room.entry.z,yaw:0,bunkerId:null });
  engine.updateSelf(0); assert.equal(engine.bunkerId,null); assert.equal(engine.sky.visible,true);
  close(engine.eyeHeight,.48+1.55); assert.deepEqual(uyuni.layers,["dawn",null]);
});

test("all twelve bunker sofas keep shared posture and camera orbits below sealed ceilings", () => {
  for (const room of hotSpring.UYUNI_BUNKERS) for (const seat of hotSpring.BUNKER_SEATS.filter(s => s.spotId === room.spotId)) {
    const { engine, camera } = bunkerFixture();
    engine.applyRest(bunkerRest(room.id)); engine.applyRest({ ...seat,pose:"sitting",bunkerId:room.id });
    assert.equal(engine.bunkerState.seated,true); assert.equal(engine.bunkerState.occupied,1);
    assert.equal(engine.pavilionSeat.slot,seat.slot); assert.equal(engine.bunkerState.capacity,6);
    for (let angle=0;angle<Math.PI*2;angle+=.12) {
      engine.orbitYaw=angle; engine.self.pitch=Math.sin(angle)*.45; engine.updateSelf(.016);
      assert.equal(engine.cameraFree(camera.position),true,`${seat.id} orbit=${angle}`);
      assert.ok(camera.position.y < room.ceilingY-.2);
      close(engine.selfNode.avatar.states.at(-1).seated.avatarY,-8.08);
    }
    engine.setView("first"); engine.updateSelf(.016); close(camera.position.y,-8.08+.78);
    assert.equal(engine.cameraFree(camera.position),true);
    engine.applyRest({ ...bunkerRest(room.id), x:seat.x+(seat.slot<3?1.5:-1.5), z:seat.z });
    assert.equal(engine.bunkerState.seated,false); assert.equal(engine.bunkerId,room.id);
  }
});

test("standing and seated resumes restore the indoor floor before collision projection", () => {
  const { engine,camera }=bunkerFixture(), rest={ ...bunkerRest("dusk"),x:20,z:24 };
  engine.restoreVisit(rest,rest,{ view:"first",yaw:1.1,pitch:.1,orbitYaw:1.1,restSpot:null },true);
  assert.equal(engine.bunkerId,"dusk"); close(engine.self.x,20); close(engine.self.z,24);
  close(camera.position.y,-8.6+1.55); assert.equal(engine.sky.visible,false);
  const seat=hotSpring.BUNKER_SEATS.find(s=>s.spotId==="bunker-dusk-sofa" && s.slot===4);
  engine.restoreVisit(seat,{ ...seat,pose:"sitting",bunkerId:"dusk" });
  assert.equal(engine.bunkerState.seated,true); assert.equal(engine.pavilionSeat.slot,4);
});

test("ladder finishes once and resumed visits cancel a suspended old transition", async () => {
  const { engine }=bunkerFixture(), room=hotSpring.bunkerById("dawn"); Object.assign(engine.self,room.entry);
  const finished=engine.transitionBunker(bunkerRest()); engine.setMove(1,1); assert.equal(engine.move.x,0);
  for(let i=0;i<12;i++) engine.updateSelf(.05);
  assert.equal(engine.bunkerId,null);
  for(let i=0;i<18;i++) engine.updateSelf(.05);
  await finished; assert.equal(engine.bunkerId,"dawn"); assert.equal(engine.bunkerTransition,null); close(engine.bunkerClimbOffset,0);
  const pending=engine.transitionBunker({ pose:"standing",spotId:null,slot:null,x:room.entry.x,z:room.entry.z,yaw:0,bunkerId:null });
  engine.updateSelf(.2); engine.restoreVisit(bunkerRest(),bunkerRest()); await pending;
  for(let i=0;i<35;i++) engine.updateSelf(.05);
  assert.equal(engine.bunkerId,"dawn","old animation cannot overwrite resumed indoor presence");
});

test("arrival frames the lounge beside the ladder and close indoor orbits never render a head inside the lens", () => {
  const { engine,camera }=bunkerFixture(); engine.setView("third");
  engine.applyRest(bunkerRest()); engine.updateSelf(.016);
  close(engine.orbitYaw,Math.PI+1.05);
  assert.ok(Math.hypot(camera.position.x-engine.self.x,camera.position.z-engine.self.z)>2);
  assert.equal(engine.hotelCameraSightClear(camera.position,-8.6+1.25),true);
  assert.equal(engine.selfNode.avatar.states.at(-1).visible,true);
  engine.orbitYaw=Math.PI; engine.followSnap=true; engine.updateSelf(.016);
  assert.equal(engine.hotelCameraSightClear(camera.position,-8.6+1.25),true);
  assert.equal(engine.selfNode.avatar.states.at(-1).visible,false);
});

test("each confirmed map launches the grand show on its own stage", () => {
  for (const mapId of ["uyuni", "beach", "bamboo"]) {
    const engine = Object.assign(Object.create(BeachEngine.prototype), {
      mapId, mobile: true, disposed: false, scene: new THREE.Scene(), fireworks: null,
    });
    engine.applyFireworks([], 100);
    assert.equal(engine.fireworks, null, "idle rooms do not allocate effects");
    const events = [{ id: "confirmed-show" }];
    engine.applyFireworks(events, 101);
    const show = engine.fireworks;
    assert.equal(show.scene, engine.scene);
    assert.equal(show.options.mobile, true);
    assert.equal(show.options.grand, true);
    assert.equal(show.options.reflectWater, mapId === "uyuni");
    assert.equal(Boolean(show.options.summitDisplay), mapId === "bamboo");
    assert.equal(show.events[0].events, events);
    engine.applyFireworks(events, 102);
    assert.equal(engine.fireworks, show, "reuses the renderer for shared snapshots");
    engine.disposed = true;
    engine.applyFireworks(events, 103);
    assert.equal(show.events.length, 2, "disposed visits cannot create or update a show");
  }
});

test("Uyuni uses its sunset palette for manual selection and periodic clock updates while beach stays unchanged", () => {
  for (const mapId of ["uyuni", "beach"]) {
    const expected = mapId === "uyuni" ? daylight.uyuniDaylightAt : daylight.daylightAt;
    const engine = Object.assign(Object.create(BeachEngine.prototype), {
      mapId, hourOverride: 18, quality: "high", qualityWarmupUntil: Infinity, lastDaylightAt: -Infinity,
      lastRender: 0, time: 0, clock: { update() {}, getDelta: () => 0.016 },
      applyDaylight(value) { this.daylight = value; },
      updateSelf() {}, syncSkyResolution() {}, updatePlayers() {}, updateFx() {}, updateWorld() {},
      renderer: { render() {} },
    });
    assert.deepEqual(engine.mapDaylight(), expected(18), "initial scene uses the map palette");
    engine.setHourOverride(18);
    assert.deepEqual(engine.daylightNow, expected(18));
    engine.hourOverride = 19;
    engine.frame();
    assert.deepEqual(engine.daylightNow, expected(19), "natural-time refresh uses the same map palette");
    engine.setHourOverride(20);
    assert.deepEqual(engine.daylightNow, daylight.daylightAt(20), "both maps retain the original full night");
  }
});

test("Uyuni sky requests no panorama texture while the beach retains and shares its existing photo", () => {
  for (const mapId of ["uyuni", "beach"]) {
    const requested = [];
    const engine = Object.assign(Object.create(BeachEngine.prototype), {
      mapId, scene: new THREE.Scene(), loadEnvironmentTexture(path) { requested.push(path); return new THREE.Texture(); },
    });
    engine.buildSky();
    assert.deepEqual(requested, mapId === "uyuni" ? [] : ["/beach/real/paradise-panorama-v1.webp"]);
    assert.equal(engine.skyMat.uniforms.uPhoto.value, engine.photo);
    if (mapId === "uyuni") assert.equal(engine.photo, null);
    else assert.equal(engine.photo.wrapS, THREE.RepeatWrapping);
    engine.sky.geometry.dispose(); engine.skyMat.dispose(); engine.photo?.dispose();
  }
});

function fixture(mapId = "uyuni") {
  const events = { fire: [], star: [], bench: [], onsen: [], quality: [], world: [], waterQuality: [], buffers: [] };
  const uyuni = mapId === "uyuni" ? {
    setBunkerActive() {}, update: (...args) => events.world.push(args), setQuality: low => events.waterQuality.push(low),
  } : null;
  const camera = new THREE.PerspectiveCamera(62, 390 / 844, 0.1, 520);
  camera.rotation.order = "YXZ";
  const engine = Object.assign(Object.create(BeachEngine.prototype), {
    mapId, uyuni, activeBunkerId: null, bunkerClimbOffset: 0, disposed: false, inputPaused: false, scene: new THREE.Scene(), camera, sky: new THREE.Mesh(),
    sparklerActors: new Map(), momentOwnPid: null, uyuniMoments: null,
    self: { x: 0, z: 3, yaw: 0.2, pitch: 0.07, moving: false, bobT: 0 }, orbitYaw: 0.2,
    view: "first", mobile: true, followCam: new THREE.Vector3(), followSnap: true,
    skyRest: null, onsenSeat: null, benchSeat: null, beforeSkyRest: null, restSeat: null, returnFromSeat: null,
    keys: new Set(), move: { x: 0, y: 0 }, auto: null, faceGoal: null, players: new Map(), selected: null,
    charTex: new THREE.Texture(), daylight: { tint: [1, 1, 1] }, skin: 0, time: 0, nearFire: false, eyeHeight: 1.55,
    shadowGeo: new THREE.PlaneGeometry(1, 1), shadowMat: new THREE.MeshBasicMaterial(),
    ring: new THREE.Mesh(), ringMat: new THREE.MeshBasicMaterial(), look: { active: false, moved: false },
    bounds: { minX: -80, maxX: 80, minZ: -80, maxZ: 80 }, obstacles: [{ x: 0, z: 12, r: 1.35 }],
    avatarModels: pool("male"), femaleAvatarModels: pool("female"),
    onsenAvatarModels: pool("male-onsen"), femaleOnsenAvatarModels: pool("female-onsen"),
    onsenAvatarReady: true, femaleOnsenAvatarReady: true, onsenAvatarRequested: true, femaleOnsenAvatarRequested: true,
    quality: "high", skyRenderMode: false, canvas: { clientWidth: 390, clientHeight: 844 },
    renderer: { shadowMap: { enabled: mapId === "beach" }, domElement: { height: 717 },
      setDrawingBufferSize: (...args) => events.buffers.push(args) },
    handlers: { onSelect() {}, onFireRangeChange: value => events.fire.push(value),
      onStargazingChange: value => events.star.push(plain(value)), onBenchAction: () => events.bench.push("action"),
      onBenchChange: value => events.bench.push(plain(value)), onOnsenChange: value => events.onsen.push(plain(value)),
      onQuality: value => events.quality.push(value) },
  });
  engine.selfNode = engine.createSelfAvatar();
  return { engine, camera, events, uyuni };
}

function cloudFixture() {
  const value=fixture("cloudspa"), {engine,events}=value;
  Object.assign(engine, { cloudSpa: { update:(...args)=>events.world.push(args), setQuality:low=>events.waterQuality.push(low) },
    bounds:hotSpring.CLOUD_SPA_BOUNDS, pavilionSeat:null, lastPavilionState:"", running:true });
  Object.assign(engine.self,hotSpring.CLOUD_SPA_SPAWN);
  engine.eyeHeight=engine.deckHeight(engine.self.x,engine.self.z)+1.55;
  return value;
}

test("cloud terraces keep all 36 resting poses and orbit cameras on their actual floor",()=>{
  for(const seat of hotSpring.CLOUD_SPA_SEATS) {
    const {engine,camera}=cloudFixture();
    engine.applyRest({...seat,pose:"sitting"}); engine.updateSelf(.016);
    assert.equal(engine.pavilionSeat.id,seat.id); assert.equal(engine.getPavilionState().capacity,6);
    close(engine.selfNode.avatar.states.at(-1).seated.avatarY,seat.avatarY);
    for(let angle=0;angle<Math.PI*2;angle+=.25) {
      engine.orbitYaw=angle;engine.followSnap=true;engine.updateSelf(.016);
      assert.equal(engine.cameraFree(camera.position),true,seat.id+" camera="+angle);
      assert.equal(engine.cloudSpaCameraSightClear(camera.position,seat.baseY+1.25),true,seat.id+" sight="+angle);
      const ceiling=hotSpring.cloudSpaCeilingHeight(camera.position.x,camera.position.z);
      if(ceiling!==null) assert.ok(camera.position.y<ceiling-.19);
    }
    engine.setView("first");engine.updateSelf(.016);close(camera.position.y,seat.avatarY+.78);
    engine.applyRest({...seat,pose:"standing",spotId:null,slot:null});engine.updateSelf(.016);
    assert.equal(engine.getPavilionState().seated,false);close(engine.eyeHeight,engine.deckHeight(seat.x,seat.z)+1.55);
  }
});

test("cloud terrace visits restore high and low floors and a downward city view",()=>{
  for(const place of hotSpring.CLOUD_SPA_POOLS){
    const {engine,camera}=cloudFixture(), rest={pose:"standing",spotId:null,slot:null,x:place.x,z:place.z,yaw:0};
    Object.assign(engine.self,rest);
    engine.restoreVisit(rest,rest,{view:"first",yaw:0,pitch:-1.02,orbitYaw:0,restSpot:null},true);
    close(camera.position.y,place.floorY+1.55);close(engine.self.pitch,-1.02);
    close(engine.selfNode.avatar.states.at(-1).y,place.floorY);
  }
});

test("cloud rest claims stay isolated from other maps and only count matching seats",async()=>{
  const {engine}=cloudFixture();
  for(const foreign of [hotSpring.BUNKER_SEATS[0],hotSpring.GARDEN_SEATS[0],hotSpring.BAMBOO_PAVILION_SEATS[0]]){
    engine.applyRest({...foreign,pose:"sitting"});assert.equal(engine.pavilionSeat,null);
  }
  const seat=hotSpring.CLOUD_SPA_SEATS[0];Object.assign(engine.self,seat);
  const state=engine.getPavilionState();assert.equal(state.near,true);assert.equal(state.kind,"pool");assert.equal(state.occupied,0);
  engine.players.set("other-map",{data:{...hotSpring.GARDEN_SEATS[0],pose:"sitting"}});
  engine.players.set("same-pool",{data:{...seat,pose:"sitting"}});
  assert.equal(engine.getPavilionState().occupied,1);
  assert.equal(await engine.walkToBed("hotel-dawn"),"cancelled");assert.equal(await engine.walkToStargazing(),"cancelled");
  assert.equal(engine.getBedState(),null);assert.equal(engine.nearbySeat(),null);
});

test("every rill descends and climbs between its two pools without a rejected step, while terrace walls stop a walker",()=>{
  for(const channel of hotSpring.CLOUD_SPA_CHANNELS) for(const direction of [1,-1]){
    const {engine}=cloudFixture(), start=direction===1?0:channel.length, end=direction===1?channel.length:0;
    const [sx,sz]=hotSpring.cloudSpaChannelPoint(channel,start,0); Object.assign(engine.self,{x:sx,z:sz});
    for(let along=start+direction*.05;direction*(end-along)>=0;along+=direction*.05){
      const [x,z]=hotSpring.cloudSpaChannelPoint(channel,along,0), old=engine.deckHeight(engine.self.x,engine.self.z);
      const next=engine.collide(x,z,true);
      close(next[0],x);close(next[1],z);assert.ok(Math.abs(engine.deckHeight(...next)-old)<.26,channel.id+" along="+along);
      engine.self.x=next[0];engine.self.z=next[1];
    }
    close(engine.deckHeight(engine.self.x,engine.self.z),(direction===1?channel.lower:channel.upper).floorY);
  }
  for(const channel of hotSpring.CLOUD_SPA_CHANNELS){
    // Beside the rill the upper lip drops straight into the lower basin: walking off it is refused and the walker slides along the lip instead.
    const {engine}=cloudFixture(), [lx,lz]=hotSpring.cloudSpaChannelPoint(channel,Math.sqrt((channel.upper.radius+.6)**2-36),6);
    Object.assign(engine.self,{x:lx,z:lz}); close(engine.deckHeight(lx,lz),channel.upper.deckY);
    const [tx,tz]=hotSpring.cloudSpaChannelPoint(channel,Math.sqrt((channel.upper.radius+1.6)**2-36),6), next=engine.collide(tx,tz,true);
    assert.ok(Math.abs(engine.deckHeight(...next)-channel.upper.deckY)<.3,channel.id+" stays on the lip");
  }
});

test("cloud resort lounge frames the seated character above the sofa back",()=>{
  for(const seat of hotSpring.CLOUD_SPA_SEATS.filter(s=>s.spotId==="cloud-lounge")){
    const {engine,camera}=cloudFixture();engine.applyRest({...seat,pose:"sitting"});engine.updateSelf(.016);
    close(engine.orbitYaw,seat.yaw+Math.PI+.45);assert.ok(camera.position.y>seat.baseY+3.5);
    assert.equal(engine.selfNode.avatar.states.at(-1).visible,true);
  }
});

test("sparkler drawing view opens only for a standing Uyuni visitor and remains manually controllable", () => {
  for (const mapId of ["uyuni", "beach", "bamboo"]) {
    const { engine } = fixture(mapId), changes = [];
    engine.handlers.onViewChange = view => changes.push(view);
    const yaw = engine.self.yaw;
    engine.showSparklerDrawing();
    assert.equal(engine.view, mapId === "uyuni" ? "third" : "first");
    if (mapId === "uyuni") {
      close(engine.orbitYaw, yaw + Math.PI); close(engine.self.yaw, yaw);
      assert.equal(engine.followSnap, true); assert.deepEqual(changes, ["third"]);
      engine.toggleView(); assert.equal(engine.view, "first", "the user can choose first person afterward");
    }
  }
  for (const resting of ["skyRest", "restSeat", "benchSeat", "onsenSeat", "pavilionSeat"]) {
    const { engine } = fixture(); engine[resting] = { x: 0, z: 3, yaw: 0 };
    engine.showSparklerDrawing(); assert.equal(engine.view, "first", resting);
  }
});

test("held sparklers resolve the current visit pid and reject missing, resting, walking or departed actors", () => {
  const { engine } = fixture(), posed = [];
  const actor = label => ({ poseSparkler(target, age) { posed.push({ label, target, age }); return target.clone(); } });
  engine.selfNode.avatar = actor("self");
  engine.players.set("remote", { avatar: actor("remote"), cur: { x: 2, z: 3, yaw: .2, moving: false }, target: { moving: false }, data: {} });
  const events = [
    { id: "self-event", kind: "sparkler", fromPid: "own-visit", x: 0, z: 3, yaw: .2, startedAt: 100 },
    { id: "remote-event", kind: "sparkler", fromPid: "remote", x: 2, z: 3, yaw: .2, startedAt: 100 },
  ];
  engine.applyUyuniMoments(events, 101, "own-visit");
  assert.equal(engine.view, "first", "a received snapshot never changes the camera");
  const callback = engine.uyuniMoments.options.poseSparkler;
  const tip = new THREE.Vector3(0, 1.5, 2.3), grip = new THREE.Vector3(0, 1.2, 2.6);
  assert.ok(callback("own-visit", tip, 2, grip)); assert.ok(callback("remote", tip, 2, grip));
  assert.deepEqual(posed.map(value => value.label), ["self", "remote"]);
  assert.equal(callback("unknown", tip, 2, grip), null);
  engine.self.moving = true; assert.equal(callback("own-visit", tip, 2, grip), null); engine.self.moving = false;
  engine.self.z = 5; assert.equal(callback("own-visit", tip, 2, grip), null); engine.self.z = 3;
  engine.skyRest = {}; assert.equal(callback("own-visit", tip, 2, grip), null); engine.skyRest = null;
  const remote = engine.players.get("remote");
  remote.data.pose = "lying"; assert.equal(callback("remote", tip, 2, grip), null); delete remote.data.pose;
  remote.target.moving = true; assert.equal(callback("remote", tip, 2, grip), null); remote.target.moving = false;
  remote.cur.yaw += Math.PI; assert.equal(callback("remote", tip, 2, grip), null); remote.cur.yaw -= Math.PI;
  remote.avatar = null; assert.equal(callback("remote", tip, 2, grip), null, "pixel fallback has no rigged hand");
  engine.applyUyuniMoments(events, 102, "new-visit");
  assert.equal(callback("own-visit", tip, 2, grip), null, "re-entry never attaches an old pid to the new self actor");
  engine.disposed = true; assert.equal(callback("new-visit", tip, 2, grip), null);
});

test("one frame poses both actors before updating the handheld effect and renders afterward", () => {
  const order = [];
  const engine = Object.assign(Object.create(BeachEngine.prototype), {
    mapId: "uyuni", quality: "high", qualityWarmupUntil: Infinity, lastRender: 0, lastDaylightAt: Infinity,
    time: 0, clock: { update() {}, getDelta: () => .016 }, camera: new THREE.PerspectiveCamera(),
    skyMat: { uniforms: { uTime: { value: 0 } } }, uyuni: { update() {} },
    updateSelf() { order.push("self pose"); }, syncSkyResolution() {}, updatePlayers() { order.push("remote pose"); }, updateFx() {},
    uyuniMoments: { update() { order.push("handheld IK"); } },
    renderer: { domElement: { height: 844 }, render() { order.push("render"); } },
  });
  engine.frame();
  assert.deepEqual(order, ["self pose", "remote pose", "handheld IK", "render"]);
});

test("Uyuni has no inherited beach colliders, raised floors or ceilings outside the new hotels", () => {
  const { engine } = fixture(), beach = fixture("beach").engine;
  const centers = [...huts.SHELTER_COLLIDERS, ...hotSpring.HOT_SPRING_COLLIDERS]
    .map(wall => [(wall.minX + wall.maxX) / 2, (wall.minZ + wall.maxZ) / 2])
    .filter(([x, z]) => uyuniHotelFloorHeight(x, z) === 0 && z < 54);
  assert.ok(centers.length > 0);
  for (const [x, z] of [[0.1, 12], ...centers]) {
    assert.deepEqual(plain(engine.collide(x, z)), [x, z]);
    assert.equal(engine.cameraFree(new THREE.Vector3(x, 1, z)), true);
  }
  assert.notDeepEqual(plain(beach.collide(0.1, 12)), [0.1, 12], "the comparison beach really has a fire collider");
  for (const { x, z } of [...huts.SHELTERS, ...hotSpring.ONSEN_SEATS, hotSpring.HOT_SPRING].filter(({ x, z }) => uyuniHotelFloorHeight(x, z) === 0)) {
    assert.ok(beach.deckHeight(x, z) > 0, "the test visits real elevated beach geometry");
    assert.equal(engine.deckHeight(x, z), 0);
  }
  Object.assign(engine.self, { x: 0, z: hotSpring.HOT_SPRING.z });
  engine.updateSelf(0.2);
  close(engine.eyeHeight, 1.55); close(engine.selfNode.avatar.states.at(-1).y, 0);
  assert.equal(engine.selfNode.avatar.kind, "male", "old onsen coordinates must not change clothing");
  engine.skin = 3; engine.updateSelf(0.2);
  assert.equal(engine.selfNode.avatar.kind, "female");
});

test("beach action targets and confirmed beach poses cannot move a Uyuni visitor", async () => {
  const { engine, events } = fixture();
  const claims = [
    { ...benches.FIRE_BENCH_SEATS[0], pose: "sitting" },
    { ...hotSpring.ONSEN_SEATS[0], pose: "sitting" },
    { ...hotSpring.ONSEN_FLOATS[0], pose: "lying" },
    { ...huts.bedSlot(`hut-${huts.SHELTERS[0].id}`, 0), pose: "lying" },
  ];
  for (const claim of claims) {
    Object.assign(engine.self, { x: -4, z: 6 });
    const before = { ...engine.self };
    engine.applyRest(claim); engine.toggleRest();
    assert.deepEqual(engine.self, before);
    assert.equal(engine.skyRest, null); assert.equal(engine.fixedSeat, null); assert.equal(engine.restSeat, null);
    assert.equal(engine.getBedState(), null); assert.equal(engine.nearbySeat(), null);
    assert.deepEqual(plain(engine.getBenchState()), { near: false, seated: false, occupied: 0, capacity: 0, available: false });
    assert.deepEqual(plain(engine.onsenState), { inWater: false, canSit: false, canFloat: false, sitting: false, floating: false, occupiedSeats: [], occupiedFloats: [] });
  }
  assert.equal(await engine.walkToFire(), "cancelled");
  assert.equal(await engine.walkToBed(`hut-${huts.SHELTERS[0].id}`), "cancelled");
  assert.equal(engine.auto, null);
  Object.assign(engine.self, { x: 0, z: 12 }); engine.updateSelf(0.1);
  assert.equal(engine.nearFire, false); assert.deepEqual(events.fire, []);
  engine.onKey({ key: "e", type: "keydown", repeat: false, target: null, preventDefault() {} });
  assert.ok(!events.bench.includes("action"), "E cannot request a seat in an absent bench");
});

test("Uyuni builds only the stargazing props and ignores shared fire updates", () => {
  const { engine } = fixture();
  engine.obstacles = [];
  engine.buildProps();
  assert.equal(engine.scene.getObjectByName("stargazing-starlight").children.filter(child => child.name.startsWith("stargazing-mat-")).length, 8);
  assert.deepEqual(engine.obstacles, []);
  assert.equal(engine.fire, undefined); assert.equal(engine.lanterns, undefined);
  engine.firePowder = { sync() { assert.fail("a room fire event cannot start powder playback in Uyuni"); } };
  engine.setFireState({ logs: 12, color: "rose" });
  assert.equal(engine.fireState, undefined);
});

test("the star circle remains reachable, claims only after confirmation and restores standing", async () => {
  const { engine, camera, events } = fixture();
  const walk = engine.walkToStargazing();
  assert.equal(engine.skyRest, null);
  for (let frame = 0; frame < 240 && engine.auto; frame++) engine.updateSelf(0.05);
  assert.equal(engine.auto, null); assert.equal(await walk, "arrived");
  assert.equal(engine.skyRest, null); assert.equal(events.star.at(-1).near, true);
  const slot = stargazingSlot(2);
  engine.applyRest({ pose: "lying", ...slot }); engine.updateSelf(0.1);
  assert.equal(engine.skyRest.spotId, STARGAZING.id); assert.equal(engine.isLying, true);
  close(engine.self.x, slot.x); close(engine.self.z, slot.z);
  assert.equal(events.star.at(-1).occupied, 1); assert.equal(events.star.at(-1).capacity, 8);
  engine.setView("first"); engine.updateSelf(0.1);
  assert.equal(camera.layers.mask, 2); assert.ok(camera.getWorldDirection(new THREE.Vector3()).y > 0.98);
  engine.setMove(1, 1); engine.updateSelf(0.1); close(engine.self.x, slot.x);
  const standing = { pose: "standing", spotId: null, slot: null, x: -3, z: 4, yaw: 0.4 };
  engine.applyRest(standing); engine.updateSelf(0.1);
  assert.equal(engine.isLying, false); assert.equal(camera.layers.mask, 1); close(engine.eyeHeight, 1.55);
  engine.setMove(0, 1); engine.updateSelf(0.1);
  assert.ok(Math.hypot(engine.self.x - standing.x, engine.self.z - standing.z) > 0.2);
});

test("remote beach rest claims stay standing while valid Uyuni star claims still anchor avatars", () => {
  const { engine } = fixture();
  const claims = [
    { ...benches.FIRE_BENCH_SEATS[0], pose: "sitting" },
    { ...hotSpring.ONSEN_SEATS[0], pose: "sitting" },
    { ...hotSpring.ONSEN_FLOATS[0], pose: "lying" },
    { ...huts.bedSlot(`hut-${huts.SHELTERS[0].id}`, 0), pose: "lying" },
  ];
  for (const claim of claims) {
    engine.setPlayers([{ pid: "guest", nick: "friend", skin: 0, ...claim, x: -4, z: 6, yaw: 0.3, moving: true }]);
    engine.updatePlayers(1);
    const node = engine.players.get("guest"), pose = node.avatar.states.at(-1);
    close(node.cur.x, -4); close(node.cur.z, 6); close(pose.y, 0);
    assert.equal(pose.lying, null); assert.equal(pose.seated, null); assert.equal(pose.moving, true);
  }
  const slot = stargazingSlot(4);
  engine.setPlayers([{ pid: "guest", nick: "friend", skin: 0, pose: "lying", ...slot, x: -4, z: 6, yaw: 0.3, moving: true }]);
  engine.updatePlayers(1);
  const node = engine.players.get("guest"), pose = node.avatar.states.at(-1);
  close(node.cur.x, slot.x); close(node.cur.z, slot.z);
  assert.equal(pose.lying.spotId, STARGAZING.id); assert.equal(pose.moving, false);
});

test("world frames forward the exact camera, clock and walking state without touching beach-only effects", () => {
  const { engine, camera, events } = fixture();
  engine.skyMat = { uniforms: { uTime: { value: 0 } } };
  // A missed map branch would fail immediately instead of silently updating an unused sea.
  for (const key of ["seaMat", "fire", "firePowder", "cove", "lanterns"]) {
    Object.defineProperty(engine, key, { get() { assert.fail(`Uyuni update accessed ${key}`); } });
  }
  const fireworks = [];
  engine.fireworks = { update: (...args) => fireworks.push(args) };
  engine.time = 17.25; engine.self.moving = true; engine.updateWorld(0.016);
  assert.equal(engine.skyMat.uniforms.uTime.value, 17.25);
  assert.deepEqual(events.world[0], [17.25, camera, engine.self]);
  engine.self.moving = false; engine.time = 18; engine.updateWorld(0.016);
  assert.equal(events.world[1][2].moving, false);
  assert.deepEqual(fireworks[1], [camera, undefined, 717]);
});

test("quality changes lower water work, preserve the mobile budget and never turn on Uyuni shadows", () => {
  const { engine, events } = fixture();
  engine.resize(); engine.setQuality("low"); engine.setQuality("low"); engine.setQuality("high");
  assert.deepEqual(events.waterQuality, [true, false]); assert.deepEqual(events.quality, ["low", "high"]);
  assert.equal(engine.renderer.shadowMap.enabled, false);
  assert.equal(events.buffers.length, 3);
  for (const [width, height, ratio] of events.buffers) {
    assert.ok(Math.floor(width * ratio) * Math.floor(height * ratio) < 410_000);
  }
  const beach = fixture("beach").engine;
  beach.setQuality("low"); assert.equal(beach.renderer.shadowMap.enabled, false);
  beach.setQuality("high"); assert.equal(beach.renderer.shadowMap.enabled, true, "beach retains its existing shadow tier");
});

test("hotel ramps, raised floors and walls constrain movement and the mobile follow camera", () => {
  for (const hotel of UYUNI_HOTELS) {
    const { engine, camera } = fixture(); engine.obstacles = [];
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const z = hotel.z + UYUNI_HOTEL_DECK.front - UYUNI_HOTEL_DECK.rampLength * (1 - progress);
      close(engine.deckHeight(hotel.x, z), hotel.floorY * progress);
    }
    const wall = UYUNI_HOTEL_COLLIDERS.find(wall => Math.abs((wall.minX + wall.maxX) / 2 - hotel.x - 4.72) < 0.01);
    const wallX = (wall.minX + wall.maxX) / 2, wallZ = (wall.minZ + wall.maxZ) / 2;
    assert.notDeepEqual(plain(engine.collide(wallX, wallZ)), [wallX, wallZ]);
    assert.equal(engine.cameraFree(new THREE.Vector3(wallX, 1.5, wallZ)), false);
    const x = hotel.x, z = hotel.z + 0.3, ceiling = uyuniHotelCeilingHeight(x, z);
    assert.equal(engine.cameraFree(new THREE.Vector3(x, hotel.floorY + 0.1, z)), false);
    assert.equal(engine.cameraFree(new THREE.Vector3(x, ceiling + 0.1, z)), false);
    assert.equal(engine.cameraFree(new THREE.Vector3(x, hotel.floorY + 1.55, z)), true);
    Object.assign(engine.self, { x, z }); engine.updateSelf(0.2);
    close(engine.eyeHeight, hotel.floorY + 1.55);
    close(engine.selfNode.avatar.states.at(-1).y, hotel.floorY);
    engine.setView("third"); engine.updateSelf(0.2);
    assert.ok(camera.position.toArray().every(Number.isFinite));
    assert.equal(engine.cameraFree(camera.position), true, "the phone follow camera stays above the deck and below the roof");
  }
});

test("both hotel beds are reachable from outside and returning to the star circle avoids the hotel shell", async () => {
  for (const hotel of UYUNI_HOTELS) {
    const { engine } = fixture(); engine.obstacles = [];
    const spotId = `hotel-${hotel.id}`;
    Object.assign(engine.self, { x: hotel.x + 7, z: hotel.z + 7 });
    const walking = engine.walkToBed(spotId);
    for (let frame = 0; frame < 1200 && engine.auto; frame++) engine.updateSelf(0.05);
    assert.equal(engine.auto, null, `${spotId} approach cannot remain stuck behind the shell`);
    assert.equal(await walking, "arrived");
    assert.equal(engine.skyRest, null, "arrival does not grant a bed before the server replies");
    assert.equal(engine.getBedState().spotId, spotId);
    assert.equal(engine.getBedState().capacity, 2);
    assert.ok(Math.abs(engine.self.x - hotel.x) <= 4.35 && engine.self.z >= hotel.z - 4.5
      && Math.hypot(engine.self.x - hotel.x, engine.self.z - hotel.z) <= 5.5, "arrival is inside the server's claim area");
    const back = engine.walkToStargazing();
    for (let frame = 0; frame < 1600 && engine.auto; frame++) engine.updateSelf(0.05);
    assert.equal(engine.auto, null);
    assert.equal(await back, "arrived");
    assert.ok(Math.hypot(engine.self.x - STARGAZING.x, engine.self.z - STARGAZING.z) < STARGAZING.nearRadius);
  }
});

test("hotel lying uses the confirmed raised pillow, preserves camera drag on retry, and restores the deck", () => {
  for (const hotel of UYUNI_HOTELS) {
    for (const slot of [0, 1]) {
      const { engine, camera } = fixture();
      const bed = uyuniHotelBedSlot(`hotel-${hotel.id}`, slot);
      engine.applyRest({ ...bed, pose: "lying", x: -999, z: -999, yaw: 0 });
      assert.equal(engine.isBedLying, true); assert.equal(engine.isLying, true);
      close(engine.self.x, bed.x); close(engine.self.z, bed.z);
      engine.updateSelf(0.1);
      assert.equal(camera.layers.mask, 1, "hotel views retain the room and mirror, rather than sky-only rendering");
      assert.ok(camera.position.y > hotel.floorY && camera.position.y < uyuniHotelCeilingHeight(camera.position.x, camera.position.z));
      engine.setView("first"); engine.self.yaw = 0.18; engine.self.pitch = 0.12; engine.updateSelf(0.1);
      assert.equal(camera.layers.mask, 1);
      assert.ok(camera.position.y > bed.avatarY);
      assert.ok(camera.getWorldDirection(new THREE.Vector3()).z < -0.9, "the bed looks toward the open front");
      const position = camera.position.clone(), rotation = camera.quaternion.clone();
      engine.applyRest({ ...bed, pose: "lying" }); engine.updateSelf(0.1);
      close(position.distanceTo(camera.position), 0);
      assert.ok(rotation.angleTo(camera.quaternion) < 1e-6, "a repeated server snapshot cannot reset looking around");
      engine.setMove(1, 1); engine.updateSelf(0.1); close(engine.self.x, bed.x);
      const standing = { pose: "standing", spotId: null, slot: null, x: hotel.x, z: hotel.z + 0.3, yaw: 0.4 };
      engine.applyRest(standing); engine.updateSelf(0.1);
      assert.equal(engine.isLying, false); close(engine.eyeHeight, hotel.floorY + 1.55);
      close(engine.self.x, standing.x); close(engine.self.z, standing.z);
    }
  }
});

test("hotel sofas sit only from the room interior and return to the prior walking position", () => {
  for (const hotel of UYUNI_HOTELS) {
    const { engine } = fixture();
    Object.assign(engine.self, { x: hotel.x - 5, z: hotel.z - 1.85 });
    assert.equal(engine.nearbySeat(), null, "a visitor outside the glass wall cannot sit through it");
    const before = { x: hotel.x - 1.8, z: hotel.z - 1.85 };
    Object.assign(engine.self, before);
    const seat = engine.nearbySeat();
    assert.ok(UYUNI_HOTEL_SEATS.some(candidate => candidate.id === seat.id));
    engine.toggleRest(); engine.updateSelf(0.2);
    assert.equal(engine.restSeat.id, seat.id);
    close(engine.self.x, seat.x); close(engine.self.z, seat.z);
    close(engine.eyeHeight, hotel.floorY + 1.3);
    engine.toggleRest();
    assert.equal(engine.restSeat, null); close(engine.self.x, before.x); close(engine.self.z, before.z);
  }
});

test("a phone orbit keeps the sofa in sight through roof edges and interpolated turns", () => {
  for (const hotel of UYUNI_HOTELS) {
    const seats = UYUNI_HOTEL_SEATS.filter(seat => seat.shelterId === `hotel-${hotel.id}`);
    assert.equal(seats.length, 2);
    for (const seat of seats) {
      const { engine, camera } = fixture();
      Object.assign(engine.self, { x: hotel.x - 1.8, z: seat.z });
      engine.toggleRest(); engine.setView("third"); engine.updateSelf(0.1);
      assert.equal(engine.restSeat.id, seat.id);
      for (const pitch of [-0.55, 0.015, 0.4, 0.5]) {
        for (let step = 0; step <= 40; step++) {
          engine.orbitYaw = -Math.PI + step * Math.PI / 20;
          engine.self.pitch = pitch;
          engine.updateSelf(1 / 60);
          assert.equal(engine.cameraFree(camera.position), true, `the interpolated camera remains outside the roof and rear wall: ${JSON.stringify({ seat: seat.id, pitch, step, camera: camera.position.toArray() })}`);
          const focus = new THREE.Vector3(seat.x, hotel.floorY + 1, seat.z);
          for (let t = 0.01; t <= 1; t += 0.01) {
            const ray = focus.clone().lerp(camera.position, t);
            const roof = uyuniHotelCeilingHeight(ray.x, ray.z);
            assert.ok(roof === null || ray.y < roof - 0.17, "the curved roof cannot cross the view between sofa and camera");
            assert.ok(Math.abs(ray.x - hotel.x) >= 4.9 || Math.abs(ray.z - hotel.z - 4.8) >= 0.25,
              "the opaque rear wall cannot cut across the sofa view");
          }
          const aim = new THREE.Vector3(seat.x, hotel.floorY + 1.45, seat.z).sub(camera.position).normalize();
          assert.ok(camera.getWorldDirection(new THREE.Vector3()).dot(aim) > 0.9999, "the camera continues looking at the seated person while turning");
        }
      }
    }
  }
});

test("temporary pixel fallbacks fold their knees on hotel sofas while 3D models are unavailable", () => {
  for (const hotel of UYUNI_HOTELS) {
    for (const skin of [1, 2]) {
      const { engine } = fixture();
      engine.avatarModels = engine.femaleAvatarModels = null;
      engine.skin = skin; engine.view = "third";
      Object.assign(engine.self, { x: hotel.x - 1.8, z: hotel.z - 1.85 });
      engine.updateSelf(0.1);
      const sprite = engine.selfNode.sprite, geometry = sprite.geometry;
      const standing = Array.from(geometry.getAttribute("position").array);
      assert.equal(sprite.visible, true); assert.equal(engine.selfNode.avatar, null);
      engine.toggleRest(); engine.updateSelf(0.1);
      assert.equal(geometry.userData.seated, true);
      close(sprite.position.y, hotel.floorY);
      close(engine.selfNode.shadow.position.y, hotel.floorY + 0.015);
      const position = geometry.getAttribute("position"), uv = geometry.getAttribute("uv");
      const lap = [];
      for (let i = 0; i < position.count; i++) {
        const originalY = standing[i * 3 + 1];
        if (originalY > 0.4 && originalY < 0.7) lap.push(position.getY(i));
        if (uv.getY(i) > 0.75) close(position.getY(i) - originalY, -0.2, "the upper body keeps its height while moving down to the seat");
      }
      assert.ok(lap.length >= 4 && Math.max(...lap) - Math.min(...lap) < 0.03,
        "the thighs form a seated lap instead of retaining a standing leg silhouette");
      engine.toggleRest(); engine.updateSelf(0.1);
      assert.equal(geometry.userData.seated, false);
      for (let i = 0; i < standing.length; i++) close(position.array[i], standing[i], "standing restores every sprite vertex");
    }
  }
});

test("remote hotel beds count only their two unique slots and never enter the beach map", () => {
  const { engine } = fixture(), beach = fixture("beach").engine;
  const hotel = UYUNI_HOTELS[0], spotId = `hotel-${hotel.id}`;
  Object.assign(engine.self, { x: hotel.x, z: hotel.z + 0.3 });
  const people = [0, 0, 1, 2].map((slot, index) => ({ pid: `guest-${index}`, nick: "friend", skin: 0,
    pose: "lying", spotId, slot, x: 0, z: 4, yaw: 0.3, moving: true }));
  people.push({ ...people[0], pid: "other-hotel", spotId: "hotel-dusk" });
  engine.setPlayers(people); engine.updatePlayers(1);
  assert.equal(engine.getBedState().occupied, 2); assert.equal(engine.getBedState().capacity, 2);
  const remote = engine.players.get("guest-0"), canonical = uyuniHotelBedSlot(spotId, 0);
  close(remote.cur.x, canonical.x); close(remote.cur.z, canonical.z);
  assert.equal(remote.avatar.states.at(-1).lying.avatarY, canonical.avatarY);
  assert.equal(engine.players.get("guest-3").avatar.states.at(-1).lying, null, "invalid hotel slot 2 stays standing");
  beach.setPlayers([people[0]]); beach.updatePlayers(1);
  assert.equal(beach.players.get("guest-0").avatar.states.at(-1).lying, null);
  close(beach.players.get("guest-0").cur.x, 0); close(beach.players.get("guest-0").cur.z, 4);
  beach.applyRest({ ...canonical, pose: "lying" });
  assert.equal(beach.isLying, false);
});
