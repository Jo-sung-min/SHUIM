// Seconds from the room event. Spectators can catch the ignition on the next poll.
export const SPARKLER_DRAW_START = .90;
export const SPARKLER_PASSES = 5;
export const SPARKLER_PASS_SECONDS = .48;
export const SPARKLER_DRAW_SECONDS = SPARKLER_PASSES * SPARKLER_PASS_SECONDS;
export const SPARKLER_DRAW_END = SPARKLER_DRAW_START + SPARKLER_DRAW_SECONDS;
export const SPARKLER_RELEASE_END = SPARKLER_DRAW_END + .20;
