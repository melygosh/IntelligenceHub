import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  LoginRequest,
  RegisterRequest,
  type AuthResponse,
  type UserResponse,
} from '@intelligencehub/shared';
import { AuthService } from './auth.service';
import { AUTH_COOKIE_NAME } from './types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, type AuthUserContext } from '../common/decorators/current-user.decorator';
import { loadEnv } from '../common/config/env';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(RegisterRequest))
  async register(
    @Body() body: typeof RegisterRequest._type,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { user, token } = await this.auth.register(body.email, body.password);
    this.setAuthCookie(res, token);
    return { user };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(LoginRequest))
  async login(
    @Body() body: typeof LoginRequest._type,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { user, token } = await this.auth.login(body.email, body.password);
    this.setAuthCookie(res, token);
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(AUTH_COOKIE_NAME, this.cookieBaseOptions());
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthUserContext): Promise<UserResponse> {
    return this.auth.getUser(user.userId);
  }

  private setAuthCookie(res: Response, token: string): void {
    res.cookie(AUTH_COOKIE_NAME, token, {
      ...this.cookieBaseOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7d, matches default JWT_EXPIRES_IN
    });
  }

  private cookieBaseOptions(): {
    httpOnly: true;
    sameSite: 'lax';
    secure: boolean;
    path: '/';
  } {
    const env = loadEnv();
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: !env.APP_DEV_MODE,
      path: '/',
    };
  }
}
