import { useEffect, useRef } from 'react';
import { ServerEvent } from '@intelligencehub/shared';

type Dispatcher = (event: ServerEvent) => void;

/**
 * Opens a single EventSource('/api/events') for the session, Zod-parses
 * incoming SSE messages as ServerEvent, dispatches to the provided
 * callback. Closes the stream on unmount.
 *
 * Auth: same-origin cookie (ih_auth). EventSource includes cookies
 * automatically when withCredentials=true is set.
 *
 * Reconnect: native EventSource auto-reconnects on transport errors.
 * If the JWT expires mid-stream, the next reconnect attempt returns 401;
 * the api-wrapper's 401 handling redirects to /auth/login on the next
 * regular fetch — no custom reconnect logic here.
 */
export function useServerEvents(onEvent: Dispatcher): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const source = new EventSource('/api/events', { withCredentials: true });

    source.onmessage = (msg) => {
      try {
        const parsed = ServerEvent.parse(JSON.parse(msg.data));
        handlerRef.current(parsed);
      } catch (err) {
        console.warn('[events] failed to parse SSE message', err);
      }
    };

    source.onerror = () => {
      // EventSource auto-reconnects on transient errors. Persistent 401
      // handled by the api-wrapper redirect on the next regular fetch.
    };

    return () => source.close();
  }, []);
}
