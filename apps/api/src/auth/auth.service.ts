import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import type { JwtPayload } from './types';
import type { UserResponse } from '@intelligencehub/shared';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, password: string): Promise<{ user: UserResponse; token: string }> {
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
        createdAt: users.createdAt,
      });
    const token = this.signToken({ sub: created.id, email: created.email });
    return {
      user: {
        id: created.id,
        email: created.email,
        createdAt: created.createdAt.toISOString(),
      },
      token,
    };
  }

  async login(email: string, password: string): Promise<{ user: UserResponse; token: string }> {
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
      createdAt: found.createdAt.toISOString(),
    };
  }

  private signToken(payload: JwtPayload): string {
    return this.jwt.sign(payload);
  }
}
