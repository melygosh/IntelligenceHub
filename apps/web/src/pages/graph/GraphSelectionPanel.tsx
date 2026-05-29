import { useMemo, useState } from 'react';
import {
  useGetArticlesQuery,
  useGetEntityListQuery,
} from '../../store/api';
import { SearchInput } from '../../components/filters/SearchInput';

type Tab = 'entities' | 'articles';

export function GraphSelectionPanel({
  selectedEntityIds,
  selectedArticleIds,
  onChangeEntities,
  onChangeArticles,
  onReset,
  onClose,
  cap,
}: {
  selectedEntityIds: ReadonlySet<string>;
  selectedArticleIds: ReadonlySet<string>;
  onChangeEntities: (ids: Set<string>) => void;
  onChangeArticles: (ids: Set<string>) => void;
  onReset: () => void;
  onClose: () => void;
  // Max items per kind. Mirrors the server-side GRAPH_SELECTION_CAP so the
  // panel refuses to push the API past 400 with a long URL.
  cap: number;
}) {
  const [tab, setTab] = useState<Tab>('entities');
  const [entityQ, setEntityQ] = useState('');
  const [articleQ, setArticleQ] = useState('');

  // Panel opts into the "whole set in one shot" path (pageSize=500) instead
  // of the default 50/page — the user needs every candidate to multi-pick.
  const { data: entityList } = useGetEntityListQuery({
    sort: 'mentions',
    q: entityQ || undefined,
    pageSize: 500,
  });
  const { data: articleList } = useGetArticlesQuery({
    period: 'all',
    q: articleQ || undefined,
    pageSize: 500,
  });

  // Snapshot the "pinned to top" set when the list refreshes (panel open or
  // new search results) — NOT on every toggle. This keeps items in place
  // when the user unchecks one, so they don't jump away mid-click.
  // Uses React's "adjust state during render" pattern (compare prev vs new
  // in render, sync via setState) — avoids the useEffect cascading-render
  // warning and re-pins synchronously on data change.
  const [pinnedEntities, setPinnedEntities] = useState<ReadonlySet<string>>(
    () => new Set(selectedEntityIds),
  );
  const [prevEntityList, setPrevEntityList] = useState(entityList);
  if (prevEntityList !== entityList) {
    setPrevEntityList(entityList);
    setPinnedEntities(new Set(selectedEntityIds));
  }
  const [pinnedArticles, setPinnedArticles] = useState<ReadonlySet<string>>(
    () => new Set(selectedArticleIds),
  );
  const [prevArticleList, setPrevArticleList] = useState(articleList);
  if (prevArticleList !== articleList) {
    setPrevArticleList(articleList);
    setPinnedArticles(new Set(selectedArticleIds));
  }

  const entityItems = useMemo(() => {
    const items = entityList?.entities ?? [];
    return [...items].sort((a, b) => {
      const ac = pinnedEntities.has(a.id) ? 0 : 1;
      const bc = pinnedEntities.has(b.id) ? 0 : 1;
      return ac - bc;
    });
  }, [entityList, pinnedEntities]);
  const articleItems = useMemo(() => {
    const items = articleList?.articles ?? [];
    return [...items].sort((a, b) => {
      const ac = pinnedArticles.has(a.id) ? 0 : 1;
      const bc = pinnedArticles.has(b.id) ? 0 : 1;
      return ac - bc;
    });
  }, [articleList, pinnedArticles]);

  function toggleEntity(id: string): void {
    const next = new Set(selectedEntityIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      if (next.size >= cap) return; // hard-stop at cap; UI also disables
      next.add(id);
    }
    onChangeEntities(next);
  }
  function toggleArticle(id: string): void {
    const next = new Set(selectedArticleIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      if (next.size >= cap) return;
      next.add(id);
    }
    onChangeArticles(next);
  }
  // "Select all" walks the visible list but stops at the cap; the user can
  // then refine via search to swap items in/out. Guarantees we never ship
  // more than `cap` IDs to the API.
  function selectAllVisibleEntities(): void {
    const next = new Set(selectedEntityIds);
    for (const e of entityItems) {
      if (next.size >= cap) break;
      next.add(e.id);
    }
    onChangeEntities(next);
  }
  function selectAllVisibleArticles(): void {
    const next = new Set(selectedArticleIds);
    for (const a of articleItems) {
      if (next.size >= cap) break;
      next.add(a.id);
    }
    onChangeArticles(next);
  }

  const entitiesAtCap = selectedEntityIds.size >= cap;
  const articlesAtCap = selectedArticleIds.size >= cap;

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-border bg-paper">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          Customize canvas
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onReset}
            className="font-mono text-[11.5px] text-muted hover:text-ink"
            title="Restore the default top-N selection"
          >
            reset
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            title="Close"
            className="px-1 text-muted hover:text-ink"
          >
            ×
          </button>
        </div>
      </header>

      <div className="flex border-b border-border">
        <TabButton
          label="Entities"
          count={selectedEntityIds.size}
          active={tab === 'entities'}
          onClick={() => setTab('entities')}
        />
        <TabButton
          label="Articles"
          count={selectedArticleIds.size}
          active={tab === 'articles'}
          onClick={() => setTab('articles')}
        />
      </div>

      {tab === 'entities' ? (
        <ListBody
          q={entityQ}
          onQ={setEntityQ}
          placeholder="search entities…"
          onSelectAll={selectAllVisibleEntities}
          onClearAll={() => onChangeEntities(new Set())}
          selectedCount={selectedEntityIds.size}
          visibleCount={entityItems.length}
          cap={cap}
        >
          {entityItems.map((e) => {
            const isChecked = selectedEntityIds.has(e.id);
            return (
              <Row
                key={e.id}
                checked={isChecked}
                disabled={!isChecked && entitiesAtCap}
                onToggle={() => toggleEntity(e.id)}
                primary={e.canonicalName}
                secondary={`${e.mentionCount} mention${e.mentionCount === 1 ? '' : 's'} · ${e.type}`}
              />
            );
          })}
        </ListBody>
      ) : (
        <ListBody
          q={articleQ}
          onQ={setArticleQ}
          placeholder="search articles…"
          onSelectAll={selectAllVisibleArticles}
          onClearAll={() => onChangeArticles(new Set())}
          selectedCount={selectedArticleIds.size}
          visibleCount={articleItems.length}
          cap={cap}
        >
          {articleItems.map((a) => {
            const isChecked = selectedArticleIds.has(a.id);
            return (
              <Row
                key={a.id}
                checked={isChecked}
                disabled={!isChecked && articlesAtCap}
                onToggle={() => toggleArticle(a.id)}
                primary={a.title}
                secondary={new Date(a.ts).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              />
            );
          })}
        </ListBody>
      )}
    </aside>
  );
}

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex-1 px-3 py-2 font-mono text-[12.5px] ' +
        (active
          ? 'border-b-2 border-ink text-ink'
          : 'border-b-2 border-transparent text-muted hover:text-ink')
      }
      aria-pressed={active}
    >
      {label}{' '}
      <span className="text-mute2">({count})</span>
    </button>
  );
}

