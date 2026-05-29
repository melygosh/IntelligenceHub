import { z } from 'zod';

/** Public runtime config exposed via GET /api/config. Safe to leak to
 * anonymous traffic — only display-level limits, no secrets or per-user data. */
export const PublicConfig = z.object({
  // Max IDs the customize-canvas panel can include per kind (entities or
  // articles). Mirrors the server-side cap on /api/graph?entityIds=/articleIds=.
  graphSelectionCap: z.number().int().positive(),
});
export type PublicConfig = z.infer<typeof PublicConfig>;
