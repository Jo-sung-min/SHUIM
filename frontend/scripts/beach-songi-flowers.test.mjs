import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";

const source=stripTypeScriptTypes(await readFile(new URL("../lib/beach/firework-songi-flowers.ts",import.meta.url),"utf8"))
  .replace(/\bexport\s+(?=function\b|const\b)/g,"");
const context={};vm.runInNewContext(`${source}\nglobalThis.api={buildSongiFlowers,SONGI_FLOWER_GLSL,SONGI_FLOWER_MOTION};`,context);
const {buildSongiFlowers,SONGI_FLOWER_GLSL:glsl}=context.api;
const sameJson=value=>JSON.parse(JSON.stringify(value));

test("nine flowers reuse exactly the existing spherical bank, with one rose, three tulips and five cosmos",()=>{
  for(const mobile of [true,false]) {
    const show=buildSongiFlowers(1729,mobile,1.8);
    assert.equal(show.particles.length,mobile?3168:7680);
    assert.deepEqual(sameJson(show.launches.map(f=>f.kind)),["rose","tulip","tulip","tulip","cosmos","cosmos","cosmos","cosmos","cosmos"]);
    for(const bloom of show.launches) {
      const samples=show.particles.filter(p=>p.flowerId===bloom.id);
      const heads=samples.filter(p=>p.delay===0);
      assert.equal(heads.length,bloom.kind==="rose"?(mobile?192:320):bloom.kind==="tulip"?(mobile?128:192):(mobile?96:128));
      assert.equal(samples.length,heads.length*show.tails);
      for(let i=0;i<samples.length;i+=show.tails) {
        const head=samples[i];
        for(let tail=0;tail<show.tails;tail++) {
          const p=samples[i+tail];
          assert.deepEqual(p.target,head.target,"a tail follows its head's trajectory rather than tracing a separate static contour");
          assert.equal(p.phase,head.phase);assert.equal(p.life,head.life);
          assert.ok(Math.abs(p.delay-tail*.28/(show.tails-1))<1e-10);
        }
      }
    }
  }
});

test("flower shapes have distinct petal profiles, coloured stems and gold cosmos centres",()=>{
  const show=buildSongiFlowers(1729,true),rgb=hex=>[hex>>16&255,hex>>8&255,hex&255];
  for(const bloom of show.launches) {
    const heads=show.particles.filter(p=>p.flowerId===bloom.id&&p.delay===0);
    const greens=heads.filter(p=>{const[r,g,b]=rgb(p.color);return g>r*1.3&&g>b*1.1;});
    if(bloom.kind==="cosmos") {
      assert.equal(greens.length,0);assert.equal(heads.filter(p=>p.color===0xffc947).length,8);
      const petals=heads.filter(p=>p.color!==0xffc947),sectors=new Set();
      for(const p of petals) {
        const a=(Math.atan2(p.target[1],p.target[0])+Math.PI*2)%(Math.PI*2);
        sectors.add(Math.round(a/(Math.PI/4))%8);
      }
      assert.equal(sectors.size,8,"cosmos petals radiate in eight separately shaped directions");
    } else {
      assert.equal(greens.length,24);assert.ok(Math.min(...greens.map(p=>p.target[1]))<-35);
      const petals=heads.filter(p=>!greens.includes(p));
      if(bloom.kind==="tulip") {
        assert.ok(Math.max(...petals.map(p=>p.target[1]))>22);
        assert.ok(Math.min(...petals.map(p=>p.target[1]))>-16,"the cup narrows above its short green stem");
        assert.ok(Math.max(...petals.map(p=>Math.abs(p.target[0])))<20);
      } else {
        assert.ok(new Set(petals.map(p=>p.color)).size>=4,"a rose curls from a warm centre into red outer whorls");
        assert.ok(Math.max(...petals.map(p=>p.target[2]))-Math.min(...petals.map(p=>p.target[2]))>3,"rose strands retain some depth");
      }
    }
    for(const p of heads) {const c=rgb(p.color);assert.ok(Math.max(...c)-Math.min(...c)>50,"flowers retain saturated colour instead of all-white tips");}
  }
});

