import { useContext } from 'react';
import { ToastContext, type ToastCtx } from './toast-context';

export function useToasts(): ToastCtx {
  const v = useContext(ToastContext);
  if (!v) throw new Error('useToasts must be used inside <ToastProvider>');
  return v;
}
