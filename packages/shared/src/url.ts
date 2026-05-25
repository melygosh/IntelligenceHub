/**
 * Normalise a URL for dedup purposes:
 *  - lowercase host
 *  - strip default ports (80/443)
 *  - strip fragment
 *  - strip well-known tracking params
 *  - remove trailing slash from path (except root)
 */
const TRACKING_PARAMS_PREFIXES = ['utm_', 'mc_', '_hs'];
const TRACKING_PARAMS_EXACT = new Set(['fbclid', 'gclid', 'ref', 'yclid', 'icid', 'mkt_tok']);

export function normaliseUrl(input: string): string {
  const url = new URL(input);

  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) {
    url.port = '';
  }
  url.hash = '';

  const keep = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (TRACKING_PARAMS_EXACT.has(lower)) return;
    if (TRACKING_PARAMS_PREFIXES.some((p) => lower.startsWith(p))) return;
    keep.append(key, value);
  });
  url.search = keep.toString() ? `?${keep.toString()}` : '';

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}
