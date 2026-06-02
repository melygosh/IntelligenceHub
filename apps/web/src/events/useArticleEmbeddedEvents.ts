import { useDispatch } from 'react-redux';
import { api } from '../store/api';
import { useServerEvents } from './useServerEvents';

/**
 * Listens for `article.embedded` events from the embed-backfill worker
 * and invalidates the matching RelatedSemantic cache entry so the
 * "computing embedding…" placeholder on the article detail page flips
 * to the real neighbour list without a page reload (ADR-7).
 *
 * Mount once on ArticleDetail. The hook filters by event type so other
 * SSE traffic costs nothing.
 */
export function useArticleEmbeddedEvents(): void {
  const dispatch = useDispatch();
  useServerEvents((event) => {
    if (event.type !== 'article.embedded') return;
    dispatch(api.util.invalidateTags([{ type: 'RelatedSemantic', id: event.payload.articleId }]));
  });
}
