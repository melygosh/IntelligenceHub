import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB } from '../../db/db.module';
import type { Db } from '../../db/client';
import { users } from '../../db/schema';
import type { AuthUserContext } from '../decorators/current-user.decorator';

/**
 * Runs after JwtAuthGuard (which attaches req.user). Fetches the user's
 * email_confirmed flag from DB and 403s with {error: 'email_unconfirmed'}
 * when false. Frontend's api wrapper watches for this body and routes the
 * user to /auth/check-email.
 */
@Injectable()
export class RequireConfirmedEmailGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Db) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUserContext }>();
    const userId = req.user?.userId;
    if (!userId) {
      // JwtAuthGuard should have already 401'd; defensive.
      throw new ForbiddenException({ error: 'email_unconfirmed' });
    }
    const [row] = await this.db
      .select({ emailConfirmed: users.emailConfirmed })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row?.emailConfirmed) {
      throw new ForbiddenException({ error: 'email_unconfirmed' });
    }
    return true;
  }
}
