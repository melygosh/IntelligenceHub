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
 * Ids of articles that mention EVERY selected entity (AND / intersection — the
 * "Connecting" set). `null` when nothing is selected, so the caller hides the
 * Connecting/Related sections entirely.
 */
export function connectingArticleIdSet(
  articles: ReadonlyArray<ArticleRelation>,
  selectedEntityIds: ReadonlySet<string>,
): Set<string> | null {
  if (selectedEntityIds.size === 0) return null;
  const ids = new Set<string>();
  for (const a of articles) {
    const ents = new Set(a.entities.map((e) => e.id));
    let all = true;
    for (const sel of selectedEntityIds) {
      if (!ents.has(sel)) {
        all = false;
        break;
      }
    }
    if (all) ids.add(a.id);
  }
  return ids;
}

/**
 * Entity ids mentioned by EVERY selected article (AND / intersection). `null`
 * when nothing is selected. The symmetric counterpart for "by article" mode.
 */
export function connectingEntityIdSet(
  articles: ReadonlyArray<ArticleRelation>,
  selectedArticleIds: ReadonlySet<string>,
): Set<string> | null {
  if (selectedArticleIds.size === 0) return null;
  let acc: Set<string> | null = null;
  for (const a of articles) {
    if (!selectedArticleIds.has(a.id)) continue;
    const ents = new Set(a.entities.map((e) => e.id));
    if (acc === null) {
      acc = ents;
    } else {
      // Deleting from a Set during its own for…of is spec-safe.
      for (const id of acc) if (!ents.has(id)) acc.delete(id);
    }
  }
  return acc ?? new Set<string>();
}

export interface ConnectingGroups<T> {
  /** Items related to ALL selected (the intersection). */
  connecting: T[];
  /** Items related to ANY selected but not all (disjoint from connecting). */
  related: T[];
  /** false when there's no active selection — caller hides both sections. */
  active: boolean;
}

/**
 * Split `items` into Connecting (in the AND set) and Related (in the ANY set
 * but not the AND set). Order-preserving. Inactive when either set is null.
 */
export function splitConnectingRelated<T extends HasId>(
  items: ReadonlyArray<T>,
  connecting: ReadonlySet<string> | null,
  anyRelated: ReadonlySet<string> | null,
): ConnectingGroups<T> {
  if (connecting === null || anyRelated === null) {
    return { connecting: [], related: [], active: false };
  }
  const c: T[] = [];
  const r: T[] = [];
  for (const item of items) {
    if (connecting.has(item.id)) c.push(item);
    else if (anyRelated.has(item.id)) r.push(item);
  }
  return { connecting: c, related: r, active: true };
}

/** Selected items first (original order), then the rest — keeps a user's
 * picks visible at the top of the checklist while they search/scroll. */
export function pinSelectedFirst<T extends HasId>(
  items: ReadonlyArray<T>,
  selected: ReadonlySet<string>,
): T[] {
  if (selected.size === 0) return [...items];
  const sel: T[] = [];
  const rest: T[] = [];
  for (const item of items) (selected.has(item.id) ? sel : rest).push(item);
  return [...sel, ...rest];
}
