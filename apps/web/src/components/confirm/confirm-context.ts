import { createContext } from 'react';

export type ConfirmTone = 'default' | 'danger';

export type ConfirmOptions = {
  /** Bold serif heading, e.g. "Delete category". */
  title: string;
  /** Optional supporting line below the title. */
  message?: string;
  /** Primary button label. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Secondary button label. Defaults to "Cancel". */
  cancelLabel?: string;
  /** "danger" paints the primary button in the critical palette. */
  tone?: ConfirmTone;
};

/** Opens the confirm modal and resolves true (confirmed) or false
 * (cancelled / dismissed / Escape). A drop-in async replacement for the
 * native `confirm()`. */
export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

// Lives in its own (non-component) module so both <ConfirmProvider> and the
// useConfirm() hook can import it without tripping react-refresh's
// only-export-components rule.
export const ConfirmContext = createContext<ConfirmFn | null>(null);
