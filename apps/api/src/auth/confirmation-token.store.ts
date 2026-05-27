import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { emailConfirmationToken } from '../db/schema';
import { hashToken, TOKEN_EXPIRY_MS } from './confirmation-token.utils';

export type ActiveTokenLookup = { userId: string; tokenRowId: string };

/**
 * Thin DB layer over email_confirmation_token. All token raw values are hashed
 * before they touch the DB.
 */
@Injectable()
export class ConfirmationTokenStore {
  constructor(@Inject(DB) private readonly db: Db) {}

  async insertNew(userId: string, rawToken: string): Promise<void> {
    await this.db.insert(emailConfirmationToken).values({
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + TOKEN_EXPIRY_MS),
    });
  }

  /**
   * Look up an active (unused, unexpired) token by its raw value.
   * Returns the row id (for marking used) + user_id, or null on miss.
   */
  async findActive(rawToken: string): Promise<ActiveTokenLookup | null> {
    const hash = hashToken(rawToken);
    const [row] = await this.db
      .select({
        id: emailConfirmationToken.id,
        userId: emailConfirmationToken.userId,
        expiresAt: emailConfirmationToken.expiresAt,
      })
      .from(emailConfirmationToken)
      .where(
        and(
          eq(emailConfirmationToken.tokenHash, hash),
          isNull(emailConfirmationToken.usedAt),
        ),
      )
      .limit(1);
    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;
    return { userId: row.userId, tokenRowId: row.id };
  }

  /**
   * Used by the idempotency check in confirmEmail: if the user clicks an
   * already-used token AND their email is already confirmed, we return 200
   * instead of 400. This helper finds the owning user of any token-hash row
   * (active or used) so the caller can do the confirmed check.
   */
  async findOwnerOfAnyToken(rawToken: string): Promise<string | null> {
    const hash = hashToken(rawToken);
    const [row] = await this.db
      .select({ userId: emailConfirmationToken.userId })
      .from(emailConfirmationToken)
      .where(eq(emailConfirmationToken.tokenHash, hash))
      .limit(1);
    return row?.userId ?? null;
  }

  async markUsed(tokenRowId: string): Promise<void> {
    await this.db
      .update(emailConfirmationToken)
      .set({ usedAt: new Date() })
      .where(eq(emailConfirmationToken.id, tokenRowId));
  }

  /**
   * Mark all active (unused) tokens for a user as used. Called on resend so
   * the previously-issued link stops working when a new one is created.
   */
  async invalidateAllActiveFor(userId: string): Promise<void> {
    await this.db
      .update(emailConfirmationToken)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(emailConfirmationToken.userId, userId),
          isNull(emailConfirmationToken.usedAt),
        ),
      );
  }

  /**
   * Returns the created_at of the most-recent active token for this user, or
   * null if none. Used for the 60s resend cooldown check.
   */
  async mostRecentActiveCreatedAt(userId: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ createdAt: emailConfirmationToken.createdAt })
      .from(emailConfirmationToken)
      .where(
        and(
          eq(emailConfirmationToken.userId, userId),
          isNull(emailConfirmationToken.usedAt),
        ),
      )
      .orderBy(desc(emailConfirmationToken.createdAt))
      .limit(1);
    return row?.createdAt ?? null;
  }
}
