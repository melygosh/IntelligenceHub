import { normaliseUrl } from '@intelligencehub/shared';

describe('normaliseUrl (FR-5 article dedup key)', () => {
  describe('must collapse — noise that does not change which article is referenced', () => {
    it('lowercases the hostname', () => {
      expect(normaliseUrl('https://Example.COM/a')).toBe(
        'https://example.com/a',
      );
    });

    it('strips the default port 443 on https', () => {
      expect(normaliseUrl('https://example.com:443/a')).toBe(
        'https://example.com/a',
      );
    });

    it('strips the default port 80 on http', () => {
      expect(normaliseUrl('http://example.com:80/a')).toBe(
        'http://example.com/a',
      );
    });

    it('strips the URL fragment', () => {
      expect(normaliseUrl('https://example.com/a#section-2')).toBe(
        'https://example.com/a',
      );
    });

    it('strips a trailing slash on non-root paths', () => {
      expect(normaliseUrl('https://example.com/a/b/')).toBe(
        'https://example.com/a/b',
      );
    });

    it('preserves the trailing slash on the root path', () => {
      // '/' stays '/' — stripping it would change the URL semantically.
      expect(normaliseUrl('https://example.com/')).toBe('https://example.com/');
    });

    it('strips utm_* tracking params', () => {
      expect(
        normaliseUrl(
          'https://example.com/a?utm_source=newsletter&utm_campaign=spring',
        ),
      ).toBe('https://example.com/a');
    });

    it('strips mc_* and _hs* prefix tracking params', () => {
      expect(normaliseUrl('https://example.com/a?mc_eid=abc&_hsenc=xyz')).toBe(
        'https://example.com/a',
      );
    });

    it('strips fbclid / gclid / ref / yclid / icid / mkt_tok exact-match tracking params', () => {
      expect(
        normaliseUrl(
          'https://example.com/a?fbclid=x&gclid=y&ref=z&yclid=q&icid=i&mkt_tok=m',
        ),
      ).toBe('https://example.com/a');
    });

    it('matches tracking-param keys case-insensitively', () => {
      // utm_* prefix lowercased; FBCLID exact-match lowercased.
      expect(normaliseUrl('https://example.com/a?UTM_SOURCE=x&FBCLID=y')).toBe(
        'https://example.com/a',
      );
    });

    it('collapses every noise source at once', () => {
      const noisy =
        'HTTPS://Example.COM:443/a/b/?utm_source=x&fbclid=y&id=42#bottom';
      const clean = 'https://example.com/a/b?id=42';
      expect(normaliseUrl(noisy)).toBe(clean);
    });
  });

  describe('must preserve — anything that distinguishes articles', () => {
    it('keeps non-tracking query params', () => {
      expect(normaliseUrl('https://example.com/a?id=42')).toBe(
        'https://example.com/a?id=42',
      );
    });

    it('keeps non-tracking params when tracking ones are stripped alongside', () => {
      // The non-tracking `id=42` survives; only `gclid` + `utm_*` are stripped.
      expect(
        normaliseUrl('https://example.com/a?id=42&gclid=x&utm_campaign=y'),
      ).toBe('https://example.com/a?id=42');
    });

    it('treats different paths as different URLs', () => {
      expect(normaliseUrl('https://example.com/a')).not.toBe(
        normaliseUrl('https://example.com/b'),
      );
    });

    it('treats different non-tracking query values as different URLs', () => {
      expect(normaliseUrl('https://example.com/a?id=1')).not.toBe(
        normaliseUrl('https://example.com/a?id=2'),
      );
    });

    it('treats different hosts as different URLs', () => {
      expect(normaliseUrl('https://example.com/a')).not.toBe(
        normaliseUrl('https://other.com/a'),
      );
    });

    it('treats http vs https as different URLs', () => {
      // Scheme is intentionally NOT normalised — http:// and https:// can serve
      // different content; we don't want to collapse them.
      expect(normaliseUrl('http://example.com/a')).not.toBe(
        normaliseUrl('https://example.com/a'),
      );
    });
  });

  describe('input validation', () => {
    it('throws on invalid input (no scheme)', () => {
      // The worker calls this on raw RSS URLs — a missing scheme should surface
      // a parse error to the caller, not produce a misleading 'normalised' string.
      expect(() => normaliseUrl('not-a-url')).toThrow();
    });

    it('throws on empty input', () => {
      expect(() => normaliseUrl('')).toThrow();
    });
  });
});
