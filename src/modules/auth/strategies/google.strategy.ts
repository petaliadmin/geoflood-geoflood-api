import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get('GOOGLE_CLIENT_ID'),
      clientSecret: configService.get('GOOGLE_CLIENT_SECRET'),
      callbackURL: '/auth/google/callback',
      scope: ['email', 'profile'],
      session: false,
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ) {
    try {
      const { id, emails, name, photos } = profile;

      const user = await this.authService.validateGoogleUser({
        googleId: id,
        email: emails[0].value,
        fullName: name.givenName + ' ' + name.familyName,
        avatarUrl: photos?.[0]?.value,
      });

      done(null, user);
    } catch (error) {
      done(error, null);
    }
  }
}
