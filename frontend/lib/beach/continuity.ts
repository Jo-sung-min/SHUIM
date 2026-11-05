import type { ContinuityView } from "./engine";
import type { MapId } from "./maps";
import type { FireState, RemotePlayer } from "./net";

export const VISIT_RESUME_MS = 30 * 60 * 1000;
export interface SavedBeachVisit {
  version: 1; userId: string; ticket: string; sequence: number; savedAt: number; camera: ContinuityView;
}
const key = (communityId: string, mapId: MapId) => `sorow:space-visit:v1:${mapId}:${encodeURIComponent(communityId)}`;

/** A tab-scoped ticket is only a resume hint; the server verifies the current account and membership. */
export function readBeachVisit(communityId: string, mapId: MapId, now = Date.now()): SavedBeachVisit | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(key(communityId, mapId)) ?? "null") as SavedBeachVisit | null;
    if (!value || value.version !== 1 || typeof value.userId !== "string" || !value.userId
      || typeof value.ticket !== "string" || !value.ticket || value.ticket.length > 256
      || !Number.isSafeInteger(value.sequence) || value.sequence < 0
      || !Number.isFinite(value.savedAt) || now < value.savedAt || now - value.savedAt > VISIT_RESUME_MS) return null;
    const camera = value.camera;
    if (!camera || !["first", "third"].includes(camera.view)
      || ![camera.yaw, camera.pitch, camera.orbitYaw].every(Number.isFinite)
      || (camera.restSpot !== null && (typeof camera.restSpot !== "string" || camera.restSpot.length > 80))) return null;
    return value;
  } catch { return null; }
}
export function saveBeachVisit(communityId: string, mapId: MapId, value: SavedBeachVisit): void {
  try { window.sessionStorage.setItem(key(communityId, mapId), JSON.stringify(value)); } catch { /* Resume in memory if storage is disabled. */ }
}
export function forgetBeachVisit(communityId: string, mapId: MapId): void {
  try { window.sessionStorage.removeItem(key(communityId, mapId)); } catch { /* Storage may be disabled. */ }
}

/** Include request duration in cadence instead of adding RTT to every movement sample. */
export function beachTickDelay(moving: boolean, observingMovement: boolean, failures: number, elapsed = 0): number {
  const cadence = moving ? 250 : observingMovement ? 350 : 1000;
  const backoff = failures > 0 ? Math.min(6000, 1000 * 2 ** Math.min(failures, 3)) : 0;
  return Math.max(40, Math.max(cadence, backoff) - Math.max(0, elapsed));
}
/** HUD lists need identities, not freshly allocated movement objects for every sample. */
export function sameBeachRoster(before: readonly RemotePlayer[], after: readonly RemotePlayer[]): boolean {
  if (before.length !== after.length) return false;
  const identities = new Map(before.map(person => [person.pid, person]));
  return after.every(person => {
    const previous = identities.get(person.pid);
    return previous?.id === person.id && previous.nick === person.nick && previous.skin === person.skin;
  });
}
export function sameFireDisplay(before: FireState | null, after: FireState): boolean {
  if (!before || Math.abs(after.serverTime - before.serverTime) >= 10_000) return false;
  return before.logs === after.logs && before.maxLogs === after.maxLogs && before.intensity === after.intensity
    && before.color === after.color && before.colorExpiresAt === after.colorExpiresAt
    && before.nextLogBurnAt === after.nextLogBurnAt && before.queueEndsAt === after.queueEndsAt
    && before.queuedPops === after.queuedPops && before.powderEnabled === after.powderEnabled
    && before.powder?.id === after.powder?.id && before.powder?.color === after.powder?.color
    && before.powder?.startedAt === after.powder?.startedAt && before.powder?.expiresAt === after.powder?.expiresAt;
}

/** Mobile browsers emit visibilitychange, pagehide and pageshow in different orders. */
export function attachBeachLifecycle(callbacks: {
  suspend: () => void; resume: () => void; offline: () => void; pageHidden: () => void;
}) {
  let suspended = document.hidden;
  const hide = () => { if (!suspended) { suspended = true; callbacks.suspend(); } };
  const resume = () => { if (!document.hidden && navigator.onLine !== false) { suspended = false; callbacks.resume(); } };
  const visibility = () => { if (document.hidden) hide(); else resume(); };
  const pagehide = () => { callbacks.pageHidden(); hide(); };
  const offline = () => callbacks.offline();
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", pagehide);
  window.addEventListener("pageshow", resume);
  window.addEventListener("online", resume);
  window.addEventListener("offline", offline);
  return () => {
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("pagehide", pagehide);
    window.removeEventListener("pageshow", resume);
    window.removeEventListener("online", resume);
    window.removeEventListener("offline", offline);
  };
}
