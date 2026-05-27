import { useRef } from 'react';
import { useDispatch } from 'react-redux';
import { api } from '../store/api';
import { useToasts } from '../components/toast/ToastHost';
import { useServerEvents } from './useServerEvents';

/**
 * SSE-driven replacement for the old polling-based RegenBanner. Listens for
 * regeneration.{started,progress,completed,failed} events and surfaces them
 * as toasts:
 *  - started → opens a progress toast (persistent, spinner + bar at 0/total)
 *  - progress → updates the same toast in place with current/total + cache hits
 *  - completed → morphs to success severity (auto-dismiss), invalidates
 *    Articles/Categories/Axes so the UI reflects the new tags
 *  - failed → morphs to error severity (sticky), surfaces errorMessage
 *
 * The toast id is stored in a ref so progress events update the active toast
 * rather than spawning a new one. On unmount the ref is dropped, the toast
 * remains live in ToastHost.
 *
 * Mount once at app root (Shell). Multiple mounts would open redundant
 * EventSource connections and create competing toasts.
 */
export function useRegenerationStatusEvents(): void {
  const dispatch = useDispatch();
  const { push, update } = useToasts();
  // runId → toastId, so a follow-up event finds the right toast even if two
  // regenerations somehow overlap (defense in depth — the active-index
  // partial-unique on regeneration_run normally prevents that).
  const toastByRun = useRef<Map<string, string>>(new Map());

  useServerEvents((event) => {
    if (event.type === 'regeneration.started') {
      const { runId, articlesTotal } = event.payload;
      const id = push({
        severity: 'info',
        title: 'Regenerating tags',
        subtitle: `${articlesTotal} article${articlesTotal === 1 ? '' : 's'}`,
        progress: { current: 0, total: articlesTotal },
      });
      toastByRun.current.set(runId, id);
      return;
    }

    if (event.type === 'regeneration.progress') {
      const { runId, articlesProcessed, articlesTotal, articlesCacheHit } =
        event.payload;
      const toastId = toastByRun.current.get(runId);
      if (!toastId) return;
      update(toastId, {
        progress: {
          current: articlesProcessed,
          total: articlesTotal,
          meta: articlesCacheHit > 0 ? `${articlesCacheHit} from cache` : undefined,
        },
      });
      return;
    }

    if (event.type === 'regeneration.completed') {
      const {
        runId,
        articlesProcessed,
        articlesCacheHit,
        articlesLlmCalled,
        articlesErrored,
      } = event.payload;
      const toastId = toastByRun.current.get(runId);
      toastByRun.current.delete(runId);

      const parts = [
        `${articlesCacheHit} from cache`,
        `${articlesLlmCalled} new LLM calls`,
      ];
      if (articlesErrored > 0) parts.push(`${articlesErrored} errored`);
      const body = parts.join(' · ');

      if (toastId) {
        update(toastId, {
          severity: 'success',
          title: 'Regeneration done',
          subtitle: `${articlesProcessed} article${articlesProcessed === 1 ? '' : 's'} updated`,
          body,
          progress: undefined,
        });
      } else {
        push({
          severity: 'success',
          title: 'Regeneration done',
          subtitle: `${articlesProcessed} article${articlesProcessed === 1 ? '' : 's'} updated`,
          body,
        });
      }

      // Invalidate Regeneration so AxesPage/CategoriesPage's "Regenerate"
      // button re-enables itself; Articles/Categories/Axes so the new tags
      // surface in the UI.
      dispatch(
        api.util.invalidateTags(['Regeneration', 'Articles', 'Categories', 'Axes']),
      );
      return;
    }

    if (event.type === 'regeneration.failed') {
      const { runId, errorMessage } = event.payload;
      const toastId = toastByRun.current.get(runId);
      toastByRun.current.delete(runId);

      if (toastId) {
        update(toastId, {
          severity: 'error',
          title: 'Regeneration failed',
          body: errorMessage,
          progress: undefined,
        });
      } else {
        push({
          severity: 'error',
          title: 'Regeneration failed',
          body: errorMessage,
        });
      }

      dispatch(api.util.invalidateTags(['Regeneration']));
    }
  });
}
