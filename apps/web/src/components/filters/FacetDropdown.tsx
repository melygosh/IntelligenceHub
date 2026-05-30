import { useEffect, useRef, useState } from 'react';

export function ChevronDown() {
  return (
    <svg viewBox="0 0 10 10" className="h-2 w-2">
      <path d="M2 4 L5 7 L8 4" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </svg>
  );
}

/** Generic facet dropdown — button trigger ("Label" or "Label · value") with a
 * chevron, opens a popover panel beneath. Click-outside or Escape closes. The
 * button switches to ink-on-paper2 when active so the user can see at a glance
 * which facets are filtering. The panel content is a render-prop receiving a
 * `close` callback. */
export function FacetDropdown({
  label,
  valueLabel,
  isActive,
  children,
  panelClassName,
}: {
  label: string;
  valueLabel?: string | null;
  isActive: boolean;
  children: (close: () => void) => React.ReactNode;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) onOpen?.();
        }}
        aria-expanded={open}
        className={
          'inline-flex items-center gap-1.5 border border-border px-2.5 py-1.5 font-mono text-[13.5px] transition-colors ' +
          (isActive ? 'bg-paper2 text-ink' : 'bg-paper text-muted hover:text-ink')
        }
      >
        <span>{label}</span>
        {valueLabel ? <span className="text-ink">· {valueLabel}</span> : null}
        <span className="text-mute2">
          <ChevronDown />
        </span>
      </button>
      {open ? (
        <div
          className={
            'absolute left-0 top-full z-30 mt-1 min-w-[200px] border border-border bg-paper py-1 shadow-[0_8px_24px_-8px_rgba(28,26,22,0.2)] ' +
            (panelClassName ?? '')
          }
        >
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}

/** Square checkbox glyph for multi-select facet options. */
export function CheckboxIcon({ on }: { on: boolean }) {
  return (
    <span
      className={
        'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border ' +
        (on ? 'border-ink bg-ink text-paper' : 'border-border bg-paper')
      }
    >
      {on ? (
        <svg viewBox="0 0 10 10" className="h-2 w-2">
          <path
            d="M2 5.5 L4 7.5 L8 3"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  );
}
