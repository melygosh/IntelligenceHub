export type ExistingSibling = {
  id: string;
  status: string;
  feedId: string | null;
};

export type DedupDecision =
  | { kind: 'process' }
  | { kind: 'mark-duplicate' }
  | { kind: 'insert-duplicate-row'; originalId: string };

/**
 * FR-5: resolve a same-user article colliding by normalised URL or content hash
 * with already-stored siblings. The caller passes EVERY sibling for this user
 * matching (url | contentHash), across ALL statuses and feeds.
 *
 *  - A sibling in the SAME feed (any status — ready/pending/failed/duplicate/
 *    filtered) means this is a re-pull of an item the feed already ingested →
 *    `mark-duplicate`, never insert. This is what stops a feed's own
 *    `duplicate`/`filtered` rows from multiplying on every poll (they'd
 *    otherwise be invisible to the lookup and re-inserted each sweep, inflating
 *    similarCount).
 *  - Otherwise a `ready` sibling in a DIFFERENT feed → materialise ONE
 *    `status='duplicate'` row anchored to that original (cross-source "similar"
 *    anchor).
 *  - Otherwise (cross-feed pending/failed/duplicate/filtered only) →
 *    `mark-duplicate`; the analyze queue owns retry and we don't want a second
 *    anchor row.
 *  - No sibling → `process` (pre-filter + analyze).
 */
export function decideDedupAction(
  siblings: readonly ExistingSibling[],
  currentFeedId: string,
): DedupDecision {
  if (siblings.length === 0) return { kind: 'process' };
  // Already ingested in THIS feed (any status) — a re-pull, never a new row.
  if (siblings.some((s) => s.feedId === currentFeedId)) {
    return { kind: 'mark-duplicate' };
  }
  // Cross-feed `ready` original → one cross-source duplicate anchor.
  const readyOriginal = siblings.find((s) => s.status === 'ready');
  if (readyOriginal) {
    return { kind: 'insert-duplicate-row', originalId: readyOriginal.id };
  }
  // Cross-feed pending/failed/duplicate/filtered only → no new row.
  return { kind: 'mark-duplicate' };
}
