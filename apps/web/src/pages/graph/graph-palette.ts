/**
 * Six muted category colours + one "uncategorised" slate, chosen to read on
 * the cream/serif paper background. The order is stable so categories get
 * the same colour across reloads (assignment is by index — see assign()).
 *
 * Single source for the canvas fill, the canvas legend, and the band colour
 * dots. Do not inline hex values anywhere else.
 */
export const GRAPH_PALETTE: readonly string[] = [
  '#7a9c5d', // moss
  '#a37d5b', // clay
  '#5d7a9c', // slate-blue
  '#9c7d5d', // ochre
  '#7d5d9c', // mauve
  '#5d9c8e', // teal
];

export const UNCATEGORISED_COLOUR = '#888280'; // slate

/**
 * Stable colour for a category id. Hash the uuid string into the palette
 * index — same uuid → same colour across sessions, no DB lookups needed.
 * `null` (no dominant category) → uncategorised slate.
 */
export function colourFor(categoryId: string | null): string {
  if (!categoryId) return UNCATEGORISED_COLOUR;
  let h = 0;
  for (let i = 0; i < categoryId.length; i += 1) {
    h = (h * 31 + categoryId.charCodeAt(i)) >>> 0;
  }
  return GRAPH_PALETTE[h % GRAPH_PALETTE.length];
}
