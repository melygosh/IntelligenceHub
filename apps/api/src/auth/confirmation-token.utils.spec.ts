import {
  buildConfirmationUrl,
  generateRawToken,
  hashToken,
  TOKEN_EXPIRY_MS,
} from './confirmation-token.utils';

describe('generateRawToken', () => {
  it('returns a 43-44 char URL-safe base64 string', () => {
    const t = generateRawToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThanOrEqual(43);
    expect(t.length).toBeLessThanOrEqual(44);
  });

  it('produces distinct tokens across many calls', () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) set.add(generateRawToken());
    expect(set.size).toBe(100);
  });
});

describe('hashToken', () => {
  it('returns a 64-char hex string (sha256)', () => {
    const h = hashToken('hello');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(hashToken('hello')).toBe(hashToken('hello'));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});

describe('buildConfirmationUrl', () => {
  it('joins web base url + frontend route + token', () => {
    expect(buildConfirmationUrl('http://localhost:5174', 'abc123')).toBe(
      'http://localhost:5174/auth/confirm?token=abc123',
    );
  });

  it('handles trailing slash on the base url', () => {
    expect(buildConfirmationUrl('http://localhost:5174/', 'abc123')).toBe(
      'http://localhost:5174/auth/confirm?token=abc123',
    );
  });

  it('URI-encodes the token (defensive, even though base64url has no special chars)', () => {
    expect(buildConfirmationUrl('http://localhost:5174', 'a/b+c')).toBe(
      'http://localhost:5174/auth/confirm?token=a%2Fb%2Bc',
    );
  });
});

describe('TOKEN_EXPIRY_MS', () => {
  it('is 24 hours', () => {
    expect(TOKEN_EXPIRY_MS).toBe(24 * 60 * 60 * 1000);
  });
});
