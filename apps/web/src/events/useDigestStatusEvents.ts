import { useDispatch } from 'react-redux';
import { api } from '../store/api';
import { useToasts } from '../components/toast/useToasts';
import { useServerEvents } from './useServerEvents';

/**
 * Filters the generic server-event stream to digest status changes and:
 *  - invalidates the relevant RTK Query tags so the history list + (if open)
 *    detail page automatically refetch to the latest state;
 *  - surfaces a toast on completion ('ready' → success, 'failed' → error) so
 *    the user gets explicit confirmation the background build finished.
 *
 * Mount once per page that cares about digest status (DigestsPage +
 * DigestDetailPage). Multiple mounts result in multiple EventSource
 * connections — acceptable at this scope (the pages aren't both rendered
 * simultaneously).
 */
export function useDigestStatusEvents(): void {
  const dispatch = useDispatch();
  const { push } = useToasts();
  useServerEvents((event) => {
    if (event.type !== 'digest.status_changed') return;
    const { digestId, status } = event.payload;
    dispatch(api.util.invalidateTags(['Digests', { type: 'Digest', id: digestId }]));
    if (status === 'ready') {
      push({
        severity: 'success',
        title: 'Digest ready',
        subtitle: 'Your period digest has been built.',
      });
    } else if (status === 'failed') {
      push({
        severity: 'error',
        title: 'Digest failed',
        subtitle: 'Could not build the digest. Try again.',
      });
    }
  });
}
