import { useState } from 'react';
import {
  useGetCurrentRegenerationQuery,
  useStartRegenerationMutation,
} from '../../store/api';

/** "Regenerate articles" control — regenerates every article under the user's
 * current config. Shared by the settings pages (categories, axes) since
 * changing either invalidates prior taggings. */
export function RegenerateButton() {
  const { data: run } = useGetCurrentRegenerationQuery();
  const [startRegen, { isLoading }] = useStartRegenerationMutation();
  const [message, setMessage] = useState<string | null>(null);

  const isRunning = run?.status === 'running';

  async function onClick() {
    setMessage(null);
    try {
      const result = await startRegen().unwrap();
      if (result.eligibleArticles === 0) {
        setMessage('Nothing to regenerate — all articles already match your current config.');
      } else {
        setMessage(`Regeneration started — ${result.eligibleArticles} articles will be re-processed.`);
      }
    } catch (err) {
      const code = (err as { data?: { error?: string } }).data?.error;
      if (code === 'already_running') {
        setMessage('A regeneration is already in progress.');
      } else {
        setMessage('Could not start regeneration. Try again in a moment.');
      }
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isLoading || isRunning}
        className="border border-ink bg-ink px-3 py-1.5 font-mono text-[13px] uppercase tracking-[0.1em] text-paper disabled:opacity-50"
      >
        {isRunning
          ? 'Regeneration in progress…'
          : isLoading
            ? 'Starting…'
            : 'Regenerate articles'}
      </button>
      <p className="font-mono text-[12.5px] text-mute2">
        Regenerates every article processed under your previous config. Uses cached LLM responses where the article markup didn't change.
      </p>
      {message ? <p className="font-mono text-[12.5px] text-muted">{message}</p> : null}
    </div>
  );
}
