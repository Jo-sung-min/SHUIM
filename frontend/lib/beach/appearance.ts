/** Rows in the approved base-character atlas. Clothing can be layered onto either base later. */
export type BeachCharacter = "male" | "female";

export const BEACH_CHARACTERS = [
  { id: "male", label: "남자", skin: 0 },
  { id: "female", label: "여자", skin: 1 },
] as const;

export function characterFromSkin(skin: number): BeachCharacter {
  return Number.isFinite(skin) && ((Math.trunc(skin) % 2) + 2) % 2 === 1 ? "female" : "male";
}

export function characterSkin(character: BeachCharacter): number {
  return character === "female" ? 1 : 0;
}

/** A reconnect can belong to a different account after another tab changes the session. */
export function characterAfterEntry(
  me: { id: string; skin: number },
  previous: { id: string; character: BeachCharacter } | null,
  preference: BeachCharacter | null,
): BeachCharacter {
  if (previous?.id === me.id) return previous.character;
  return preference ?? characterFromSkin(me.skin);
}

function preferenceKey(userId: string): string {
  return `sorow:beach-character:v1:${encodeURIComponent(userId)}`;
}

/** Only look up a preference after the beach server has confirmed the account ID. */
export function savedCharacter(userId: string): BeachCharacter | null {
  if (!userId) return null;
  try {
    const value = window.localStorage.getItem(preferenceKey(userId));
    return value === "male" || value === "female" ? value : null;
  } catch { return null; }
}

export function saveCharacter(userId: string, character: BeachCharacter): void {
  if (!userId) return;
  try { window.localStorage.setItem(preferenceKey(userId), character); }
  catch { /* Keep the current visit usable when storage is unavailable. */ }
}
