import { Module } from '@nestjs/common';

import { AccessModule } from '@/modules/access/access.module';

import { AuthCoreModule } from './auth-core.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LockoutService } from './lockout.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import { UserPasswordController } from './user-password.controller';

/**
 * Autenticación local (PLAN-AUTH-LOCAL). Con AUTH_PROVIDER=entra sus endpoints
 * responden 404 (LocalAuthEnabledGuard) y no se crean credenciales locales.
 */
@Module({
  imports: [AuthCoreModule, AccessModule],
  controllers: [AuthController, UserPasswordController],
  providers: [AuthService, TokenService, SessionService, LockoutService],
})
export class AuthModule {}
