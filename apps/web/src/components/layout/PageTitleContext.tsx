import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Ctx = {
  title: string | null;
  setTitle: (t: string | null) => void;
};

const PageTitleCtx = createContext<Ctx | null>(null);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  return (
    <PageTitleCtx.Provider value={{ title, setTitle }}>{children}</PageTitleCtx.Provider>
  );
}

export function usePageTitle(): string | null {
  const ctx = useContext(PageTitleCtx);
  return ctx?.title ?? null;
}

/** Publish a title for the current route. Cleared automatically on unmount or when
 * `title` is null/undefined. Pages call this after their data loads so TopBar can
 * substitute the human-readable title for the UUID in the breadcrumb. */
export function useSetPageTitle(title: string | null | undefined) {
  const ctx = useContext(PageTitleCtx);
  useEffect(() => {
    if (!ctx) return;
    ctx.setTitle(title ?? null);
    return () => ctx.setTitle(null);
  }, [ctx, title]);
}
