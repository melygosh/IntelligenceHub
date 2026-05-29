import { contentHash } from './content-hash';

describe('contentHash (FR-5 article dedup key)', () => {
  describe('determinism', () => {
    it('produces the same hash for the same input', () => {
      const a = contentHash('Microsoft ships new AI runtime');
      const b = contentHash('Microsoft ships new AI runtime');
      expect(a).toBe(b);
    });

    it('produces a 64-char lowercase hex string (sha256)', () => {
      const h = contentHash('anything');
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    });

    it('hashes the empty string deterministically', () => {
      // sha256('') is a well-known constant — keep the assertion shape-based
      // so we're testing OUR function, not the crypto library's output.
      expect(contentHash('')).toBe(contentHash(''));
      expect(contentHash('')).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('normalisation — must collapse', () => {
    it('ignores leading and trailing whitespace', () => {
      expect(contentHash('Hello world')).toBe(contentHash('   Hello world   '));
    });

    it('ignores trailing newline', () => {
      expect(contentHash('Hello world')).toBe(contentHash('Hello world\n'));
    });

    it('ignores letter case', () => {
      expect(contentHash('Hello WORLD')).toBe(contentHash('hello world'));
    });

    it('treats mixed whitespace + case as the same content', () => {
      expect(contentHash('  HELLO World\n')).toBe(contentHash('hello world'));
    });
  });

  describe('distinctness — must differ', () => {
    it('differs for different content', () => {
      expect(contentHash('Hello world')).not.toBe(contentHash('Hello world!'));
    });

    it('differs for content with an extra word', () => {
      expect(contentHash('Microsoft ships AI runtime')).not.toBe(
        contentHash('Microsoft ships new AI runtime'),
      );
    });

    it('differs for content with internal whitespace changes', () => {
      // Internal whitespace IS significant — only leading/trailing is stripped.
      expect(contentHash('hello world')).not.toBe(contentHash('helloworld'));
    });
  });
});
