import { useMemo } from 'react';
import type { GraphResponse } from '@intelligencehub/shared';
import { IMP_STYLE } from '../../components/articles/importance';
import { colourFor } from './graph-palette';
import type { SelectedNode } from './GraphSidePanel';

const PREVIEW_COUNT = 5;
const IMPORTANCE_RANK: Record<'high' | 'normal' | 'junk', number> = {
  high: 0,
  normal: 1,
  junk: 2,
};

type EntityRow = {
  id: string;
  canonicalName: string;
  mentionCount: number;
  dominantCategoryId: string | null;
};
type ArticleRow = {
  id: string;
  title: string;
  importance: 'high' | 'normal' | 'junk' | null;
  ts: number | null;
};

/**
 * Two-cell band above the canvas, derived from the current graph response so
 * it always mirrors what's actually rendered. In default (top-N) mode this
 * matches the prior behaviour; in customize mode the band shows the top
 * entries from the user's picked set instead of a separate top-N.
 *
 * Each row is clickable → onSelect({id, kind}) which the page wires to "open
 * the rail + (if the node is on canvas) focus the graph". `selected` lets us
 * highlight the matching row.
 */
export function SummaryBand({
  data,
  selected,
  onSelect,
}: {
  data: GraphResponse | null;
  selected: SelectedNode | null;
  onSelect: (node: SelectedNode) => void;
}) {
  const { entities, articles, totalEntities, totalArticles } = useMemo(() => {
    if (!data) {
      return {
        entities: [] as EntityRow[],
        articles: [] as ArticleRow[],
        totalEntities: 0,
        totalArticles: 0,
      };
    }
    const ents: EntityRow[] = [];
    const arts: ArticleRow[] = [];
    for (const n of data.nodes) {
      if (n.kind === 'entity') {
        ents.push({
          id: n.id,
          canonicalName: n.label,
          mentionCount: n.mentionCount ?? 0,
          dominantCategoryId: n.dominantCategoryId,
        });
      } else {
        arts.push({
          id: n.id,
          title: n.label,
          importance: n.importance,
          ts: n.ts,
        });
      }
    }
    ents.sort((a, b) => b.mentionCount - a.mentionCount);
    // Articles: importance bucket (high → normal → junk → null), then newest first.
    arts.sort((a, b) => {
      const ai = a.importance ? IMPORTANCE_RANK[a.importance] : 3;
      const bi = b.importance ? IMPORTANCE_RANK[b.importance] : 3;
      if (ai !== bi) return ai - bi;
      return (b.ts ?? 0) - (a.ts ?? 0);
    });
    return {
      entities: ents.slice(0, PREVIEW_COUNT),
      articles: arts.slice(0, PREVIEW_COUNT),
      totalEntities: ents.length,
      totalArticles: arts.length,
    };
  }, [data]);

  return (
    <div className="grid grid-cols-2 gap-px bg-border">
      <Cell title={`Entities on canvas · ${totalEntities}`}>
        {entities.length === 0 ? (
          <Empty>No entities in this view.</Empty>
        ) : (
          <ul className="space-y-0.5 font-mono text-[12px] leading-snug">
            {entities.map((e) => {
              const isSelected =
                selected?.kind === 'entity' && selected.id === e.id;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onSelect({ id: e.id, kind: 'entity' })}
                    className={
                      'flex w-full items-center gap-2 text-left hover:bg-paper2 ' +
                      (isSelected ? 'bg-paper2 font-medium' : '')
                    }
                  >
                    <span
                      aria-hidden
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: colourFor(e.dominantCategoryId),
                      }}
                    />
                    <span className="flex-1 truncate text-ink">{e.canonicalName}</span>
                    <span className="text-muted">· {e.mentionCount}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Cell>
      <Cell title={`Articles on canvas · ${totalArticles}`}>
        {articles.length === 0 ? (
          <Empty>No articles in this view.</Empty>
        ) : (
          <ul className="space-y-0.5 font-mono text-[12px] leading-snug">
            {articles.map((a) => {
              const imp = (a.importance ?? 'normal') as 'high' | 'normal' | 'junk';
              const isSelected =
                selected?.kind === 'article' && selected.id === a.id;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onSelect({ id: a.id, kind: 'article' })}
                    className={
                      'flex w-full items-start gap-2 text-left hover:bg-paper2 ' +
                      (isSelected ? 'bg-paper2 font-medium' : '')
                    }
                    title={a.title}
                  >
                    <span
                      aria-hidden
                      style={{
                        display: 'inline-block',
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        marginTop: 6,
                        background: IMP_STYLE[imp].dot,
                      }}
                    />
                    <span className="line-clamp-2 flex-1 text-ink">{a.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Cell>
    </div>
  );
}

function Cell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-paper px-3 py-2">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[12px] italic text-muted">{children}</p>
  );
}
