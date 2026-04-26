import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('Users')
@Controller('v1/users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser() user: any) {
    return this.usersService.findById(user.id);
  }

  @Patch('me')
  @HttpCode(200)
  @ApiOperation({ summary: 'Update user profile' })
  async updateProfile(
    @CurrentUser() user: any,
    @Body() updateData: Partial<any>,
  ) {
    return this.usersService.update(user.id, updateData);
  }

  @Patch('me/settings')
  @HttpCode(200)
  @ApiOperation({ summary: 'Update user settings' })
  async updateSettings(
    @CurrentUser() user: any,
    @Body()
    settings: {
      locale?: string;
      themeMode?: string;
      pushAlertsEnabled?: boolean;
      locationAlertsEnabled?: boolean;
    },
  ) {
    return this.usersService.update(user.id, settings);
  }

  @Delete('me')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete user account' })
  async deleteAccount(@CurrentUser() user: any) {
    return this.usersService.delete(user.id);
  }
}
