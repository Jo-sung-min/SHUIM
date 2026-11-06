import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

const source = await readFile(new URL("../lib/beach/bamboo.ts", import.meta.url), "utf8");
const start = source.indexOf("export function buildBambooGroundTextures()");
const end = source.indexOf("\nfunction canvas2d", start);
const module = stripTypeScriptTypes(source.slice(start, end)).replace("export function", "function");
const trailSource = await readFile(new URL("../lib/beach/bamboo-trail.ts", import.meta.url), "utf8");
const trail = {};
vm.runInNewContext(stripTypeScriptTypes(trailSource).replace(/\bexport\s+(?=function\b|const\b|class\b)/g, "") + "\nglobalThis.insideGarden = insideSecretGarden;", trail);

function fixture(synchronousFailure = false) {
  const requests = [], released = new Map();
  let now = 100_000;
  class TextureLoader {
    load(url, ready, _progress, failed) {
      const texture = new THREE.Texture();
      texture.addEventListener("dispose", () => released.set(texture, (released.get(texture) ?? 0) + 1));
      requests.push({ url, texture, ready: () => ready(texture), failed });
      if (synchronousFailure) failed();
      return texture;
    }
  }
  const context = { THREE: { ...THREE, TextureLoader }, Date: { now: () => now },
    assetLoader: loader => loader, assetUrl: path => "https://cdn.sorow.co.kr" + path };
  vm.runInNewContext(module + "\nglobalThis.create = buildBambooGroundTextures;", context);
  return { maps: context.create(), requests, released, advance(ms) { now += ms; } };
}

test("four ground maps load once and remain separate sRGB repeats shared by every ground mesh", () => {
  const f = fixture(), uniforms = f.maps.uniforms;
  assert.equal(f.requests.length, 4);
  assert.ok(f.requests[0].url.endsWith("/beach/real/bamboo-grass-v1.webp"));
  assert.ok(f.requests[1].url.endsWith("/beach/real/bamboo-soil-v1.webp"));
  assert.equal(uniforms.uGrassReady.value, 0);
  assert.equal(uniforms.uSoilReady.value, 0);
  for (const request of f.requests) request.ready();
  assert.equal(uniforms.uGrassMap.value, f.requests[0].texture);
  assert.equal(uniforms.uSoilMap.value, f.requests[1].texture);
  assert.equal(uniforms.uGrassReady.value, 1);
  assert.equal(uniforms.uSoilReady.value, 1);
  assert.ok(f.requests[2].url.endsWith("/beach/real/bamboo-forest-floor-v1.webp"));
  assert.ok(f.requests[3].url.endsWith("/beach/real/bamboo-garden-ground-v1.webp"));
  assert.equal(uniforms.uForestMap.value, f.requests[2].texture);
  assert.equal(uniforms.uGardenMap.value, f.requests[3].texture);
  assert.equal(uniforms.uForestReady.value, 1); assert.equal(uniforms.uGardenReady.value, 1);
  assert.equal(uniforms.uGroundTileScale.value, 1 / 3.5);
  for (const { texture } of f.requests) {
    assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
    assert.equal(texture.wrapS, THREE.RepeatWrapping);
    assert.equal(texture.wrapT, THREE.RepeatWrapping);
    assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter);
    assert.equal(texture.anisotropy, 4);
  }
  f.advance(60_000);
  for (let i = 0; i < 120; i++) f.maps.update();
  assert.equal(f.requests.length, 4, "frames and distant terrain must not download the maps again");
  f.maps.dispose(); f.maps.dispose();
  for (const { texture } of f.requests) assert.equal(f.released.get(texture), 1);
});

test("one failed map retains the other, retries after a cooldown, and recovers in the same world", () => {
  const f = fixture(), uniforms = f.maps.uniforms;
  f.requests[0].ready(); f.requests[1].failed();
  assert.equal(uniforms.uGrassReady.value, 1);
  assert.equal(uniforms.uSoilReady.value, 0, "soil keeps the procedural fallback");
  assert.equal(uniforms.uSoilMap.value, null);
  assert.equal(f.released.get(f.requests[1].texture), 1);
  f.advance(14_999); f.maps.update();
  assert.equal(f.requests.length, 4);
  f.advance(1); f.maps.update(); f.maps.update();
  assert.equal(f.requests.length, 5, "only the failed soil stream retries, once");
  assert.equal(f.requests[4].url, f.requests[1].url);
  f.requests[4].ready();
  assert.equal(uniforms.uSoilMap.value, f.requests[4].texture);
  assert.equal(uniforms.uSoilReady.value, 1);
  f.requests[1].ready();
  assert.equal(uniforms.uSoilMap.value, f.requests[4].texture, "a stale callback cannot replace its successful retry");
  f.maps.dispose();
  for (const { texture } of f.requests) assert.equal(f.released.get(texture), 1);
});

test("leaving while maps are pending releases late responses and never restores disposed uniforms", () => {
  const f = fixture();
  f.maps.dispose();
  for (const request of f.requests) request.ready();
  assert.equal(f.maps.uniforms.uGrassMap.value, null);
  assert.equal(f.maps.uniforms.uSoilMap.value, null);
  assert.equal(f.maps.uniforms.uGrassReady.value, 0);
  assert.equal(f.maps.uniforms.uSoilReady.value, 0);
  f.advance(60_000); f.maps.update();
  assert.equal(f.requests.length, 4);
  for (const { texture } of f.requests) assert.equal(f.released.get(texture), 1);
});

test("a synchronous texture error releases the returned texture and leaves a visible fallback", () => {
  const f = fixture(true);
  assert.equal(f.maps.uniforms.uGrassReady.value, 0);
  assert.equal(f.maps.uniforms.uSoilReady.value, 0);
  for (const { texture } of f.requests) assert.equal(f.released.get(texture), 1);
  f.maps.dispose();
});


test("root coverage follows the bamboo positions without corrupting path RGB or spilling into the garden", () => {
  const begin=source.indexOf("export function writeBambooForestMask("),end=source.indexOf("\n/** r: earth path/yard",begin);
  const code=stripTypeScriptTypes(source.slice(begin,end)).replace("export function","function");
  const context={THREE,insideSecretGarden:trail.insideGarden};
  vm.runInNewContext(code+"\nglobalThis.paint=writeBambooForestMask;",context);
  const width=152,height=194,rect={minX:-76,minZ:-40,width:152,depth:194};
  const data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<data.length;i+=4){data[i]=37;data[i+1]=119;data[i+2]=211;data[i+3]=255;}
  context.paint(data,width,height,rect,[{x:.5,z:.5},{x:-21.5,z:90.5}]);
  const alpha=(x,z)=>data[((Math.floor(z-rect.minZ))*width+Math.floor(x-rect.minX))*4+3];
  assert.equal(alpha(.5,.5),255,"a stalk base gets the root texture");
  assert.ok(alpha(2.5,.5)>0&&alpha(2.5,.5)<255,"the clump edge blends softly");
  assert.equal(alpha(5.5,.5),0,"empty space remains grass");
  assert.equal(alpha(-21.5,90.5),255,"bamboo beside the garden keeps its roots");
  assert.equal(alpha(-22.5,90.5),0,"the hidden garden uses its own mixed floor");
  for(let i=0;i<data.length;i+=4)assert.deepEqual(Array.from(data.slice(i,i+3)),[37,119,211],"paths, stone, and lantern pools retain their independent RGB values");
});
