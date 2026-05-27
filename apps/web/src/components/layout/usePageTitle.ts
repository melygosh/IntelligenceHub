import { useContext, useEffect } from 'react';
import { PageTitleContext } from './page-title-context';

export function usePageTitle(): string | null {
  const ctx = useContext(PageTitleContext);
  return ctx?.title ?? null;
}

/** Publish a title for the current route. Cleared automatically on unmount or when
 * `title` is null/undefined. Pages call this after their data loads so TopBar can
 * substitute the human-readable title for the UUID in the breadcrumb. */
export function useSetPageTitle(title: string | null | undefined) {
  const ctx = useContext(PageTitleContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setTitle(title ?? null);
    return () => ctx.setTitle(null);
  }, [ctx, title]);
}
