import { normalize } from './entity-normalize';

describe('normalize', () => {
  it('lowercases ASCII letters', () => {
    expect(normalize('Microsoft')).toBe('microsoft');
  });

  it('trims surrounding whitespace', () => {
    expect(normalize('  Microsoft  ')).toBe('microsoft');
  });

  it('strips trailing Corp. / Inc. / Ltd. / LLC / GmbH / AG / PLC / Co. variants', () => {
    expect(normalize('Microsoft Corp.')).toBe('microsoft');
    expect(normalize('Acme Inc.')).toBe('acme');
    expect(normalize('Acme Inc')).toBe('acme');
    expect(normalize('Foo Ltd.')).toBe('foo');
    expect(normalize('Foo Ltd')).toBe('foo');
    expect(normalize('Bar LLC')).toBe('bar');
    expect(normalize('Bar LLP')).toBe('bar');
    expect(normalize('Baz GmbH')).toBe('baz');
    expect(normalize('Quux AG')).toBe('quux');
    expect(normalize('Zog PLC')).toBe('zog');
    expect(normalize('Mux Co.')).toBe('mux');
    expect(normalize('Mux Co')).toBe('mux');
    expect(normalize('Krug S.A.')).toBe('krug');
    expect(normalize('Krug S.p.A.')).toBe('krug');
    expect(normalize('Long Corporation')).toBe('long');
  });

  it('strips leading "The "', () => {
    expect(normalize('The Verge')).toBe('verge');
    expect(normalize('THE BEATLES')).toBe('beatles');
  });

  it('preserves Cyrillic but lowercases it', () => {
    expect(normalize('Майкрософт')).toBe('майкрософт');
  });

  it('applies NFKC normalization for compatibility characters', () => {
    // U+FF21 FULLWIDTH LATIN CAPITAL LETTER A → 'A' (NFKC), then lowercase → 'a'
    expect(normalize('Ａpple')).toBe('apple');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalize('   ')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(normalize('')).toBe('');
  });

  it('does not strip mid-word suffix-like tokens', () => {
    expect(normalize('CorporateName')).toBe('corporatename');
  });

  it('strips trailing punctuation before suffix detection', () => {
    expect(normalize('Acme, Inc.')).toBe('acme');
  });
});
