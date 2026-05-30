import { runPreFilter, type PreFilterConfig } from './pre-filter';

const baseConfig: PreFilterConfig = {
  minLength: 200,
  titleRatio: 0.5,
  linkDensityRatio: 0.5,
  checks: {
    empty: true,
    minLength: true,
    spamTitleRatio: true,
    spamLinkDensity: true,
  },
};

const cfg = (over: Partial<PreFilterConfig> = {}): PreFilterConfig => ({
  ...baseConfig,
  ...over,
  checks: { ...baseConfig.checks, ...(over.checks ?? {}) },
});

describe('runPreFilter', () => {
  it('passes a normal article', () => {
    const r = runPreFilter(
      { title: 'A real headline', body: 'x'.repeat(300) },
      cfg(),
    );
    expect(r.filtered).toBe(false);
  });

  it('flags empty title / body', () => {
    expect(
      runPreFilter({ title: '', body: 'x'.repeat(300) }, cfg()),
    ).toMatchObject({
      filtered: true,
      reason: 'empty',
      detail: 'title is empty',
    });
    expect(runPreFilter({ title: 'Title', body: '   ' }, cfg())).toMatchObject({
      reason: 'empty',
      detail: 'body is empty',
    });
  });

  it('flags too-short body with the actual numbers', () => {
    const r = runPreFilter({ title: 'Title', body: 'short body' }, cfg());
    expect(r).toMatchObject({ filtered: true, reason: 'too_short' });
    if (r.filtered) expect(r.detail).toContain('below the 200-char minimum');
  });

  it('flags title-ratio spam', () => {
    const r = runPreFilter(
      { title: 'T'.repeat(120), body: 'b'.repeat(200) },
      cfg(),
    );
    expect(r).toMatchObject({ filtered: true, reason: 'spam' });
    if (r.filtered) expect(r.detail).toContain('over 50%');
  });

  it('flags link-farm spam', () => {
    const body = `<a href="x">${'L'.repeat(150)}</a>${'Z'.repeat(40)}`;
    const r = runPreFilter({ title: 'Tiny', body }, cfg());
    expect(r).toMatchObject({ filtered: true, reason: 'spam' });
    if (r.filtered) expect(r.detail).toContain('link farm');
  });

  it('flags a markup-only body as having no extractable text', () => {
    // Raw length well over 200, but zero visible text once tags/&nbsp; go — the
    // "статті без видобутного тексту" signal. Caught as empty, not too_short.
    const body = '<div><img src="x.png"/><br>&nbsp;&nbsp;</div>'.repeat(8);
    const r = runPreFilter({ title: 'Has a title', body }, cfg());
    expect(r).toMatchObject({ filtered: true, reason: 'empty' });
    if (r.filtered) expect(r.detail).toContain('no extractable text');
  });

  it('keeps a short HTML excerpt (real text < 200 but raw >= 200) — not too_short', () => {
    // Mirrors real excerpt feeds (WIRED/BBC/HN): ~150 chars of prose plus
    // markup. The raw-length floor must not drop these.
    const body =
      '<p>' + 'Real reporting text. '.repeat(9) + '</p><img src="hero.jpg"/>';
    const r = runPreFilter(
      { title: 'A genuine short news excerpt', body },
      cfg(),
    );
    expect(r.filtered).toBe(false);
  });

  it('skips checks that are disabled', () => {
    // Empty body would normally be 'empty' / 'too_short'; with both off it passes.
    const r = runPreFilter(
      { title: '', body: '' },
      cfg({
        checks: {
          empty: false,
          minLength: false,
          spamTitleRatio: false,
          spamLinkDensity: false,
        },
      }),
    );
    expect(r.filtered).toBe(false);
  });

  it('respects a tuned title ratio threshold', () => {
    const input = { title: 'T'.repeat(120), body: 'b'.repeat(200) }; // 120/200 = 60%
    expect(runPreFilter(input, cfg({ titleRatio: 0.5 })).filtered).toBe(true); // 60% > 50%
    expect(runPreFilter(input, cfg({ titleRatio: 0.9 })).filtered).toBe(false); // 60% < 90%
  });
});
