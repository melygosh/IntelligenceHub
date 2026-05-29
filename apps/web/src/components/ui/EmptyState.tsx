import type { ReactNode } from 'react';

/**
 * Centered empty / not-found / error state. Used in lists when a filter
 * returns no rows, on detail pages when the entity is missing, and on every
 * page for failure copy. Variant `error` swaps the title to the critical
 * palette; the subtitle stays muted in both variants.
 */
export function EmptyState({
  title,
  subtitle,
  variant = 'empty',
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  variant?: 'empty' | 'error';
  className?: string;
}) {
  return (
    <div
      className={
        'px-5 py-10 text-center' + (className ? ' ' + className : '')
      }
    >
      <p
        className={
          'font-serif text-[22px] ' +
          (variant === 'error' ? 'text-critical' : 'text-ink')
        }
      >
        {title}
      </p>
      {subtitle ? (
        <p className="mx-auto mt-2 max-w-xl font-mono text-[14px] leading-relaxed text-muted">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
