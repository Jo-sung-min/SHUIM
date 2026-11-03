/** Approved male/female sprite originals. Every view uses the same native cell and grounded origin. */
export const CHARACTER = {
  cell: { width: 72, height: 104 },
  views: ["front", "back", "left", "right"],
  anims: { idle: 4, walk: 6 },
  variants: [
    { id: "male", label: "남성", legStart: 78, armStart: 54, eyeY: 29, eyeLeft: [28, 33], eyeRight: [40, 46] },
    { id: "female", label: "여성", legStart: 74, armStart: 52, eyeY: 28, eyeLeft: [27, 33], eyeRight: [39, 45] },
  ],
};
export const CHAR_COLUMNS = CHARACTER.anims.idle + CHARACTER.anims.walk;
export const CHAR_VIEW_OFFSETS = Object.fromEntries(CHARACTER.views.map((view, i) => [view, i * CHAR_COLUMNS]));
export const SHEET = {
  width: CHARACTER.cell.width * CHAR_COLUMNS * CHARACTER.views.length,
  height: CHARACTER.cell.height * CHARACTER.variants.length,
};
