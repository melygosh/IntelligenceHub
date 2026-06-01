import { FeedFetcher } from './feed-fetcher.service';
import { fetchTextSafely } from '../common/security/safe-fetch';

// Mock only the network layer (SSRF-guarded fetch); everything else — the
// rss-parser config, the RSS/Atom mapping, dedup-hash, url-normalise — runs for
// real so this exercises the actual parsing code.
jest.mock('../common/security/safe-fetch', () => ({
  fetchTextSafely: jest.fn(),
}));

const mockFetch = fetchTextSafely as jest.MockedFunction<
  typeof fetchTextSafely
>;

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Sample RSS</title>
  <image><url>https://ex.com/icon.png</url></image>
  <item>
    <title>First post</title>
    <link>https://ex.com/a</link>
    <pubDate>Wed, 01 Jan 2025 00:00:00 GMT</pubDate>
    <description>Body one</description>
  </item>
  <item>
    <title>Second</title>
    <link>https://ex.com/b</link>
    <description>Body two</description>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Sample Atom</title>
  <icon>https://ex.com/atom-icon.png</icon>
  <entry>
    <title>Atom entry</title>
    <link href="https://ex.com/atom1"/>
    <updated>2025-02-01T00:00:00Z</updated>
    <summary>Atom body</summary>
  </entry>
</feed>`;

describe('FeedFetcher (RSS/Atom parsing)', () => {
  let fetcher: FeedFetcher;
  beforeEach(() => {
    fetcher = new FeedFetcher();
    mockFetch.mockReset();
  });

  it('parses an RSS 2.0 feed: title, items, icon', async () => {
    mockFetch.mockResolvedValue(RSS);
    const feed = await fetcher.fetch('https://ex.com/rss');
    expect(feed.title).toBe('Sample RSS');
    expect(feed.iconUrl).toBe('https://ex.com/icon.png');
    expect(feed.items).toHaveLength(2);
    expect(feed.items[0].title).toBe('First post');
    expect(feed.items[0].url).toBe('https://ex.com/a');
    expect(feed.items[0].normalisedUrl).toContain('ex.com/a');
    expect(feed.items[0].body).toContain('Body one');
    expect(feed.items[0].contentHash).toMatch(/^[a-f0-9]+$/);
    expect(feed.items[0].ts.getUTCFullYear()).toBe(2025);
  });

  it('parses an Atom feed: link href, title, icon', async () => {
    mockFetch.mockResolvedValue(ATOM);
    const feed = await fetcher.fetch('https://ex.com/atom');
    expect(feed.title).toBe('Sample Atom');
    expect(feed.iconUrl).toBe('https://ex.com/atom-icon.png');
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].title).toBe('Atom entry');
    expect(feed.items[0].url).toBe('https://ex.com/atom1');
    expect(feed.items[0].ts.getUTCMonth()).toBe(1); // February
  });

  it('rejects non-feed content as not_a_feed', async () => {
    mockFetch.mockResolvedValue('just some plain text, not xml at all');
    await expect(fetcher.fetch('https://ex.com/nope')).rejects.toMatchObject({
      reason: 'not_a_feed',
    });
  });

  it('rejects a feed with no title and no items as empty', async () => {
    mockFetch.mockResolvedValue(
      '<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>',
    );
    await expect(fetcher.fetch('https://ex.com/empty')).rejects.toMatchObject({
      reason: 'empty',
    });
  });
});
