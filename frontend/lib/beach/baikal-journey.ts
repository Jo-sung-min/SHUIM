import { BAIKAL_CABINS, baikalCabinArrivalAt } from "./baikal-layout";

export type BaikalJourneyStage = 0 | 1 | 2 | 3;
export interface BaikalJourneyPosition { x: number; z: number }
export interface BaikalJourneyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const BAIKAL_JOURNEY_STOPS = BAIKAL_CABINS;
const isStage = (value: unknown): value is BaikalJourneyStage => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;
const validPosition = (p: BaikalJourneyPosition | null): p is BaikalJourneyPosition => Boolean(p && Number.isFinite(p.x) && Number.isFinite(p.z));

/** Visiting a later shelter never fills in earlier stops; the landscape stays freely explorable. */
export function advanceBaikalJourney(stage: BaikalJourneyStage, position: BaikalJourneyPosition | null): BaikalJourneyStage {
  if (!isStage(stage) || stage === 3 || !validPosition(position)) return isStage(stage) ? stage : 0;
  return baikalCabinArrivalAt(position.x, position.z)?.id === BAIKAL_CABINS[stage].id ? (stage + 1) as BaikalJourneyStage : stage;
}

/** Distance is to the accessible lakeside entrance, not through the back wall. */
export function baikalJourneyDistance(stage: BaikalJourneyStage, position: BaikalJourneyPosition | null): number | null {
  if (!isStage(stage) || stage === 3 || !validPosition(position)) return null;
  const stop = BAIKAL_CABINS[stage];
  const distance = Math.hypot(position.x - (stop.porchMaxX - .5), position.z - (stop.doorMinZ + stop.doorMaxZ) / 2);
  return Math.ceil(distance / 5) * 5;
}

/** This is a local sightseeing keepsake, never a currency or server-authorized entitlement. */
export function baikalJourneyKey(userId: string, communityId: string): string {
  return `sorow:journey:v1:baikal:${encodeURIComponent(userId)}:${encodeURIComponent(communityId)}`;
}

export function readBaikalJourney(userId: string, communityId: string, storage: BaikalJourneyStorage | null): BaikalJourneyStage {
  if (!userId || !communityId || !storage) return 0;
  try {
    const raw = storage.getItem(baikalJourneyKey(userId, communityId));
    if (!raw || raw.length > 1024) return 0;
    const value = JSON.parse(raw) as Record<string, unknown> | null;
    if (!value || value.version !== 1 || value.mapId !== "baikal" || value.userId !== userId || value.communityId !== communityId || !isStage(value.stage)) return 0;
    return value.stage;
  } catch { return 0; }
}

/** A stale tab cannot overwrite a further stop already remembered by another tab. */
export function saveBaikalJourney(userId: string, communityId: string, stage: BaikalJourneyStage, storage: BaikalJourneyStorage | null): BaikalJourneyStage {
  if (!isStage(stage)) return 0;
  if (!userId || !communityId || !storage) return stage;
  const latest = Math.max(stage, readBaikalJourney(userId, communityId, storage)) as BaikalJourneyStage;
  try {
    storage.setItem(baikalJourneyKey(userId, communityId), JSON.stringify({ version: 1, mapId: "baikal", userId, communityId, stage: latest }));
  } catch { /* Restricted storage still allows the current walk to finish. */ }
  return latest;
}
