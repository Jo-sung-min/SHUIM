import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";

const source = stripTypeScriptTypes(await readFile(new URL("../lib/beach/room-music.ts", import.meta.url), "utf8"))
  .replace(/^import[^\n]*\n/gm, "").replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
const flags = (trackId, version, startedAt) => ({ ...({
  "morning-v1": {trackId, title:"아침만남겨주고", durationMs:257520},
  "tomorrow-v1": {trackId, title:"내일의우리", durationMs:240000},
})[trackId], playing:startedAt !== null, startedAt, version });
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture({ mini=false, blocked=false, defer=false }={}) {
  let now = 0;
  const statuses=[], elements=[], contexts=[], calls=[], removed=[], deferred=[], blobs=[];
  const document = Object.assign(new EventTarget(), {hidden:false});
  const storage = new Map();
  class Graph {
    state=blocked?"suspended":"running"; currentTime=0; destination={}; gains=[];
    constructor(){contexts.push(this);}
    createGain(){const gain={value:0,setTargetAtTime(value){this.value=value;}};this.gains.push(gain);return {gain,connect(){},disconnect(){}};}
    createMediaElementSource(){return {connect(){},disconnect(){}};}
    async resume(){this.state="running";}
    async close(){this.state="closed";}
  }
  class Audio {
    src=""; paused=true; ended=false; readyState=0; currentTime=0; volume=1; plays=0;
    constructor(){elements.push(this);}
    metadata(){this.readyState=1;this.onloadedmetadata?.();}
    async play(){this.paused=false;this.plays++;}
    pause(){this.paused=true;}
    removeAttribute(name){if(name==="src")this.src="";}
    load(){}
  }
  let nextBlob=0;
  const window=Object.assign(new EventTarget(),{AudioContext:Graph});
  const context={document,Audio,URLSearchParams,AbortController,AbortSignal,Blob,window, IS_AIT:mini,
    URL:{createObjectURL:blob=>{blobs.push(blob);return "blob:qa-"+(++nextBlob);},revokeObjectURL:url=>removed.push(url)},
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},performance:{now:()=>now},
    fetch:async(url,options)=>{
      calls.push({url,options});
      if(options.method==="POST")return Response.json({music:flags("tomorrow-v1",2,10000),serverTime:10010});
      if(defer)await new Promise(resolve=>deferred.push(resolve));
      return new Response(new Blob(["test audio bytes"],{type:"audio/mpeg"}));
    }};
  vm.runInNewContext(source+"\nglobalThis.api={RoomMusicPlayer, readRoomMusic, changeRoomMusic,readMusicPreferences};",context);
  const player=new context.api.RoomMusicPlayer("room & 2","bamboo",{volume:.32,muted:false},s=>statuses.push(s));
  return {...context.api,player,statuses,elements,contexts,calls,removed,deferred,storage,blobs,
    tap:()=>window.dispatchEvent(new Event("pointerup")),advance:ms=>now+=ms,hidden:hidden=>{document.hidden=hidden; document.dispatchEvent(new Event("visibilitychange"));}};
}

test("both catalogue entries require the approved title, timing and server version",()=>{
  const h=fixture();
  for(const id of ["morning-v1","tomorrow-v1"]){
    const state=flags(id,3,150);assert.equal(h.readRoomMusic(state).trackId,id);
    for(const wrong of [{...state,trackId:"custom"},{...state,title:"other"},{...state,durationMs:5},{...state,playing:false},{...state,version:-1}])
      assert.equal(h.readRoomMusic(wrong),null);
    assert.equal(h.readRoomMusic(flags(id,4,null)).startedAt,null);
  }h.player.dispose();
});

test("late joining, switching tracks and stale snapshots preserve the listener's private Web Audio gain",async()=>{
  const h=fixture(), a=flags("morning-v1",2,1000), b=flags("tomorrow-v1",3,22_000);
  h.player.sync(a,21_000);const first=h.elements[0];first.metadata();await settle();
  assert.equal(first.currentTime,20);assert.match(first.src,/communityId=room\+%26\+2&mapId=bamboo&trackId=morning-v1/);
  h.player.setPreferences({muted:false,volume:.57});assert.equal(h.contexts[0].gains[0].value,.57);
  h.player.sync(b,23_000);const second=h.elements[1];second.metadata();await settle();
  assert.ok(first.paused);assert.equal(first.src,"");assert.match(second.src,/trackId=tomorrow-v1$/);
  assert.equal(second.currentTime,1);assert.equal(h.contexts[0].gains[0].value,.57);
  h.player.sync(a,24_000);assert.equal(h.elements.length,2);assert.equal(second.paused,false);
  h.player.setPreferences({muted:true,volume:.57});assert.equal(h.contexts[0].gains[0].value,0);assert.equal(second.paused,true);
  assert.equal(h.readMusicPreferences().muted,true);
  h.advance(8000);h.player.setPreferences({muted:false,volume:.57});await settle();assert.equal(second.currentTime,9);
  assert.equal(h.calls.length,0,"a listener's volume, mute and resync send no room commands");
  h.player.sync(flags("tomorrow-v1",4,null),31_000);assert.ok(second.paused);assert.equal(second.src,"");
  h.player.dispose();assert.equal(h.contexts[0].state,"closed");
});

