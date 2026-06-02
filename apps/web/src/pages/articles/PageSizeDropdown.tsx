import { ARTICLE_PAGE_SIZE_OPTIONS } from '@intelligencehub/shared';
import { FacetDropdown } from '../../components/filters/FacetDropdown';

/** Single-select page-size picker. Default-pageSize chip stays muted; any
 * non-default size flips the dropdown to active so the user remembers
 * they're seeing more (or fewer) per page than the baseline. */
export function PageSizeDropdown({
  value,
  defaultValue,
  onChange,
}: {
  value: number;
  defaultValue: number;
  onChange: (next: number) => void;
}) {
  return (
    <FacetDropdown label="Per page" valueLabel={String(value)} isActive={value !== defaultValue}>
      {(close) =>
        ARTICLE_PAGE_SIZE_OPTIONS.map((n) => {
          const on = n === value;
          return (
            <button
              key={n}
              type="button"
              onClick={() => {
                onChange(n);
                close();
              }}
              className={
                'block w-full px-3 py-1.5 text-left font-mono text-[12.5px] transition-colors hover:bg-paper2 ' +
                (on ? 'text-ink' : 'text-muted')
              }
            >
              {n}
            </button>
          );
        })
      }
    </FacetDropdown>
  );
}
