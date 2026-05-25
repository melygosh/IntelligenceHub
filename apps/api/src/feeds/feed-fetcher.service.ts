import { Injectable, Logger } from '@nestjs/common';
import Parser from 'rss-parser';
import { normaliseUrl } from '@intelligencehub/shared';
import { contentHash } from './content-hash';

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
  items: FetchedItem[];
};

export type FetchErrorReason = 'unreachable' | 'not_a_feed' | 'malformed_url' | 'empty';

@Injectable()
export class FeedFetcher {
  private readonly log = new Logger(FeedFetcher.name);
  private readonly parser = new Parser({
    timeout: 10_000,
    headers: { 'User-Agent': 'IntelligenceHub/0.1 (+https://intelligencehub.local)' },
  });

  /**
   * Fetch + parse a feed URL. Throws an Error annotated with `reason` and `detail`
   * so callers can map to ValidateFeedResponse without leaking internals.
   */
  async fetch(url: string): Promise<FetchedFeed> {
    let parsed: Parser.Output<Record<string, unknown>>;
    try {
      parsed = await this.parser.parseURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Invalid URL') || msg.includes('Invalid character')) {
        throw this.makeError('malformed_url', msg);
      }
      if (msg.includes('Non-whitespace before first tag') || msg.includes('Unexpected close')) {
        throw this.makeError('not_a_feed', 'URL responded but content is not RSS/Atom');
      }
      throw this.makeError('unreachable', msg);
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
        (typeof item['content:encoded'] === 'string' ? (item['content:encoded'] as string) : null) ??
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

    return { title: title || items[0]?.title || 'Untitled feed', items };
  }

  private makeError(reason: FetchErrorReason, detail: string): Error & { reason: FetchErrorReason; detail: string } {
    const err = new Error(detail) as Error & { reason: FetchErrorReason; detail: string };
    err.reason = reason;
    err.detail = detail;
    return err;
  }
}
