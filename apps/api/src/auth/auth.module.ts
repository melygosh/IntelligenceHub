import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { QUEUE_NAMES } from '@intelligencehub/shared';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { ConfirmationTokenStore } from './confirmation-token.store';
import { loadEnv } from '../common/config/env';
import { AxesModule } from '../axes/axes.module';

@Module({
  imports: [
    AxesModule,
    PassportModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.DEMO_SEED }),
    JwtModule.registerAsync({
      useFactory: () => {
        const env = loadEnv();
        return {
          secret: env.JWT_SECRET,
          // JWT_EXPIRES_IN is validated at startup (Zod env schema); cast needed because
          // jsonwebtoken expects StringValue (branded string) but env yields plain string.
          signOptions: {
            expiresIn: env.JWT_EXPIRES_IN as JwtSignOptions['expiresIn'],
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, ConfirmationTokenStore],
})
export class AuthModule {}
