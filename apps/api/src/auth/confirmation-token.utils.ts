import { createHash, randomBytes } from 'node:crypto';

/**
 * Pure utilities for the email-confirmation token lifecycle.
 *
 * - generateRawToken: 32 random bytes → URL-safe base64. The raw value leaves
 *   the server exactly once (in the registration / resend response + the
 *   structured log). Never stored.
 * - hashToken: sha256 of the raw token, hex-encoded. Stored in
 *   email_confirmation_token.token_hash. Lookup compares hashes.
 * - buildConfirmationUrl: ${WEB_BASE_URL}/auth/confirm?token=<token>. The
 *   confirm route is a frontend route; the api never serves it, only POSTs
 *   come back from the page.
 */

export const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h

export function generateRawToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function buildConfirmationUrl(
  webBaseUrl: string,
  rawToken: string,
): string {
  const base = webBaseUrl.replace(/\/+$/, '');
  return `${base}/auth/confirm?token=${encodeURIComponent(rawToken)}`;
}
