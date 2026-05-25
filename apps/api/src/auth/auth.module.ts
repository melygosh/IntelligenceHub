import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { loadEnv } from '../common/config/env';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const env = loadEnv();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return {
          secret: env.JWT_SECRET,
          // JWT_EXPIRES_IN is validated at startup (Zod env schema); cast needed because
          // jsonwebtoken expects StringValue (branded string) but env yields plain string.
          signOptions: { expiresIn: env.JWT_EXPIRES_IN as any },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
