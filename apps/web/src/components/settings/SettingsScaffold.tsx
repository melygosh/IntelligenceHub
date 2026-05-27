import type { ReactNode } from 'react';
import { RegenerateButton } from './RegenerateButton';

/** Shared shell for a settings page: centered column, "Settings" eyebrow +
 * title + description, the page's own body as `children`, and the regenerate
 * control pinned at the bottom. Page-specific add-forms and lists go in
 * `children` — only the common chrome lives here. */
export function SettingsScaffold({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <div className="mb-1.5 font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
          Settings
        </div>
        <h1 className="pretty mb-1 font-serif text-[30px] leading-tight text-ink">{title}</h1>
        <p className="font-mono text-[12.5px] text-mute2">{description}</p>
      </header>

      {children}

      <RegenerateButton />
    </div>
  );
}
