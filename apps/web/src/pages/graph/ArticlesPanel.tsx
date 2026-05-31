import { useMemo, useState } from 'react';
import { useGetArticlesQuery } from '../../store/api';
import { SearchInput } from '../../components/filters/SearchInput';
import { LoadingHint } from '../../components/ui/LoadingHint';
import { partitionArticles } from './relation';
import type { ArticleListItem, GraphPeriod } from '@intelligencehub/shared';

const MAX_CHIPS = 3;
const PAGE_SIZE = 500;

/**
 * Article-only graph sidebar (replaces the old Customize-canvas panel). Loads
 * one ~500 chunk of articles for the active filters, then groups them purely
 * client-side by each article's relationship to the selected entities:
 * Connecting (mentions all) -> Related (mentions some) -> Others (none).
 * Checking a row puts the article node on the canvas (`selectedArticleIds`).
 */
export function ArticlesPanel({
  selectedEntityIds,
  selectedArticleIds,
  onChangeArticles,
  onReset,
  onClose,
  cap,
  period,
  from,
  to,
  categoryIds,
}: {
  selectedEntityIds: ReadonlySet<string>;
  selectedArticleIds: ReadonlySet<string>;
  onChangeArticles: (ids: Set<string>) => void;
  onReset: () => void;
  onClose: () => void;
  cap: number;
  period: GraphPeriod;
  from?: string;
  to?: string;
  categoryIds: string[];
}) {
  const [q, setQ] = useState('');
  const { data, isLoading } = useGetArticlesQuery({
    period,
    from,
    to,
    categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
    q: q || undefined,
    pageSize: PAGE_SIZE,
  });
  const articles = useMemo(() => data?.articles ?? [], [data]);
  const groups = useMemo(
    () => partitionArticles(articles, selectedEntityIds),
    [articles, selectedEntityIds],
  );

  const atCap = selectedArticleIds.size >= cap;

  const toggle = (id: string) => {
    const next = new Set(selectedArticleIds);
    if (next.has(id)) next.delete(id);
    else {
      if (next.size >= cap) return;
      next.add(id);
    }
    onChangeArticles(next);
  };
  const toggleGroup = (groupItems: ArticleListItem[], select: boolean) => {
    const next = new Set(selectedArticleIds);
    for (const a of groupItems) {
      if (select) {
        if (next.size >= cap) break;
        next.add(a.id);
      } else {
        next.delete(a.id);
      }
    }
    onChangeArticles(next);
  };

  const isChecked = (id: string) => selectedArticleIds.has(id);
  const isDisabled = (id: string) => !selectedArticleIds.has(id) && atCap;

  return (
    // Full-viewport overlay on mobile (so the article picker isn't a cramped
    // rail fighting the graph); right-hand rail on md+.
    <aside
      className={
        'flex flex-col bg-paper ' +
        'fixed inset-0 z-40 w-full ' +
        'md:static md:z-auto md:w-[380px] md:shrink-0 md:border-l md:border-border'
      }
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          Articles
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onReset}
            className="font-mono text-[11.5px] text-muted hover:text-ink"
            title="Clear entity + article selection (back to top-N)"
          >
            reset
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to graph"
            title="Back to graph"
            className="font-mono text-[12px] text-muted hover:text-ink"
          >
            {/* Full label on mobile (panel is the whole screen); bare × on desktop. */}
            <span className="md:hidden">← Back to graph</span>
            <span className="hidden md:inline">×</span>
          </button>
        </div>
      </header>

      <div className="border-b border-border p-3">
        <SearchInput value={q} onChange={setQ} placeholder="search articles…" widthClass="w-full" />
        <div className="mt-2 flex items-center justify-between font-mono text-[11.5px] text-muted">
          <span>
            {articles.length} shown ·{' '}
            <span className={atCap ? 'text-accent-deep' : 'text-ink'}>
              {selectedArticleIds.size}
            </span>{' '}
            / {cap} selected
          </span>
          <button
            type="button"
            onClick={() => onChangeArticles(new Set())}
            disabled={selectedArticleIds.size === 0}
            className="hover:text-ink disabled:cursor-not-allowed disabled:text-mute2 disabled:hover:text-mute2"
          >
            clear all
          </button>
        </div>
        {atCap ? (
          <p className="mt-1.5 font-mono text-[11px] text-accent-deep">
            Cap of {cap} reached — uncheck an item to add a different one.
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <LoadingHint className="p-4" />
        ) : articles.length === 0 ? (
          <p className="px-3 py-4 font-mono text-[12px] italic text-muted">
            No articles in this window.
          </p>
        ) : !groups.active ? (
          <ul className="list-none">
            {groups.others.map((a) => (
              <ArticleRow
                key={a.id}
                a={a}
                checked={isChecked(a.id)}
                disabled={isDisabled(a.id)}
                onToggle={() => toggle(a.id)}
              />
            ))}
          </ul>
        ) : (
          <>
            <Group
              label="Connecting"
              tone="and"
              items={groups.connecting}
              isChecked={isChecked}
              isDisabled={isDisabled}
              onToggleItem={toggle}
              onToggleGroup={toggleGroup}
            />
            <Group
              label="Related"
              tone="or"
              items={groups.related}
              isChecked={isChecked}
              isDisabled={isDisabled}
              onToggleItem={toggle}
              onToggleGroup={toggleGroup}
            />
            <Group
              label="Others"
              tone="muted"
              items={groups.others}
              isChecked={isChecked}
              isDisabled={isDisabled}
              onToggleItem={toggle}
              onToggleGroup={toggleGroup}
            />
          </>
        )}
      </div>
    </aside>
  );
}

