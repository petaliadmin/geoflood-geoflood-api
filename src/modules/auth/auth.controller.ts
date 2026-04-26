import {
  Controller,
  Post,
  Body,
  HttpCode,
  UseGuards,
  Req,
  Get,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from '@/common/dtos';
import { UserEntity } from '../users/entities/user.entity';
import { Request } from 'express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { AuthUser } from '@/common/dtos';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('Auth')
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(201)
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: 'Register new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed' })
  async refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refreshToken(body.refreshToken);
  }

  @Post('send-otp')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: 'Send OTP to phone' })
  @ApiResponse({ status: 200, description: 'OTP sent' })
  async sendOtp(@Body() body: { phone: string }) {
    return this.authService.sendOtp(body.phone);
  }

  @Post('verify-otp')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: 'Verify OTP code' })
  @ApiResponse({ status: 200, description: 'OTP verified' })
  async verifyOtp(@Body() body: { phone: string; code: string }) {
    return this.authService.verifyOtp(body.phone, body.code);
  }

  @Post('forgot-password')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: 'Request password reset' })
  @ApiResponse({ status: 200, description: 'Reset email sent' })
  async forgotPassword(@Body() body: { email: string }) {
    return this.authService.forgotPassword(body.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  async resetPassword(@Body() body: { resetToken: string; newPassword: string }) {
    return this.authService.resetPassword(body.resetToken, body.newPassword);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@CurrentUser() user: AuthUser) {
    // In stateless JWT, logout is handled client-side (token deletion)
    return { message: 'Logged out successfully', userId: user.id };
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  async googleAuth() {
    // The AuthGuard redirects to Google consent screen automatically
    return;
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleAuthCallback(@Req() req: Request & { user?: UserEntity }) {
    // After successful OAuth, passport sets req.user
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Google authentication failed');
    }
    return this.authService.generateTokens(user);
  }
}
