import { useEffect, useRef, useState } from 'react';
import type { EntityKind } from '@intelligencehub/shared';
import { EntityGlyph } from './EntityGlyph';
import { useUpdateEntityTypeMutation } from '../../store/api';

// The five real kinds a user can assign. 'unknown' is never a deliberate target
// — it only shows as the CURRENT value when the model couldn't place an entity,
// so it's offered (first) only while that's the case, to be corrected away from.
const ASSIGNABLE: EntityKind[] = ['company', 'person', 'product', 'technology', 'location'];

/**
 * Inline editable entity-type control for the entity-detail header. Shows the
 * current kind (glyph + label) as a button; opening it lets the user reclassify
 * — the primary way to fix entities the model returned as 'unknown'. Persists
 * via the user-scoped PATCH /entities/:id; the mutation invalidates the entity
 * detail, the lists, and the graph.
 */
export function EntityTypeSelect({ entityId, current }: { entityId: string; current: EntityKind }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [updateType, { isLoading }] = useUpdateEntityTypeMutation();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const options: EntityKind[] = current === 'unknown' ? ['unknown', ...ASSIGNABLE] : ASSIGNABLE;

  const choose = (t: EntityKind) => {
    setOpen(false);
    if (t !== current) void updateType({ id: entityId, type: t });
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={isLoading}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Change entity type"
        className={
          'inline-flex items-center gap-1.5 border bg-paper2 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] hover:bg-paper disabled:opacity-50 ' +
          (current === 'unknown'
            ? 'border-dashed border-border text-muted'
            : 'border-border text-ink')
        }
      >
        <span className="inline-flex items-center text-muted">
          <EntityGlyph type={current} />
        </span>
        <span>{current}</span>
        <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 text-mute2" aria-hidden="true">
          <path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute right-0 z-20 mt-1 min-w-[160px] border border-border bg-paper py-1 shadow-lg"
        >
          {options.map((t) => {
            const on = t === current;
            return (
              <li key={t}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => choose(t)}
                  className={
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[12px] uppercase tracking-[0.1em] hover:bg-paper2 ' +
                    (on ? 'text-ink' : 'text-muted')
                  }
                >
                  <span className="inline-flex items-center text-muted">
                    <EntityGlyph type={t} />
                  </span>
                  <span className="flex-1">{t}</span>
                  {on ? <span className="text-accent">✓</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
