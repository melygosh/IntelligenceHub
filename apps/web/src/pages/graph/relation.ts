// Pure relation helpers for the graph Articles sidebar. UI-free so they can be
// unit-tested without React. Each article carries the ids of the entities it
// mentions, which lets us bucket it against the selected-entity set with no
// extra request.

/** Minimal shape we need from an article-list item. */
export interface ArticleRelation {
  id: string;
  entities: ReadonlyArray<{ id: string }>;
}

/** Anything with a stable `id`. */
export interface HasId {
  id: string;
}

/**
 * Three-way split of `articles` relative to the selected entities:
 *  - connecting: mentions EVERY selected entity (AND / intersection)
 *  - related:    mentions SOME (>=1) selected entity, but not all
 *  - others:     mentions NONE of the selected entities
 * `active` is false when no entity is selected — the caller then renders a flat
 * list (everything lands in `others`, no group headers). Order-preserving.
 */
export interface ArticleGroups<T> {
  connecting: T[];
  related: T[];
  others: T[];
  active: boolean;
}

export function partitionArticles<T extends ArticleRelation>(
  articles: ReadonlyArray<T>,
  selectedEntityIds: ReadonlySet<string>,
): ArticleGroups<T> {
  if (selectedEntityIds.size === 0) {
    return { connecting: [], related: [], others: [...articles], active: false };
  }
  const connecting: T[] = [];
  const related: T[] = [];
  const others: T[] = [];
  for (const a of articles) {
    const ents = new Set(a.entities.map((e) => e.id));
    let matched = 0;
    for (const sel of selectedEntityIds) if (ents.has(sel)) matched++;
    if (matched === 0) others.push(a);
    else if (matched === selectedEntityIds.size) connecting.push(a);
    else related.push(a);
  }
  return { connecting, related, others, active: true };
}

/** Selected items first (original order), then the rest. */
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
