import type { ReactNode } from 'react';

/**
 * Standard page header used by list and detail pages. Renders an eyebrow
 * (route-like or breadcrumb), a serif title, and an optional subtitle.
 * Subtitle can be a string (rendered as muted mono text) or arbitrary node
 * for pages that need a richer line (stats, links, etc.).
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  const hasSubtitle = subtitle !== undefined && subtitle !== null;
  return (
    <header>
      <div className="mb-1.5 font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
        {eyebrow}
      </div>
      <h1
        className={
          'pretty font-serif text-[30px] leading-tight text-ink' +
          (hasSubtitle ? ' mb-3' : '')
        }
      >
        {title}
      </h1>
      {hasSubtitle
        ? typeof subtitle === 'string'
          ? <p className="font-mono text-[12.5px] text-mute2">{subtitle}</p>
          : subtitle
        : null}
    </header>
  );
}
