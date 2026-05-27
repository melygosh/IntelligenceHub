import { createContext } from 'react';

export type PageTitleCtx = {
  title: string | null;
  setTitle: (t: string | null) => void;
};

// Own (non-component) module so the provider component and the hooks can both
// import it without tripping react-refresh's only-export-components rule.
export const PageTitleContext = createContext<PageTitleCtx | null>(null);
