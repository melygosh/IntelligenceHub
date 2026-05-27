import { assertPublicHttpUrl } from './url-guard';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const USER_AGENT = 'IntelligenceHub/0.1 (+https://intelligencehub.local)';

/**
 * Fetch a URL as text with SSRF protection. Every hop — including each redirect
 * — is re-validated by {@link assertPublicHttpUrl}, redirects are followed
 * manually (so a public URL cannot bounce to an internal one), and the response
 * is bounded by time (10s) and size (5MB).
 *
 * Throws BlockedUrlError (via the guard) when a hop targets a private/reserved
 * address; other failures throw a generic Error.
 */
export async function fetchTextSafely(initialUrl: string): Promise<string> {
  let url = initialUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHttpUrl(url);
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error(`Redirect (${res.status}) without Location`);
      url = new URL(loc, url).toString(); // re-validated at the top of the next hop
      continue;
    }
    if (!res.ok) throw new Error(`Upstream responded ${res.status}`);

    const body = res.body;
    if (!body) return '';
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel();
          throw new Error('Feed exceeds 5MB limit');
        }
        chunks.push(value);
      }
    }
    return Buffer.concat(chunks).toString('utf-8');
  }
  throw new Error('Too many redirects');
}
