import { createContext, useContext } from 'react';
import type { ServerEvent } from '@intelligencehub/shared';

export type Dispatcher = (event: ServerEvent) => void;
export type SubscribeFn = (cb: Dispatcher) => () => void;

export const SubscribeContext = createContext<SubscribeFn | null>(null);

/** Access the shared server-event stream's subscribe fn. */
export function useServerEventsSubscribe(): SubscribeFn {
  const subscribe = useContext(SubscribeContext);
  if (!subscribe) {
    throw new Error('useServerEvents must be used within a <ServerEventsProvider>');
  }
  return subscribe;
}
