/**
 * Eight muted, perceptually-distinct category colours + one "uncategorised"
 * slate, chosen to read on the cream/serif paper background. Spanning eight
 * hue families (green, blue, terracotta, mauve, teal, gold, rose, brown) so
 * adjacent categories stay easy to tell apart.
 *
 * Single source for the canvas fill, the canvas legend, the minimap, and the
 * dashboard dots. Do not inline hex values anywhere else.
 */
export const GRAPH_PALETTE: readonly string[] = [
  '#7a9c5d', // moss green
  '#5d7a9c', // slate blue
  '#b87154', // terracotta
  '#9067b0', // mauve
  '#3f9c8b', // teal
  '#c2a042', // goldenrod
  '#c06a8e', // dusty rose
  '#8a6646', // warm brown
];

export const UNCATEGORISED_COLOUR = '#888280'; // slate

/**
 * Build a stable category→colour map by LIST ORDER (not a hash) so every
 * category gets a distinct palette slot — colours only repeat once there are
 * more categories than palette entries. Pass the canonical category list
 * (useGetCategoriesQuery order) so the legend, canvas, minimap, and dashboard
 * all agree on which category is which colour.
 *
 * (The old hash-the-uuid approach collided badly: with a handful of categories
 * several would map to the same colour.)
 */
export function buildCategoryColours(orderedCategoryIds: readonly string[]): Map<string, string> {
  const map = new Map<string, string>();
  orderedCategoryIds.forEach((id, i) => {
    map.set(id, GRAPH_PALETTE[i % GRAPH_PALETTE.length]);
  });
  return map;
}

/** Resolve a (possibly null) category id against a colour map. */
export function categoryColour(
  map: ReadonlyMap<string, string>,
  categoryId: string | null,
): string {
  if (!categoryId) return UNCATEGORISED_COLOUR;
  return map.get(categoryId) ?? UNCATEGORISED_COLOUR;
}
