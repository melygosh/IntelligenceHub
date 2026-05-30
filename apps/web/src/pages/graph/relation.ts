// Pure relation helpers for the customize-canvas panel. Kept UI-free so they
// can be unit-tested without React. Each article carries the ids of the
// entities it mentions, which lets us derive the cross-dimension relationship
// in both directions from the already-loaded article list (no extra request).

/** Minimal shape we need from an article-list item. */
export interface ArticleRelation {
  id: string;
  entities: ReadonlyArray<{ id: string }>;
}

/** Anything with a stable `id` — entities or articles. */
export interface HasId {
  id: string;
}

/**
 * Ids of articles that mention at least one of the selected entities. Returns
 * `null` when no entity is selected — callers treat null as "no relationship
 * constraint", so the list renders flat (no Related/Others split).
 */
export function relatedArticleIdSet(
  articles: ReadonlyArray<ArticleRelation>,
  selectedEntityIds: ReadonlySet<string>,
): Set<string> | null {
  if (selectedEntityIds.size === 0) return null;
  const ids = new Set<string>();
  for (const a of articles) {
    if (a.entities.some((e) => selectedEntityIds.has(e.id))) ids.add(a.id);
  }
  return ids;
}

/**
 * Ids of entities mentioned by at least one of the selected articles. Returns
 * `null` when no article is selected (see {@link relatedArticleIdSet}).
 */
export function relatedEntityIdSet(
  articles: ReadonlyArray<ArticleRelation>,
  selectedArticleIds: ReadonlySet<string>,
): Set<string> | null {
  if (selectedArticleIds.size === 0) return null;
  const ids = new Set<string>();
  for (const a of articles) {
    if (!selectedArticleIds.has(a.id)) continue;
    for (const e of a.entities) ids.add(e.id);
  }
  return ids;
}

/**
 * A row counts as "related" when it's currently selected (pinned) or it's in
 * the cross-dimension related set. Selected rows stay in the Related group so
 * the user's picks never sink into Others.
 */
export function isRelated(
  id: string,
  pinned: ReadonlySet<string>,
  related: ReadonlySet<string> | null,
): boolean {
  if (pinned.has(id)) return true;
  return related !== null && related.has(id);
}

export interface RelationGroups<T> {
  related: T[];
  others: T[];
  // false when there's no cross-dimension selection — the UI then renders a
  // single flat list with no Related/Others headers.
  split: boolean;
}

/**
 * Partition `items` into Related (pinned ∪ related) and Others, preserving the
 * input order within each group. When `related` is null (nothing selected in
 * the other tab) there's no relationship to show: `split` is false and every
 * item lands in `others` in its original order.
 */
export function partitionByRelation<T extends HasId>(
  items: ReadonlyArray<T>,
  pinned: ReadonlySet<string>,
  related: ReadonlySet<string> | null,
): RelationGroups<T> {
  if (related === null) {
    return { related: [], others: [...items], split: false };
  }
  const relatedGroup: T[] = [];
  const others: T[] = [];
  for (const item of items) {
    if (isRelated(item.id, pinned, related)) relatedGroup.push(item);
    else others.push(item);
  }
  return { related: relatedGroup, others, split: true };
}
