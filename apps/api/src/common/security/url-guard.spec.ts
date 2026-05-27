import { promises as dns, type LookupAddress } from 'node:dns';
import { assertPublicHttpUrl, BlockedUrlError } from './url-guard';

const mockLookup = (addrs: LookupAddress[]) =>
  (jest.spyOn(dns, 'lookup') as unknown as jest.Mock).mockResolvedValue(addrs);
const mockLookupFails = () =>
  (jest.spyOn(dns, 'lookup') as unknown as jest.Mock).mockRejectedValue(new Error('ENOTFOUND'));

afterEach(() => jest.restoreAllMocks());

describe('assertPublicHttpUrl', () => {
  it('rejects non-http(s) protocols', async () => {
    for (const u of ['file:///etc/passwd', 'ftp://host/x', 'gopher://host/', 'data:text/plain,hi']) {
      await expect(assertPublicHttpUrl(u)).rejects.toBeInstanceOf(BlockedUrlError);
    }
  });

  it('rejects malformed URLs', async () => {
    await expect(assertPublicHttpUrl('not a url')).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(assertPublicHttpUrl('')).rejects.toBeInstanceOf(BlockedUrlError);
  });

  // IP literals are checked directly (no DNS).
  it.each([
    'http://127.0.0.1/', // loopback
    'http://127.1.2.3/', // loopback /8
    'http://10.0.0.1/', // private
    'http://172.16.5.4/', // private
    'http://172.31.255.255/', // private (upper bound /12)
    'http://192.168.1.1/', // private
    'http://169.254.169.254/latest/meta-data/', // link-local cloud metadata
    'http://100.64.0.1/', // CGNAT
    'http://0.0.0.0/', // "this" network
    'https://255.255.255.255/', // broadcast / reserved
    'http://224.0.0.1/', // multicast
    'http://[::1]/', // IPv6 loopback
    'http://[fe80::1]/', // IPv6 link-local
    'http://[fc00::1]/', // IPv6 unique-local
    'http://[::ffff:127.0.0.1]/', // IPv4-mapped loopback
  ])('blocks private/reserved IP literal %s', async (url) => {
    await expect(assertPublicHttpUrl(url)).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it.each([
    'http://1.1.1.1/',
    'https://8.8.8.8/',
    'http://172.32.0.1/', // just outside the 172.16/12 private block
    'https://[2606:4700:4700::1111]/', // public IPv6
  ])('allows public IP literal %s', async (url) => {
    await expect(assertPublicHttpUrl(url)).resolves.toBeUndefined();
  });

  describe('hostname resolution', () => {
    it('blocks a host that resolves to a private address', async () => {
      mockLookup([{ address: '10.1.2.3', family: 4 }]);
      await expect(assertPublicHttpUrl('http://evil.example/feed')).rejects.toBeInstanceOf(
        BlockedUrlError,
      );
    });

    it('blocks if ANY resolved address is private (split-horizon / rebinding)', async () => {
      mockLookup([
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ]);
      await expect(assertPublicHttpUrl('http://mixed.example/')).rejects.toBeInstanceOf(
        BlockedUrlError,
      );
    });

    it('allows a host that resolves only to public addresses', async () => {
      mockLookup([{ address: '93.184.216.34', family: 4 }]);
      await expect(assertPublicHttpUrl('https://good.example/rss')).resolves.toBeUndefined();
    });

    it('blocks when resolution fails or is empty', async () => {
      mockLookupFails();
      await expect(assertPublicHttpUrl('http://nope.example/')).rejects.toBeInstanceOf(
        BlockedUrlError,
      );
      mockLookup([]);
      await expect(assertPublicHttpUrl('http://empty.example/')).rejects.toBeInstanceOf(
        BlockedUrlError,
      );
    });
  });
});
