import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import * as THREE from "three";
import { assets } from "./assets-fixture.mjs";

// Use the production terrain and collider contract in every engine/Cove fixture.
// This keeps avatar-only tests from silently exercising an obsolete flat world.
const restSource = stripTypeScriptTypes(await readFile(new URL("../lib/beach/onsen-rest.ts", import.meta.url), "utf8"))
  .replace(/^import\s+[^\n]+\n/gm, "")
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
const restContext = { THREE };
vm.runInNewContext(`${restSource}\nglobalThis.api = {
  ONSEN_SEATS, ONSEN_FLOATS, ONSEN_REST_REACH, ONSEN_SEAT_Y, ONSEN_FLOAT_Y, ONSEN_FLOAT_BOB,
  claimedOnsenSeat, claimedOnsenFloat, onsenLedgeHeight, onsenFloatingY, buildOnsenRest
};`, restContext);
const source = stripTypeScriptTypes(await readFile(new URL("../lib/beach/hot-spring.ts", import.meta.url), "utf8"))
  .replace(/^import\s+[^\n]+\n/gm, "")
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
const context = { THREE, ...restContext.api };
vm.runInNewContext(`${source}\nglobalThis.api = {
  HOT_SPRING, HOT_SPRING_PATH, HOT_SPRING_COLLIDERS,
  hotSpringFloorHeight, hotSpringCeilingHeight, buildHotSpring
};`, context);
const landscapeSource = stripTypeScriptTypes(await readFile(new URL("../lib/beach/hot-spring-landscape.ts", import.meta.url), "utf8"))
  .replace(/^import\s+[^\n]+\n/gm, "")
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
const landscapeContext = { THREE, ...context.api };
vm.runInNewContext(`${landscapeSource}\nglobalThis.api = { buildHotSpringLandscape };`, landscapeContext);
const fireworksSource = stripTypeScriptTypes(await readFile(new URL("../lib/beach/fireworks.ts", import.meta.url), "utf8"))
  .replace(/^import\s+[^\n]+\n/gm, "")
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
const fireworksContext = { THREE, ...assets };
vm.runInNewContext(`${fireworksSource}\nglobalThis.api = { BeachFireworks };`, fireworksContext);
const hotelSource = stripTypeScriptTypes(await readFile(new URL("../lib/beach/uyuni-hotel-layout.ts", import.meta.url), "utf8"))
  .replace(/^import\s+[^\n]+\n/gm, "")
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
const hotelContext = {};
vm.runInNewContext(`${hotelSource}\nglobalThis.api = {
  UYUNI_HOTELS, UYUNI_HOTEL_BED_CAPACITY, UYUNI_HOTEL_DECK, UYUNI_HOTEL_SEATS, UYUNI_HOTEL_COLLIDERS,
  uyuniHotelForSpot, uyuniHotelBedSlot, claimedUyuniHotelBed, nearbyUyuniHotel,
  uyuniHotelFloorHeight, uyuniHotelCeilingHeight
};`, hotelContext);
const motionSource = stripTypeScriptTypes(await readFile(new URL("../lib/beach/remote-motion.ts", import.meta.url), "utf8"))
  .replace(/\bexport\s+(?=class\b)/g, "");
const motionContext = {};
vm.runInNewContext(`${motionSource}\nglobalThis.api = { RemoteMotionBuffer, RemoteSnapshotClock };`, motionContext);
export const hotSpring = { ...context.api, ...landscapeContext.api, ...restContext.api, ...fireworksContext.api, ...hotelContext.api, ...motionContext.api, ...assets };
