import { createHash } from 'node:crypto';

/**
 * Stable sha256 of normalised text content. Used to detect republished articles
 * at different URLs (same content, different UTM tags, different mirrors).
 *
 * Server-only (uses node:crypto). Frontend code must NOT import this — Vite would
 * fail to bundle node:crypto for the browser. Tree-shaking handles it as long as
 * the web bundle never references contentHash.
 */
export function contentHash(text: string): string {
  return createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
}
