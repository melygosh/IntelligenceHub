import type { EntityKind } from '@intelligencehub/shared';

// Single source of truth for entity-type glyphs so every surface (article
// detail, entity pages, digests, feed) renders the same shape per kind.
const GLYPHS: Record<EntityKind, React.ReactNode> = {
  company: <rect x="1" y="1" width="8" height="8" fill="currentColor" />,
  person: <circle cx="5" cy="5" r="4" fill="currentColor" />,
  product: <rect x="1" y="1" width="8" height="8" rx="2.2" fill="currentColor" />,
  technology: (
    <rect x="2.2" y="2.2" width="5.6" height="5.6" fill="currentColor" transform="rotate(45 5 5)" />
  ),
  location: <circle cx="5" cy="5" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.5" />,
};

export function EntityGlyph({
  type,
  className = 'h-2.5 w-2.5',
}: {
  type: EntityKind;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 10 10" className={className} aria-hidden="true">
      {GLYPHS[type]}
    </svg>
  );
}
