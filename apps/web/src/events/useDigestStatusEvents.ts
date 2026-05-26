import { useDispatch } from 'react-redux';
import { api } from '../store/api';
import { useServerEvents } from './useServerEvents';

/**
 * Filters the generic server-event stream to digest status changes and
 * invalidates the relevant RTK Query tags so the history list +
 * (if currently open) detail page automatically refetch.
 *
 * Mount once per page that cares about digest status (DigestsPage +
 * DigestDetailPage). Multiple mounts result in multiple EventSource
 * connections — acceptable at Day 12 scope (the pages aren't both
 * rendered simultaneously). Phase 3 polish would lift to a single
 * provider at root.
 */
export function useDigestStatusEvents(): void {
  const dispatch = useDispatch();
  useServerEvents((event) => {
    if (event.type !== 'digest.status_changed') return;
    dispatch(
      api.util.invalidateTags([
        'Digests',
        { type: 'Digest', id: event.payload.digestId },
      ]),
    );
  });
}
