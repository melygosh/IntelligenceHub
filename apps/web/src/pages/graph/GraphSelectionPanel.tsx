import { useEffect, useMemo, useState } from 'react';
import {
  useGetArticlesQuery,
  useGetEntityListQuery,
} from '../../store/api';
import { SearchInput } from '../../components/filters/SearchInput';
import {
  connectingArticleIdSet,
  connectingEntityIdSet,
  relatedArticleIdSet,
  relatedEntityIdSet,
  splitConnectingRelated,
  pinSelectedFirst,
  type ConnectingGroups,
} from './relation';

export type GraphDimension = 'entity' | 'article';

export function GraphSelectionPanel({
  dimension,
  onChangeDimension,
  selectedEntityIds,
  selectedArticleIds,
  onChangeEntities,
  onChangeArticles,
  onReset,
  onClose,
  cap,
}: {
  dimension: GraphDimension;
  onChangeDimension: (d: GraphDimension) => void;
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

  // Pinned checklist of the active dimension (selected first).
  const entityRows = useMemo(
    () => pinSelectedFirst(entityList?.entities ?? [], selectedEntityIds),
    [entityList, selectedEntityIds],
  );
  const articleRows = useMemo(
    () => pinSelectedFirst(articleList?.articles ?? [], selectedArticleIds),
    [articleList, selectedArticleIds],
  );

  // Connecting/Related of the OTHER dimension, relative to the active selection.
  const articleSections = useMemo(
    () =>
      splitConnectingRelated(
        articleList?.articles ?? [],
        connectingArticleIdSet(articleList?.articles ?? [], selectedEntityIds),
        relatedArticleIdSet(articleList?.articles ?? [], selectedEntityIds),
      ),
    [articleList, selectedEntityIds],
  );
  const entitySections = useMemo(
    () =>
      splitConnectingRelated(
        entityList?.entities ?? [],
        connectingEntityIdSet(articleList?.articles ?? [], selectedArticleIds),
        relatedEntityIdSet(articleList?.articles ?? [], selectedArticleIds),
      ),
    [entityList, articleList, selectedArticleIds],
  );

  // Connecting items auto-join the canvas selection; Related stay opt-in. The
  // panel owns this so the canvas and sidebar can never disagree.
  useEffect(() => {
    if (dimension === 'entity') {
      if (!articleSections.active) return;
      const ids = new Set(selectedArticleIds);
      let changed = false;
      for (const a of articleSections.connecting)
        if (!ids.has(a.id)) {
          ids.add(a.id);
          changed = true;
        }
      if (changed) onChangeArticles(ids);
    } else {
      if (!entitySections.active) return;
      const ids = new Set(selectedEntityIds);
      let changed = false;
      for (const e of entitySections.connecting)
        if (!ids.has(e.id)) {
          ids.add(e.id);
          changed = true;
        }
      if (changed) onChangeEntities(ids);
    }
    // `*Sections` are memoized on (list, primary selection) — NOT on the
    // secondary selection — so unioning into the secondary set can't change a
    // dep, and the `changed` guard makes re-runs idempotent: stabilises after
    // one pass (no loop). Omitted deps are intentional:
    //   selectedArticleIds / selectedEntityIds — read only to seed a new Set;
    //     the `changed`/`ids.has` guard keeps re-runs idempotent.
    //   onChangeArticles / onChangeEntities — React guarantees state-setter
    //     identity is stable across renders (GraphPage passes the setters).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimension, articleSections, entitySections]);

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
    for (const e of entityList?.entities ?? []) {
      if (next.size >= cap) break;
      next.add(e.id);
    }
    onChangeEntities(next);
  }
  function selectAllVisibleArticles(): void {
    const next = new Set(selectedArticleIds);
    for (const a of articleList?.articles ?? []) {
      if (next.size >= cap) break;
      next.add(a.id);
    }
    onChangeArticles(next);
  }

  const entitiesAtCap = selectedEntityIds.size >= cap;
  const articlesAtCap = selectedArticleIds.size >= cap;
  const entityVisible = entityList?.entities.length ?? 0;
  const articleVisible = articleList?.articles.length ?? 0;

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
        <DimButton
          label="Entity"
          active={dimension === 'entity'}
          onClick={() => onChangeDimension('entity')}
        />
        <DimButton
          label="Article"
          active={dimension === 'article'}
          onClick={() => onChangeDimension('article')}
        />
      </div>

      {dimension === 'entity' ? (
        <>
          <ListBody
            q={entityQ}
            onQ={setEntityQ}
            placeholder="search entities…"
            onSelectAll={selectAllVisibleEntities}
            onClearAll={() => onChangeEntities(new Set())}
            selectedCount={selectedEntityIds.size}
            visibleCount={entityVisible}
            cap={cap}
          >
            {entityRows.map((e) => (
              <Row
                key={e.id}
                checked={selectedEntityIds.has(e.id)}
                disabled={!selectedEntityIds.has(e.id) && entitiesAtCap}
                onToggle={() => toggleEntity(e.id)}
                primary={e.canonicalName}
                secondary={`${e.mentionCount} mention${e.mentionCount === 1 ? '' : 's'} · ${e.type}`}
              />
            ))}
          </ListBody>
          <ConnectingRelated
            groups={articleSections}
            connectingLabel={`mention all ${selectedEntityIds.size}`}
            isChecked={(a) => selectedArticleIds.has(a.id)}
            onToggle={(a) => toggleArticle(a.id)}
            primary={(a) => a.title}
            secondary={(a) =>
              new Date(a.ts).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            }
            disabled={(a) => !selectedArticleIds.has(a.id) && articlesAtCap}
          />
        </>
      ) : (
        <>
          <ListBody
            q={articleQ}
            onQ={setArticleQ}
            placeholder="search articles…"
            onSelectAll={selectAllVisibleArticles}
            onClearAll={() => onChangeArticles(new Set())}
            selectedCount={selectedArticleIds.size}
            visibleCount={articleVisible}
            cap={cap}
          >
            {articleRows.map((a) => (
              <Row
                key={a.id}
                checked={selectedArticleIds.has(a.id)}
                disabled={!selectedArticleIds.has(a.id) && articlesAtCap}
                onToggle={() => toggleArticle(a.id)}
                primary={a.title}
                secondary={new Date(a.ts).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              />
            ))}
          </ListBody>
          <ConnectingRelated
            groups={entitySections}
            connectingLabel={`mention all ${selectedArticleIds.size}`}
            isChecked={(e) => selectedEntityIds.has(e.id)}
            onToggle={(e) => toggleEntity(e.id)}
            primary={(e) => e.canonicalName}
            secondary={(e) =>
              `${e.mentionCount} mention${e.mentionCount === 1 ? '' : 's'} · ${e.type}`
            }
            disabled={(e) => !selectedEntityIds.has(e.id) && entitiesAtCap}
          />
        </>
      )}
    </aside>
  );
}

function DimButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'flex-1 px-3 py-2 font-mono text-[12.5px] ' +
        (active
          ? 'border-b-2 border-ink text-ink'
          : 'border-b-2 border-transparent text-muted hover:text-ink')
      }
    >
      {label}
    </button>
  );
}

