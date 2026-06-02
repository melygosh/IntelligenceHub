import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { ServerEvent } from '@intelligencehub/shared';
import { SubscribeContext, type Dispatcher, type SubscribeFn } from './server-events-context';

/**
 * Owns the ONE EventSource('/api/events') for the authenticated session and
 * fans each parsed message out to every subscriber. Previously each event hook
 * opened its own EventSource, so a page stacked 2-3 live streams (Shell's
 * regeneration hook + the page's own), eating the browser's ~6-per-host budget
 * and re-parsing every event N times. Mount once inside AuthGuard (the cookie
 * must exist) and above Shell so Shell + all routed pages share this stream.
 *
 * Auth: same-origin cookie via withCredentials. Native EventSource
 * auto-reconnects on transient errors; a persistent 401 is handled by the
 * api-wrapper redirect on the next regular fetch.
 */
export function ServerEventsProvider({ children }: { children: ReactNode }) {
  const subscribers = useRef<Set<Dispatcher>>(new Set());

  // Stable across renders (empty deps) so consumer effects don't re-subscribe.
  // The ref is only touched inside this callback (invoked from effects), never
  // during render.
  const subscribe = useCallback<SubscribeFn>((cb) => {
    subscribers.current.add(cb);
    return () => {
      subscribers.current.delete(cb);
    };
  }, []);

  useEffect(() => {
    const source = new EventSource('/api/events', { withCredentials: true });
    source.onmessage = (msg) => {
      let parsed: ServerEvent;
      try {
        parsed = ServerEvent.parse(JSON.parse(msg.data));
      } catch (err) {
        console.warn('[events] failed to parse SSE message', err);
        return;
      }
      // Snapshot so a subscriber unsubscribing during dispatch can't disturb
      // the iteration.
      for (const cb of [...subscribers.current]) cb(parsed);
    };
    source.onerror = () => {
      // Native auto-reconnect; persistent 401 handled by the api wrapper.
    };
    return () => source.close();
  }, []);

  return <SubscribeContext.Provider value={subscribe}>{children}</SubscribeContext.Provider>;
}
