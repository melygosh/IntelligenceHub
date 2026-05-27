import { Link } from 'react-router-dom';
import { IMP_STYLE } from './importance';

/** Minimal article shape rendered by the shared list card. `feedTitle` and
 * `entities` are optional so callers with leaner data (e.g. an entity's
 * mention list) can reuse the exact same row as the digest's Key Articles. */
export type ArticleListItemData = {
  id: string;
  title: string;
  ts: string;
  importance?: 'high' | 'normal' | 'junk' | null;
  feedTitle?: string | null;
  entities?: { id: string; canonicalName: string }[];
};

const Sep = () => <span className="px-1 text-border2">·</span>;

export function ImportanceBadge({ importance }: { importance: 'high' | 'normal' | 'junk' | null }) {
  if (!importance) return null;
  const s = IMP_STYLE[importance];
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-px font-mono text-[11.5px] uppercase tracking-[0.1em]"
      style={{ background: s.bg, color: s.fg }}
    >
      <span className="inline-block h-1.5 w-1.5" style={{ background: s.dot }} />
      {importance}
    </span>
  );
}

function fmtShort(d: string): string {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ArticleListRow({ item, rank }: { item: ArticleListItemData; rank: number }) {
  const rankStr = String(rank).padStart(2, '0');
  const entities = item.entities ?? [];
  const feedTitle = item.feedTitle ?? null;
  return (
    <li>
      <Link
        to={`/articles/${item.id}`}
        className="group grid grid-cols-[36px_minmax(0,1fr)_16px] items-start gap-x-4 px-6 py-5 transition-colors hover:bg-paper2/40"
      >
        <span className="pt-1 font-mono text-[13px] text-mute2 tnum">{rankStr}</span>

        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12.5px] text-mute2">
            {feedTitle ? <span>{feedTitle}</span> : null}
            {feedTitle ? <Sep /> : null}
            <span className="tnum">{fmtShort(item.ts)}</span>
            {item.importance ? (
              <span className="ml-1">
                <ImportanceBadge importance={item.importance} />
              </span>
            ) : null}
          </div>
          <h3 className="pretty font-serif text-[22px] leading-snug text-ink group-hover:text-accent-deep">
            {item.title}
          </h3>
          {entities.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-1 gap-y-1 font-mono text-[12.5px] text-mute2">
              {entities.map((e, i) => (
                <span key={e.id} className="inline-flex items-center gap-1">
                  {i > 0 ? <span className="px-1 text-border2">·</span> : null}
                  <span>{e.canonicalName}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <span className="self-center text-border2 transition-colors group-hover:text-mute2">
          <svg viewBox="0 0 8 12" className="h-3 w-2">
            <path d="M1 1 L6 6 L1 11" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          </svg>
        </span>
      </Link>
    </li>
  );
}

/** Bordered, divided card listing articles — the digest "Key articles" look. */
export function ArticleListCard({ items }: { items: ArticleListItemData[] }) {
  return (
    <ol className="divide-y divide-border border border-border bg-paper">
      {items.map((a, i) => (
        <ArticleListRow key={a.id} item={a} rank={i + 1} />
      ))}
    </ol>
  );
}
