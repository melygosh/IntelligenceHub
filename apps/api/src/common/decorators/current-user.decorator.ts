import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export type AuthUserContext = {
  userId: string;
  email: string;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUserContext => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthUserContext }>();
    return req.user;
  },
);
