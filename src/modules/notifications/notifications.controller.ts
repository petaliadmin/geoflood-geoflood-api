import {
  Controller,
  Post,
  Delete,
  Body,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('Notifications')
@Controller('v1/notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('register-token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Register FCM token for push notifications' })
  async registerToken(
    @CurrentUser() user: any,
    @Body() body: { fcmToken: string; platform: 'android' | 'ios' },
  ) {
    return this.notificationsService.registerToken({
      userId: user.id,
      fcmToken: body.fcmToken,
      platform: body.platform,
    });
  }

  @Delete('unregister-token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Unregister FCM token' })
  async unregisterToken(
    @CurrentUser() user: any,
    @Body() body: { fcmToken: string },
  ) {
    return this.notificationsService.unregisterToken(user.id, body.fcmToken);
  }
}