function Group({
  label,
  tone,
  items,
  isChecked,
  isDisabled,
  onToggleItem,
  onToggleGroup,
}: {
  label: string;
  tone: 'and' | 'or' | 'muted';
  items: ArticleListItem[];
  isChecked: (id: string) => boolean;
  isDisabled: (id: string) => boolean;
  onToggleItem: (id: string) => void;
  onToggleGroup: (items: ArticleListItem[], select: boolean) => void;
}) {
  if (items.length === 0) return null;
  const selected = items.filter((a) => isChecked(a.id)).length;
  const all = selected === items.length;
  const any = selected > 0;
  const headerCls =
    tone === 'and'
      ? 'bg-accent-light text-accent-deep'
      : tone === 'or'
        ? 'bg-paper2 text-muted'
        : 'bg-paper2 text-mute2';
  return (
    <div className="border-t border-border first:border-t-0">
      <div
        className={
          'sticky top-0 z-[1] flex items-center gap-2 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] ' +
          headerCls
        }
      >
        <input
          type="checkbox"
          checked={all}
          ref={(el) => {
            if (el) el.indeterminate = any && !all;
          }}
          onChange={() => onToggleGroup(items, !all)}
          className="h-3 w-3 accent-ink"
          aria-label={all ? `Deselect all ${label}` : `Select all ${label}`}
          title={all ? 'Deselect all in this group' : 'Select all in this group'}
        />
        <span>
          {label} · {items.length}
        </span>
      </div>
      <ul className="list-none">
        {items.map((a) => (
          <ArticleRow
            key={a.id}
            a={a}
            checked={isChecked(a.id)}
            disabled={isDisabled(a.id)}
            onToggle={() => onToggleItem(a.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function ArticleRow({
  a,
  checked,
  disabled,
  onToggle,
}: {
  a: ArticleListItem;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const chips = a.entities.slice(0, MAX_CHIPS);
  const more = a.entities.length - chips.length;
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        title={disabled ? 'selection cap reached' : a.title}
        className={
          'flex w-full items-start gap-2 border-b border-border px-3 py-2 text-left ' +
          (disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-paper2')
        }
      >
        <span
          aria-hidden
          className={
            'mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center border ' +
            (checked ? 'border-ink bg-ink text-paper' : 'border-border bg-paper text-paper')
          }
        >
          {checked ? '✓' : ''}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[12.5px] text-ink">{a.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1">
            <span className="font-mono text-[11px] text-mute2">
              {new Date(a.ts).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
            {chips.map((e) => (
              <span
                key={e.id}
                className="border border-border bg-surface px-1 py-[1px] font-mono text-[10.5px] text-ink"
              >
                {e.canonicalName}
              </span>
            ))}
            {more > 0 ? (
              <span className="font-mono text-[10.5px] text-mute2">+{more} more</span>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}
