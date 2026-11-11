import { BUNKER_TERRACE, bunkerById, bunkerFloorRise, hallAngle, hallRadius, hallReach } from "./uyuni-bunker-layout";

/** Books follow the curved back wall on the upper reading terrace. */
export function nearUyuniBooks(id: string | null | undefined, x: number, z: number): boolean {
  const room = bunkerById(id);
  if (!room) return false;
  const localX = x - room.x, localZ = z - room.z;
  const angle = hallAngle(localX, localZ), radius = hallRadius(localX, localZ);
  return Math.abs(angle) <= .68 && radius <= 1
    && (1 - radius) * hallReach(angle) <= 2.2
    && Math.abs(bunkerFloorRise(localX, localZ) - BUNKER_TERRACE.height) < .25;
}
