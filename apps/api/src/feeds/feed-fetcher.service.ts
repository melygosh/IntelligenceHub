import { Injectable } from '@nestjs/common';
import Parser from 'rss-parser';
import { normaliseUrl } from '@intelligencehub/shared';
import { contentHash } from './content-hash';
import { fetchTextSafely } from '../common/security/safe-fetch';
import { BlockedUrlError } from '../common/security/url-guard';

export type FetchedItem = {
  url: string;
  normalisedUrl: string;
  title: string;
  body: string;
  contentHash: string;
  ts: Date;
};

export type FetchedFeed = {
  title: string;
  iconUrl: string | null;
  items: FetchedItem[];
};

export type FetchErrorReason = 'unreachable' | 'not_a_feed' | 'malformed_url' | 'empty' | 'blocked';

@Injectable()
export class FeedFetcher {
  // customFields surfaces Atom's top-level <icon> + <logo> elements; rss-parser
  // already exposes RSS 2.0 <image><url> as `parsed.image.url` by default.
  // Network fetching (with the SSRF guard + time/size caps) is done by
  // fetchTextSafely; this parser only turns the fetched text into a feed.
  private readonly parser = new Parser({
    customFields: {
      feed: ['icon', 'logo'],
    },
  });

  /**
   * Fetch + parse a feed URL. Throws an Error annotated with `reason` and `detail`
   * so callers can map to ValidateFeedResponse without leaking internals.
   */
  async fetch(url: string): Promise<FetchedFeed> {
    // SSRF-guarded fetch: rejects private/reserved hosts (incl. cloud-metadata),
    // re-validates every redirect hop, and caps time + body size.
    let xml: string;
    try {
      xml = await fetchTextSafely(url);
    } catch (err) {
      if (err instanceof BlockedUrlError) {
        throw this.makeError('blocked', err.message);
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw this.makeError('unreachable', msg);
    }

    let parsed: Parser.Output<Record<string, unknown>>;
    try {
      parsed = await this.parser.parseString(xml);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Invalid character')) {
        throw this.makeError('malformed_url', msg);
      }
      throw this.makeError('not_a_feed', 'URL responded but content is not RSS/Atom');
    }

    const title = (parsed.title ?? '').trim();
    if (!title && (parsed.items ?? []).length === 0) {
      throw this.makeError('empty', 'Feed has no title and no items');
    }

    const items: FetchedItem[] = [];
    for (const item of parsed.items ?? []) {
      const rawUrl = (item.link ?? '').trim();
      if (!rawUrl) continue;
      let normalised: string;
      try {
        normalised = normaliseUrl(rawUrl);
      } catch {
        continue;
      }
      const itemTitle = (item.title ?? '').trim();
      const itemBody =
        (typeof item['content:encoded'] === 'string' ? item['content:encoded'] : null) ??
        item.content ??
        item.contentSnippet ??
        item.summary ??
        '';
      const ts = item.isoDate ? new Date(item.isoDate) : new Date();
      items.push({
        url: rawUrl,
        normalisedUrl: normalised,
        title: itemTitle,
        body: itemBody,
        contentHash: contentHash(itemBody || itemTitle),
        ts,
      });
    }

    const iconUrl = extractIconUrl(
      parsed as unknown as Record<string, unknown>,
    );
    return {
      title: title || items[0]?.title || 'Untitled feed',
      iconUrl,
      items,
    };
  }

  private makeError(reason: FetchErrorReason, detail: string): Error & { reason: FetchErrorReason; detail: string } {
    const err = new Error(detail) as Error & { reason: FetchErrorReason; detail: string };
    err.reason = reason;
    err.detail = detail;
    return err;
  }
}

/**
 * Extract the channel-level icon URL.
 * - RSS 2.0: <channel><image><url>...</url></image> → `parsed.image.url`
 * - Atom: top-level <icon> or <logo> → surfaced via customFields
 * Returns null if none is present or the value isn't a usable absolute URL.
 */
function extractIconUrl(parsed: Record<string, unknown>): string | null {
  const candidates: unknown[] = [
    (parsed.image as { url?: unknown } | undefined)?.url,
    parsed.icon,
    parsed.logo,
  ];
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const trimmed = c.trim();
    if (!trimmed) continue;
    try {
      new URL(trimmed);
    } catch {
      continue;
    }
    return trimmed;
  }
  return null;
}
