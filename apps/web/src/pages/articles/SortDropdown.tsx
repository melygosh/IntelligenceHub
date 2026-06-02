import type { ArticleSort } from '@intelligencehub/shared';
import { FacetDropdown } from '../../components/filters/FacetDropdown';

const OPTIONS: { id: ArticleSort; label: string }[] = [
  { id: 'newest', label: 'newest first' },
  { id: 'feed', label: 'by feed (A→Z)' },
  { id: 'duplicates', label: 'most duplicated' },
];

const LABEL_BY_ID = new Map(OPTIONS.map((o) => [o.id, o.label] as const));

/** Single-select sort order for the articles list. Default 'newest' renders
 * with no chip emphasis; any other value flips the dropdown to active. */
export function SortDropdown({
  value,
  onChange,
}: {
  value: ArticleSort;
  onChange: (next: ArticleSort) => void;
}) {
  const valueLabel = LABEL_BY_ID.get(value) ?? null;
  return (
    <FacetDropdown label="Sort" valueLabel={valueLabel} isActive={value !== 'newest'}>
      {(close) =>
        OPTIONS.map((o) => {
          const on = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onChange(o.id);
                close();
              }}
              className={
                'block w-full px-3 py-1.5 text-left font-mono text-[12.5px] transition-colors hover:bg-paper2 ' +
                (on ? 'text-ink' : 'text-muted')
              }
            >
              {o.label}
            </button>
          );
        })
      }
    </FacetDropdown>
  );
}
