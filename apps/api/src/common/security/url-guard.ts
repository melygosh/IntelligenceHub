import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';

/** Thrown when a URL is rejected by the SSRF guard. */
export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedUrlError';
  }
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    n = (n << 8) | octet;
  }
  return n >>> 0;
}

function inV4Range(n: number, base: string, bits: number): boolean {
  const b = ipv4ToInt(base);
  if (b === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (n & mask) === (b & mask);
}

function isDisallowedV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable → treat as unsafe
  return (
    inV4Range(n, '0.0.0.0', 8) || // "this" network
    inV4Range(n, '10.0.0.0', 8) || // private
    inV4Range(n, '100.64.0.0', 10) || // CGNAT
    inV4Range(n, '127.0.0.0', 8) || // loopback
    inV4Range(n, '169.254.0.0', 16) || // link-local (incl. 169.254.169.254 metadata)
    inV4Range(n, '172.16.0.0', 12) || // private
    inV4Range(n, '192.0.0.0', 24) || // IETF protocol assignments
    inV4Range(n, '192.0.2.0', 24) || // TEST-NET-1
    inV4Range(n, '192.168.0.0', 16) || // private
    inV4Range(n, '198.18.0.0', 15) || // benchmarking
    inV4Range(n, '198.51.100.0', 24) || // TEST-NET-2
    inV4Range(n, '203.0.113.0', 24) || // TEST-NET-3
    inV4Range(n, '224.0.0.0', 4) || // multicast
    inV4Range(n, '240.0.0.0', 4) // reserved + broadcast
  );
}

// Pull an embedded IPv4 out of a mapped/compatible IPv6 address, in either the
// dotted form (::ffff:1.2.3.4) or the hex form Node normalises to (::ffff:7f00:1).
function embeddedV4(a: string): string | null {
  const dotted = a.match(/^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) return dotted[1];
  const hex = a.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
  }
  return null;
}

function isDisallowedV6(ip: string): boolean {
  const a = ip.toLowerCase().split('%')[0]; // strip zone id
  if (a === '::1' || a === '::') return true; // loopback / unspecified
  const v4 = embeddedV4(a); // IPv4-mapped/compatible → check the embedded v4
  if (v4) return isDisallowedV4(v4);
  if (/^f[cd][0-9a-f]{2}:/.test(a)) return true; // unique-local fc00::/7
  if (/^fe[89ab][0-9a-f]:/.test(a)) return true; // link-local fe80::/10
  if (/^ff[0-9a-f]{2}:/.test(a)) return true; // multicast ff00::/8
  return false;
}

function isDisallowedAddress(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return isDisallowedV4(ip);
  if (fam === 6) return isDisallowedV6(ip);
  return true; // not a valid IP literal → unsafe
}

/**
 * SSRF guard. Ensures `rawUrl` is http(s) and every address its host resolves
 * to is publicly routable — blocking loopback/private/link-local/CGNAT/
 * multicast/reserved ranges (including the 169.254.169.254 cloud-metadata
 * endpoint). Throws {@link BlockedUrlError} otherwise.
 *
 * Note: a determined attacker controlling DNS could still rebind between this
 * check and the socket connect (a TOCTOU window). Re-checking on every redirect
 * hop (see fetchTextSafely) shrinks the exposure to the direct-connect case.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError('Malformed URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new BlockedUrlError(`Unsupported protocol: ${u.protocol}`);
  }
  const host = u.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  if (isIP(host)) {
    if (isDisallowedAddress(host)) {
      throw new BlockedUrlError('URL points to a private or reserved address');
    }
    return;
  }

  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new BlockedUrlError('Host could not be resolved');
  }
  if (addrs.length === 0) throw new BlockedUrlError('Host did not resolve');
  for (const { address } of addrs) {
    if (isDisallowedAddress(address)) {
      throw new BlockedUrlError('URL resolves to a private or reserved address');
    }
  }
}
