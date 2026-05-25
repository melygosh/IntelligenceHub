import { createHash } from 'node:crypto';

/**
 * Stable sha256 of normalised text content. Used to detect republished articles
 * at different URLs (same content, different UTM tags, different mirrors).
 *
 * Lives in apps/api (not packages/shared) because node:crypto is server-only —
 * Vite refuses to bundle it for the browser, which broke the web build when it
 * was re-exported from the shared package barrel.
 */
export function contentHash(text: string): string {
  return createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
}
