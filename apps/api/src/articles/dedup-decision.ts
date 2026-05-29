export type ExistingSibling = {
  id: string;
  // Source-of-truth narrowing happens in the SQL caller (status in ready/
  // pending/failed); the function only branches on 'ready', so accept the
  // raw column type instead of importing the zod enum.
  status: string;
  feedId: string | null;
};

export type DedupDecision =
  | { kind: 'process' }
  | { kind: 'mark-duplicate' }
  | { kind: 'insert-duplicate-row'; originalId: string };

// FR-5: how to resolve a same-user article colliding by normalised URL or
// content hash with an already-handled sibling. Only a 'ready' sibling from a
// *different* feed materialises a status='duplicate' row (the cross-source
// similar-articles anchor); same-feed re-pulls and pending/failed siblings
// just signal the outcome — the analyze queue owns retry, and a same-feed
// duplicate row on every poll would inflate similarCount.
export function decideDedupAction(
  existing: ExistingSibling | undefined,
  currentFeedId: string,
): DedupDecision {
  if (!existing) return { kind: 'process' };
  if (existing.status === 'ready' && existing.feedId !== currentFeedId) {
    return { kind: 'insert-duplicate-row', originalId: existing.id };
  }
  return { kind: 'mark-duplicate' };
}
