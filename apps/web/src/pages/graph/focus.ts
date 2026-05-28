/**
 * Given a clicked root node and the edges list, return the set of node ids
 * to keep at full opacity — the root plus its 1-hop neighbours via any edge.
 * `null` rootId means "no focus active" → return null so callers can skip
 * dimming entirely (cheaper than a full-membership set).
 *
 * Pure: no side effects, no react-flow imports — easy to reason about, easy
 * to unit-test if/when a frontend test runner is added.
 */
export function computeFocusSet(
  rootId: string | null,
  edges: ReadonlyArray<{ from: string; to: string }>,
): ReadonlySet<string> | null {
  if (rootId === null) return null;
  const out = new Set<string>([rootId]);
  for (const e of edges) {
    if (e.from === rootId) out.add(e.to);
    else if (e.to === rootId) out.add(e.from);
  }
  return out;
}