test("launches precede each flower, grouped reports stay spaced and the last petals overlap the incoming finale",()=>{
  const show=buildSongiFlowers(93,true),groups=[];
  for(const launch of show.launches) {
    assert.equal(launch.flight,1.3);
    const group=groups.at(-1);
    if(!group||launch.start-group[0].start>=.75)groups.push([launch]);else group.push(launch);
    for(const p of show.particles.filter(p=>p.flowerId===launch.id)) {
      assert.deepEqual(p.center,launch.center);assert.equal(p.start,launch.start);
      assert.ok(p.start+p.life<=show.lastBurnout);
    }
  }
  assert.deepEqual(groups.map(g=>g.length),[1,3,5]);
  assert.ok(groups[2][0].start-groups[0][0].start>2.48,"a two-voice distant audio pool has room for the third flower report");
  assert.ok(show.launches[0].start-1.3<8,"flowers ascend during the previous spherical encore");
  assert.ok(show.lastBurnout>14.2&&show.lastBurnout<14.5,"last sparks fade as the puppy starts, not after its readable stage");
});

test("seeded bloom data is deterministic and all coordinates, alpha and lifetimes stay finite",()=>{
  for(const mobile of [true,false]) {
    const a=buildSongiFlowers(5,mobile),b=buildSongiFlowers(5,mobile),c=buildSongiFlowers(6,mobile),grand=buildSongiFlowers(5,mobile,1.8);
    assert.deepEqual(a,b);assert.notDeepEqual(a.particles,c.particles);
    assert.deepEqual(a.launches,c.launches,"seed changes ember variation, never shared cue positions or times");
    for(const [i,p]of a.particles.entries()) {
      assert.ok([...p.target,...p.center,p.start,p.delay,p.life,p.alpha,p.phase,p.streak].every(Number.isFinite));
      assert.ok(p.alpha>0&&p.alpha<=1);assert.ok(p.life>1.8&&p.life<=2);
      assert.ok(p.target.every(v=>Math.abs(v)<45));
      assert.ok(Math.abs(p.center[0]+p.target[0]*1.28)+2<=a.maxHalfWidth+1e-9);
      assert.ok(Math.abs(p.center[1]+p.target[1]*1.28)+2<=a.maxHalfHeight);
      for(let axis=0;axis<3;axis++)assert.ok(Math.abs(grand.particles[i].target[axis]-p.target[axis]*1.8)<1e-9);
    }
  }
});

test("actual shader expansion uses the existing heart impulse and keeps delayed tails moving outward",()=>{
  const expression=glsl.match(/float expansion=([^;]+);/)[1];
  const expand=new Function("t","exp",`return ${expression}`);
  for(const t of [.08,.3,.65,1.05,1.6]) {
    assert.ok(Math.abs(expand(t,Math.exp)-1.28*(1-Math.exp(-1.05*t)))<1e-12);
    assert.ok(expand(t+.05,Math.exp)>expand(t,Math.exp),"even late heads continue outward instead of settling onto a sign");
    if(t>.28)assert.ok(expand(t,Math.exp)-expand(t-.28,Math.exp)>.08,"a short delayed tail still creates a visible burning trail");
  }
  assert.ok(glsl.includes("tangent=(uTextRight*motion.x"));
});

test("actual flower fade waits for each delayed sample and burns every tail out with its head",()=>{
  const smoothstep=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  const scope={step:(a,b)=>b>=a?1:0,smoothstep,mix:(a,b,t)=>a*(1-t)+b*t,exp:Math.exp,max:Math.max};
  const fade=glsl.slice(glsl.indexOf("alpha=step"),glsl.indexOf("tip=head"));
  vm.runInNewContext(`globalThis.sample=(shellAge,delay,life,glint)=>{const t=max(0,shellAge-delay),head=delay===0?1:0,flowerBurn={x:delay,z:.7},flowerCenter={w:life},burnout=smoothstep(.9,life,shellAge);let alpha;${fade}return alpha;};`,scope);
  for(const life of [1.83,2])for(const delay of [0,.07,.14,.28]) {
    assert.equal(scope.sample(delay-.01,delay,life,1),0);
    assert.ok(scope.sample(.8,delay,life,1)>0);
    assert.equal(scope.sample(life,delay,life,1),0);
    assert.equal(scope.sample(life+.7,delay,life,1),0,"delayed tail points cannot reignite after the head is gone");
    assert.ok(scope.sample(life*.85,delay,life,1)>scope.sample(life*.85,delay,life,0),"outgoing petals twinkle individually");
  }
});
