import { Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: (req: Request) => {
        const auth = req.headers.authorization;
        if (auth && auth.startsWith('Bearer ')) {
          return auth.slice(7);
        }
        return null;
      },
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  async validate(payload: { id: string; email: string; role: string }) {
    if (!payload.id) {
      throw new UnauthorizedException();
    }

    const user = await this.authService.validateUser(payload.id);
    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }
}
