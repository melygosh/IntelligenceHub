import { createContext } from 'react';
import type { Toast } from './ToastHost';

export type ToastCtx = {
  push: (t: Omit<Toast, 'id'>) => string;
  update: (id: string, patch: Partial<Omit<Toast, 'id'>>) => void;
  dismiss: (id: string) => void;
};

// Lives in its own (non-component) module so both <ToastProvider> and the
// useToasts() hook can import it without tripping react-refresh's
// only-export-components rule.
export const ToastContext = createContext<ToastCtx | null>(null);