function ListBody({
  q,
  onQ,
  placeholder,
  onSelectAll,
  onClearAll,
  selectedCount,
  visibleCount,
  cap,
  children,
}: {
  q: string;
  onQ: (v: string) => void;
  placeholder: string;
  onSelectAll: () => void;
  onClearAll: () => void;
  selectedCount: number;
  visibleCount: number;
  cap: number;
  children: React.ReactNode;
}) {
  const atCap = selectedCount >= cap;
  return (
    <>
      <div className="border-b border-border p-3">
        <SearchInput
          value={q}
          onChange={onQ}
          placeholder={placeholder}
          widthClass="w-full"
        />
        <div className="mt-2 flex items-center justify-between font-mono text-[11.5px] text-muted">
          <span>
            {visibleCount} shown ·{' '}
            <span className={atCap ? 'text-accent-deep' : 'text-ink'}>
              {selectedCount}
            </span>{' '}
            / {cap} selected
          </span>
          <span className="flex gap-3">
            <button
              type="button"
              onClick={onSelectAll}
              className="hover:text-ink disabled:cursor-not-allowed disabled:text-mute2 disabled:hover:text-mute2"
              disabled={visibleCount === 0 || atCap}
              title={atCap ? `max ${cap} reached` : undefined}
            >
              select all
            </button>
            <button
              type="button"
              onClick={onClearAll}
              className="hover:text-ink disabled:cursor-not-allowed disabled:text-mute2 disabled:hover:text-mute2"
              disabled={selectedCount === 0}
            >
              clear all
            </button>
          </span>
        </div>
        {atCap ? (
          <p className="mt-1.5 font-mono text-[11px] text-accent-deep">
            Cap of {cap} reached — uncheck an item to add a different one.
          </p>
        ) : null}
      </div>
      <ul className="flex-1 overflow-y-auto">{children}</ul>
    </>
  );
}

function Row({
  checked,
  disabled = false,
  onToggle,
  primary,
  secondary,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  primary: string;
  secondary: string;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        title={disabled ? 'selection cap reached' : undefined}
        className={
          'flex w-full items-start gap-2 border-b border-border px-3 py-2 text-left ' +
          (disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-paper2')
        }
      >
        <span
          aria-hidden
          className={
            'mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center border ' +
            (checked
              ? 'border-ink bg-ink text-paper'
              : 'border-border bg-paper text-paper')
          }
        >
          {checked ? '✓' : ''}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[12.5px] text-ink">
            {primary}
          </span>
          <span className="block truncate font-mono text-[11px] text-mute2">
            {secondary}
          </span>
        </span>
      </button>
    </li>
  );
}
