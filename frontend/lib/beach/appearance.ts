/** Stable IDs also travel through the room server; old pixel choices migrate by gender. */
export type BeachCharacter = "male" | "female-3d";

export const BEACH_CHARACTERS = [
  { id: "male", label: "남자", skin: 0, preview: "/beach/male-avatar.webp" },
  { id: "female-3d", label: "여자", skin: 3, preview: "/beach/female-avatar.webp" },
] as const;

function currentCharacter(value: unknown): BeachCharacter | null {
  if (value === "male" || value === "pixel-male" || value === "cat-gentleman" || value === "mongsil") return "male";
  if (value === "female-3d" || value === "female" || value === "cat-lady") return "female-3d";
  return null;
}

export function characterFromSkin(skin: number): BeachCharacter {
  if (!Number.isFinite(skin)) return "male";
  const row = Math.trunc(skin);
  return ((row % 2) + 2) % 2 === 1 ? "female-3d" : "male";
}

export function characterSkin(character: BeachCharacter): number {
  const selected = currentCharacter(character);
  return selected === "female-3d" ? 3 : 0;
}

/** A reconnect can belong to a different account after another tab changes the session. */
export function characterAfterEntry(
  me: { id: string; skin: number },
  previous: { id: string; character: BeachCharacter } | null,
  preference: BeachCharacter | null,
): BeachCharacter {
  if (previous?.id === me.id) {
    const selected = currentCharacter(previous.character);
    if (selected) return selected;
  }
  return currentCharacter(preference) ?? characterFromSkin(me.skin);
}

function preferenceKey(userId: string): string {
  return `sorow:beach-character:v1:${encodeURIComponent(userId)}`;
}

/** Only look up a preference after the beach server has confirmed the account ID. */
export function savedCharacter(userId: string): BeachCharacter | null {
  if (!userId) return null;
  try {
    const value = window.localStorage.getItem(preferenceKey(userId));
    const selected = currentCharacter(value);
    if (selected && selected !== value) {
      // A read-only/private storage policy must not prevent the in-memory migration.
      try { window.localStorage.setItem(preferenceKey(userId), selected); } catch { /* Use it for this visit. */ }
    }
    return selected;
  } catch { return null; }
}

export function saveCharacter(userId: string, character: BeachCharacter): void {
  const selected = currentCharacter(character);
  if (!userId || !selected) return;
  try { window.localStorage.setItem(preferenceKey(userId), selected); }
  catch { /* Keep the current visit usable when storage is unavailable. */ }
}
