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
  ONSEN_BATHS, ONSEN_SEATS_PER_BATH, ONSEN_FLOATS_PER_BATH,
  ONSEN_SEATS, ONSEN_FLOATS, ONSEN_REST_REACH, ONSEN_SEAT_Y, ONSEN_FLOAT_Y, ONSEN_FLOAT_BOB,
  claimedOnsenSeat, claimedOnsenFloat, onsenLedgeHeight, onsenFloatingY, buildOnsenRest
};`, restContext);
const source = stripTypeScriptTypes(await readFile(new URL("../lib/beach/hot-spring.ts", import.meta.url), "utf8"))
  .replace(/^import\s+[^\n]+\n/gm, "")
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
const context = { THREE, ...restContext.api };
vm.runInNewContext(`${source}\nglobalThis.api = {
  HOT_SPRING, HOT_SPRING_PATH, HOT_SPRING_COLLIDERS, HOT_SPRING_BATHS, HOT_SPRING_STAIRS, HOT_SPRING_CROSSING, HOT_SPRING_STAIR_SLOT, HOT_SPRING_UPPER_SHELL, HOT_SPRING_BACK,
  hotSpringFloorHeight, hotSpringCeilingHeight, hotSpringBathIndex, hotSpringBathDistance, hotSpringInWater, hotSpringInlandBearing, hotSpringTerraceRim, buildHotSpring
};`, context);
const landscapeSource = stripTypeScriptTypes(await readFile(new URL("../lib/beach/hot-spring-landscape.ts", import.meta.url), "utf8"))
  .replace(/^import\s+[^\n]+\n/gm, "")
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
const landscapeContext = { THREE, ...context.api };
vm.runInNewContext(`${landscapeSource}\nglobalThis.api = { buildHotSpringLandscape };`, landscapeContext);
const festivalSource = stripTypeScriptTypes(await readFile(new URL("../lib/beach/firework-festival-variants.ts", import.meta.url), "utf8"))
  .replace(/^import\s+[^\n]+\n/gm, "")
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
const festivalContext = { THREE };
vm.runInNewContext(`${festivalSource}\nglobalThis.api = { festivalVariantGeometry };`, festivalContext);
const fireworksSource = stripTypeScriptTypes(await readFile(new URL("../lib/beach/fireworks.ts", import.meta.url), "utf8"))
  .replace(/^import\s+[^\n]+\n/gm, "")
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
const fireworksContext = { THREE, ...assets, ...festivalContext.api };
const finaleSource = stripTypeScriptTypes(await readFile(new URL("../lib/beach/firework-songi-finale.ts", import.meta.url), "utf8"))
  .replace(/\bexport\s+(?=const\b)/g, "");
vm.runInNewContext(`${finaleSource}\n${fireworksSource}\nglobalThis.api = { BeachFireworks };`, fireworksContext);
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
// The bamboo trail is pure math; the engine reads its seat tables on every map's rest handling.
const trailSource = stripTypeScriptTypes(await readFile(new URL("../lib/beach/bamboo-trail.ts", import.meta.url), "utf8"))
  .replace(/^import\s+[^\n]+\n/gm, "")
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
const trailContext = {};
vm.runInNewContext(`${trailSource}\nglobalThis.api = {
  BAMBOO_BOUNDS, TRAIL_WALK_HALF, BAMBOO_PAVILIONS, BAMBOO_PAVILION_SEATS, BAMBOO_PAVILION_OBSTACLES, BAMBOO_PAVILION_COLLIDERS,
  BAMBOO_LANTERNS, PAVILION_POST_HEIGHT, PAVILION_REACH, PAVILION_SEAT_CAPACITY, PAVILION_RISE, SUMMIT, MEADOW, SUMMIT_HEIGHT,
  bambooPavilionForSpot, pavilionSeat, claimedPavilionSeat, nearbyBambooPavilion, bambooFloorHeight, bambooCeilingHeight,
  groundHeight, mountainHeight, nearestOnTrail, onTrail, resolveTrail,
  PAVILION_HALF, PAVILION_STEP_HALF_WIDTH, PAVILION_STEP_LENGTH, PAVILION_EAVE, sampleCatmullRom, seededRandom
};`, trailContext);
// The spring-water garden shares the pavilion seat machinery; its layout is pure math on top of the trail helpers.
const gardenSource = stripTypeScriptTypes(await readFile(new URL("../lib/beach/garden-layout.ts", import.meta.url), "utf8"))
  .replace(/^import\s+[^\n]+\n/gm, "")
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
const gardenContext = { ...trailContext.api };
vm.runInNewContext(`${gardenSource}\nglobalThis.api = {
  GARDEN_BOUNDS, GARDEN_SPAWN, BOAT_DECK_Y, PIER_Y, GARDEN_OBSTACLES, GARDEN_PIERS, GARDEN_SEATS, GARDEN_WALLS, GARDEN_PAVILIONS, BOAT_STOPS, HALL,
  claimedGardenSeat, gardenCeilingHeight, gardenFloorHeight, gardenPavilionForSpot, gardenRainAt, nearbyGardenPavilion, pierEnd, resolveGardenWalk,
  isWater, onGardenGround, boatPoseAt, lakeSigned, insideHall
};`, gardenContext);
export const hotSpring = { ...context.api, ...landscapeContext.api, ...restContext.api, ...fireworksContext.api, ...hotelContext.api, ...motionContext.api, ...trailContext.api, ...gardenContext.api, ...assets };
