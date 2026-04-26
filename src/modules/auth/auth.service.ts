import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserEntity } from '../users/entities/user.entity';
import { RegisterDto, LoginDto } from '@/common/dtos';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private usersRepository: Repository<UserEntity>,
    private jwtService: JwtService,
  ) {}

  // Register new user
  async register(registerDto: RegisterDto) {
    const { email, phone, password, fullName } = registerDto;

    // Check if user exists
    const existingUser = await this.usersRepository.findOne({
      where: [{ email }, { phone }],
    });

    if (existingUser) {
      throw new BadRequestException('Email or phone already registered');
    }

    // Hash password
    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const user = this.usersRepository.create({
      email,
      phone,
      fullName,
      passwordHash,
      role: 'citizen',
    });

    const savedUser = await this.usersRepository.save(user);

    return this.generateTokens(savedUser);
  }

  // Login with email and password
  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.usersRepository.findOne({
      where: { email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(user);
  }

  // Validate user by ID (used by JWT strategy)
  async validateUser(id: string) {
    const user = await this.usersRepository.findOne({
      where: { id },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  // Validate Google OAuth user
  async validateGoogleUser(data: { googleId: string; email: string; fullName: string; avatarUrl?: string }) {
    // Check if user exists by email
    let user = await this.usersRepository.findOne({
      where: { email: data.email },
    });

    if (!user) {
      // Create new user
      user = this.usersRepository.create({
        email: data.email,
        fullName: data.fullName,
        phone: '',  // Google OAuth users may not have phone initially
        passwordHash: null,  // OAuth users don't have password
        avatarUrl: data.avatarUrl,
        role: 'citizen',
      });
      user = await this.usersRepository.save(user);
    } else {
      // Update avatar if provided
      if (data.avatarUrl && !user.avatarUrl) {
        user.avatarUrl = data.avatarUrl;
        await this.usersRepository.save(user);
      }
    }

    return user;
  }

  // Generate JWT tokens
  async generateTokens(user: UserEntity) {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '7d',
    });

    return {
      user: this.formatUserResponse(user),
      accessToken,
      refreshToken,
    };
  }

  // Refresh access token
  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken);
      const user = await this.validateUser(payload.id);
      return this.generateTokens(user);
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  // Send OTP (for phone verification)
  async sendOtp(phone: string) {
    const user = await this.usersRepository.findOne({
      where: { phone },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Generate 6-digit OTP
    const otp = Math.random().toString().slice(2, 8);
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await this.usersRepository.update(
      { id: user.id },
      {
        otpCode: otp,
        otpExpiresAt,
      },
    );

    // TODO: Send OTP via SMS (Twilio, AWS SNS, etc.)
    console.log(`[DEV] OTP for ${phone}: ${otp}`);

    return { message: 'OTP sent successfully' };
  }

  // Verify OTP
  async verifyOtp(phone: string, code: string) {
    const user = await this.usersRepository.findOne({
      where: { phone },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.otpCode !== code) {
      throw new BadRequestException('Invalid OTP');
    }

    if (new Date() > user.otpExpiresAt) {
      throw new BadRequestException('OTP expired');
    }

    // Clear OTP
    await this.usersRepository.update(
      { id: user.id },
      {
        otpCode: null,
        otpExpiresAt: null,
      },
    );

    return this.generateTokens(user);
  }

  // Forgot password
  async forgotPassword(email: string) {
    const user = await this.usersRepository.findOne({
      where: { email },
    });

    if (!user) {
      // Don't reveal if email exists (security best practice)
      return { message: 'If email exists, password reset link will be sent' };
    }

    // Generate reset token
    const resetToken = this.jwtService.sign(
      { id: user.id, email: user.email },
      { expiresIn: '1h' },
    );

    const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.usersRepository.update(
      { id: user.id },
      {
        resetToken,
        resetTokenExpiresAt,
      },
    );

    // TODO: Send password reset email with link containing resetToken
    console.log(`[DEV] Reset token for ${email}: ${resetToken}`);

    return { message: 'Password reset link sent to email' };
  }

  // Reset password
  async resetPassword(resetToken: string, newPassword: string) {
    try {
      const payload = this.jwtService.verify(resetToken);
      const user = await this.usersRepository.findOne({
        where: { id: payload.id },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      if (user.resetToken !== resetToken) {
        throw new UnauthorizedException('Invalid reset token');
      }

      if (new Date() > user.resetTokenExpiresAt) {
        throw new UnauthorizedException('Reset token expired');
      }

      // Hash new password
      const salt = await bcrypt.genSalt();
      const passwordHash = await bcrypt.hash(newPassword, salt);

      // Update password and clear reset token
      await this.usersRepository.update(
        { id: user.id },
        {
          passwordHash,
          resetToken: null,
          resetTokenExpiresAt: null,
        },
      );

      return { message: 'Password reset successfully' };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
  }

  private formatUserResponse(user: UserEntity) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatarUrl: user.avatarUrl,
      city: user.city,
      locale: user.locale,
      pushAlertsEnabled: user.pushAlertsEnabled,
      locationAlertsEnabled: user.locationAlertsEnabled,
      themeMode: user.themeMode,
      createdAt: user.createdAt,
    };
  }
}