function ConnectingRelated<T extends { id: string }>({
  groups,
  connectingLabel,
  isChecked,
  onToggle,
  primary,
  secondary,
  disabled,
}: {
  groups: ConnectingGroups<T>;
  connectingLabel: string;
  isChecked: (item: T) => boolean;
  onToggle: (item: T) => void;
  primary: (item: T) => string;
  secondary: (item: T) => string;
  disabled: (item: T) => boolean;
}) {
  if (!groups.active) return null;
  const render = (item: T) => (
    <Row
      key={item.id}
      checked={isChecked(item)}
      disabled={disabled(item)}
      onToggle={() => onToggle(item)}
      primary={primary(item)}
      secondary={secondary(item)}
    />
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-border">
      <SectionHeader
        tone="and"
        label={`Connecting · ${connectingLabel} · ${groups.connecting.length}`}
      />
      {groups.connecting.length > 0 ? (
        <ul className="list-none">{groups.connecting.map(render)}</ul>
      ) : (
        <p className="px-3 py-2 font-mono text-[11.5px] italic text-mute2">
          none — no single item ties all of them
        </p>
      )}
      <SectionHeader
        tone="or"
        label={`Related · mention any · ${groups.related.length}`}
      />
      {groups.related.length > 0 ? (
        <ul className="list-none">{groups.related.map(render)}</ul>
      ) : (
        <p className="px-3 py-2 font-mono text-[11.5px] text-mute2">none</p>
      )}
    </div>
  );
}

function SectionHeader({ tone, label }: { tone: 'and' | 'or'; label: string }) {
  const cls =
    tone === 'and'
      ? 'bg-accent-light text-accent-deep'
      : 'bg-paper2 text-muted';
  return (
    <div
      className={
        'sticky top-0 z-[1] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] ' +
        cls
      }
    >
      {label}
    </div>
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
      <ul className="min-h-0 flex-1 overflow-y-auto">{children}</ul>
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
