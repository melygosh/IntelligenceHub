import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { loadEnv } from '../common/config/env';
import type { JwtPayload } from './types';
import type { UserResponse } from '@intelligencehub/shared';
import { ConfirmationTokenStore } from './confirmation-token.store';
import {
  buildConfirmationUrl,
  generateRawToken,
} from './confirmation-token.utils';

const RESEND_COOLDOWN_MS = 60_000;

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly jwt: JwtService,
    private readonly tokens: ConfirmationTokenStore,
  ) {}

  async register(
    email: string,
    password: string,
  ): Promise<{
    user: UserResponse;
    token: string;
    devModeConfirmLink?: string;
  }> {
    const normalizedEmail = email.toLowerCase();
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    if (existing.length > 0) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await argon2.hash(password);
    const [created] = await this.db
      .insert(users)
      .values({ email: normalizedEmail, passwordHash })
      .returning({
        id: users.id,
        email: users.email,
        emailConfirmed: users.emailConfirmed,
        createdAt: users.createdAt,
      });
    const token = this.signToken({ sub: created.id, email: created.email });
    const devModeConfirmLink = await this.issueConfirmationLink(created.id);
    return {
      user: {
        id: created.id,
        email: created.email,
        emailConfirmed: created.emailConfirmed,
        createdAt: created.createdAt.toISOString(),
      },
      token,
      devModeConfirmLink,
    };
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ user: UserResponse; token: string }> {
    const normalizedEmail = email.toLowerCase();
    const [found] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    if (!found) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await argon2.verify(found.passwordHash, password);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const token = this.signToken({ sub: found.id, email: found.email });
    return {
      user: {
        id: found.id,
        email: found.email,
        emailConfirmed: found.emailConfirmed,
        createdAt: found.createdAt.toISOString(),
      },
      token,
    };
  }

  async getUser(userId: string): Promise<UserResponse> {
    const [found] = await this.db
      .select({
        id: users.id,
        email: users.email,
        emailConfirmed: users.emailConfirmed,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!found) {
      throw new UnauthorizedException('User no longer exists');
    }
    return {
      id: found.id,
      email: found.email,
      emailConfirmed: found.emailConfirmed,
      createdAt: found.createdAt.toISOString(),
    };
  }

  /**
   * Confirm an email via a raw token. Three paths:
   *   - active token  → mark used, flip users.email_confirmed, return user
   *   - already-used token, owning user is already confirmed → 200 idempotent
   *   - otherwise (no row, expired, used but user not confirmed) → 400 invalid_token
   */
  async confirmEmail(rawToken: string): Promise<UserResponse> {
    const active = await this.tokens.findActive(rawToken);
    if (active) {
      await this.tokens.markUsed(active.tokenRowId);
      await this.db
        .update(users)
        .set({ emailConfirmed: true })
        .where(eq(users.id, active.userId));
      return this.getUser(active.userId);
    }
    const ownerId = await this.tokens.findOwnerOfAnyToken(rawToken);
    if (ownerId) {
      const owner = await this.getUser(ownerId);
      if (owner.emailConfirmed) return owner;
    }
    throw new BadRequestException({ error: 'invalid_token' });
  }

  /**
   * Resend a confirmation link. No-op if the user is already confirmed.
   * 60-second cooldown enforced via the most-recent-active token's created_at.
   */
  async resendConfirmation(
    userId: string,
  ): Promise<{ devModeConfirmLink?: string }> {
    const user = await this.getUser(userId);
    if (user.emailConfirmed) return {};

    const lastCreatedAt = await this.tokens.mostRecentActiveCreatedAt(userId);
    if (lastCreatedAt) {
      const elapsed = Date.now() - lastCreatedAt.getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil(
          (RESEND_COOLDOWN_MS - elapsed) / 1000,
        );
        throw new HttpException(
          { error: 'cooldown', retryAfterSeconds },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    await this.tokens.invalidateAllActiveFor(userId);
    const devModeConfirmLink = await this.issueConfirmationLink(userId);
    return { devModeConfirmLink };
  }

  private async issueConfirmationLink(
    userId: string,
  ): Promise<string | undefined> {
    const env = loadEnv();
    const rawToken = generateRawToken();
    await this.tokens.insertNew(userId, rawToken);
    const link = buildConfirmationUrl(env.WEB_BASE_URL, rawToken);
    this.log.log(
      JSON.stringify({ event: 'auth.confirmation_link', userId, link }),
    );
    return env.APP_DEV_MODE ? link : undefined;
  }

  private signToken(payload: JwtPayload): string {
    return this.jwt.sign(payload);
  }
}
