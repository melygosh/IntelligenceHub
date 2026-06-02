import { useEffect, useRef } from 'react';
import { ServerEvent } from '@intelligencehub/shared';
import { useServerEventsSubscribe } from './server-events-context';

type Dispatcher = (event: ServerEvent) => void;

/**
 * Subscribe to the shared server-event stream owned by ServerEventsProvider.
 * Multiple consumers mount cheaply — they all attach to the SAME EventSource
 * (no per-hook connection). The latest callback is held in a ref so updating
 * it doesn't re-subscribe.
 */
export function useServerEvents(onEvent: Dispatcher): void {
  const subscribe = useServerEventsSubscribe();
  const handlerRef = useRef(onEvent);
  // Keep the ref pointing at the latest callback without re-subscribing.
  useEffect(() => {
    handlerRef.current = onEvent;
  });

  useEffect(() => {
    const unsubscribe = subscribe((event) => handlerRef.current(event));
    return unsubscribe;
  }, [subscribe]);
}
