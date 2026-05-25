import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { loadEnv } from '../common/config/env';
import { AUTH_COOKIE_NAME, type JwtPayload } from './types';
import type { AuthUserContext } from '../common/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const env = loadEnv();
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
          return cookies[AUTH_COOKIE_NAME] ?? null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: env.JWT_SECRET,
    });
  }

  validate(payload: JwtPayload): AuthUserContext {
    return { userId: payload.sub, email: payload.email };
  }
}