test("blocked autoplay offers one local listening gesture; hidden and disconnected playback pause and catch up",async()=>{
  const h=fixture({blocked:true});h.player.sync(flags("morning-v1",1,1000),6000);
  const media=h.elements[0];media.metadata();await settle();
  assert.equal(h.statuses.at(-1),"listen");assert.equal(media.plays,0);
  h.player.listen(true);await settle();assert.equal(h.statuses.at(-1),"playing");assert.equal(media.currentTime,5);
  h.hidden(true);assert.ok(media.paused);h.advance(9000);h.hidden(false);await settle();assert.equal(media.currentTime,14);
  h.player.setSuspended(true);assert.ok(media.paused);h.advance(2000);h.player.setSuspended(false);await settle();
  assert.equal(media.currentTime,16);assert.equal(h.calls.length,0);
  h.advance(300000);h.player.sync(flags("morning-v1",1,1000),320_000);assert.equal(media.src,"");assert.ok(media.paused);
  h.player.dispose();
});

test("mini-app uses authenticated API fetch, aborts superseded data and revokes the active blob",async()=>{
  const h=fixture({mini:true,defer:true});h.player.sync(flags("morning-v1",1,1000),2000);
  h.player.sync(flags("tomorrow-v1",2,3000),3100);assert.equal(h.calls.length,2);
  assert.ok(h.calls[0].options.signal.aborted);assert.ok(!h.calls[1].options.signal.aborted);
  assert.ok(h.calls.every(c=>c.url.startsWith("/api/beach/music/audio?") && c.options.cache==="no-store"));
  h.deferred[1]();await settle();h.deferred[0]();await settle();
  assert.equal(h.elements[0].src,"");assert.equal(h.elements[1].src,"blob:qa-1");
  assert.equal(h.blobs[0].type,"audio/mpeg","the replacement MP3 keeps its correct MIME in the authenticated mini-app");
  h.player.dispose();assert.deepEqual(h.removed,["blob:qa-1"]);
});

test("the full replacement songs remain playable until their new duration and stop exactly at completion",async()=>{
  for(const [id,duration] of [["morning-v1",257520],["tomorrow-v1",240000]]){
    const h=fixture(), state=flags(id,1,1000);
    assert.equal(state.durationMs,duration);
    h.player.sync(state,164_000);
    const media=h.elements[0];media.metadata();await settle();
    assert.equal(media.currentTime,163,"morning continues beyond the old short recording");
    h.player.sync(state,1000+duration-1);assert.ok(media.src);assert.equal(media.paused,false);
    h.player.sync(state,1000+duration);assert.equal(media.src,"");assert.equal(media.paused,true);
    h.player.dispose();
  }
});

test("an ordinary room tap unlocks the listener for later broadcasts without downloading an idle track",async()=>{
  const h=fixture({blocked:true});
  h.player.sync(flags("morning-v1",0,null),1000);h.tap();await settle();
  assert.equal(h.contexts[0].state,"running");assert.equal(h.elements.length,0);assert.equal(h.calls.length,0);
  h.player.sync(flags("tomorrow-v1",1,3000),3100);h.elements[0].metadata();await settle();
  assert.equal(h.statuses.at(-1),"playing");assert.equal(h.elements[0].plays,1);
  h.player.dispose();
});

test("only explicit commands send the owned ticket, selected track and observed version",async()=>{
  const h=fixture();const signal=new AbortController().signal;
  await h.changeRoomMusic("owned","play",7,signal,"tomorrow-v1");
  await h.changeRoomMusic("owned","stop",8,signal,"tomorrow-v1");
  assert.deepEqual(h.calls.map(c=>JSON.parse(c.options.body)),[
    {ticket:"owned",action:"play",expectedVersion:7,trackId:"tomorrow-v1"},
    {ticket:"owned",action:"stop",expectedVersion:8},
  ]);
  h.player.dispose();
});
