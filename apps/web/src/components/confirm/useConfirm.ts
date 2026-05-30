import { useContext } from 'react';
import { ConfirmContext, type ConfirmFn } from './confirm-context';

export function useConfirm(): ConfirmFn {
  const v = useContext(ConfirmContext);
  if (!v) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return v;
}
