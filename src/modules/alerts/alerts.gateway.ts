import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AlertsService } from './alerts.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AlertCreatedEvent } from './alerts.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
  userCity?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'exp://localhost:19000'],
    credentials: true,
  },
  namespace: '/ws/alerts',
})
@Injectable()
export class AlertsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AlertsGateway.name);
  private userSockets: Map<string, string[]> = new Map();

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private alertService: AlertsService,
    private eventEmitter: EventEmitter2,
  ) {}

  afterInit(_server: Server) {
    this.logger.log('WebSocket alerts gateway initialized');

    this.eventEmitter.on('alert.created', async (event: AlertCreatedEvent) => {
      await this.handleAlertCreated(event);
    });
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        throw new UnauthorizedException('No token provided');
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET'),
      });

      client.userId = payload.id;
      client.userRole = payload.role;

      this.logger.log(`Client connected: ${client.id} (user: ${client.userId})`);

      this.trackUserSocket(client.userId, client.id);

      const unreadCount = await this.alertService.getUnreadCount(client.userId);
      client.emit('unread-count', { count: unreadCount });
    } catch (error) {
      this.logger.error(`WebSocket connection error: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    if (client.userId) {
      this.untrackUserSocket(client.userId, client.id);
    }
  }

  private trackUserSocket(userId: string, socketId: string) {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, []);
    }
    this.userSockets.get(userId).push(socketId);
  }

  private untrackUserSocket(userId: string, socketId: string) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      const index = sockets.indexOf(socketId);
      if (index > -1) {
        sockets.splice(index, 1);
      }
      if (sockets.length === 0) {
        this.userSockets.delete(userId);
      }
    }
  }

  @SubscribeMessage('subscribe-city')
  async handleSubscribeCity(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { city: string },
  ) {
    if (!client.userId) {
      throw new WsException('Unauthorized');
    }

    const room = `alerts-${data.city}`;
    client.join(room);
    client.userCity = data.city;

    this.logger.log(`User ${client.userId} subscribed to ${room}`);
    return { success: true, room };
  }

  @SubscribeMessage('subscribe-zone')
  async handleSubscribeZone(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { zoneId: string },
  ) {
    if (!client.userId) {
      throw new WsException('Unauthorized');
    }

    const room = `zone-${data.zoneId}`;
    client.join(room);

    this.logger.log(`User ${client.userId} subscribed to ${room}`);
    return { success: true, room };
  }

  @SubscribeMessage('get-unread-count')
  async handleGetUnreadCount(@ConnectedSocket() client: AuthenticatedSocket) {
    if (!client.userId) {
      throw new WsException('Unauthorized');
    }

    const count = await this.alertService.getUnreadCount(client.userId);
    return { count };
  }

  @SubscribeMessage('mark-alert-read')
  async handleMarkAlertRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { alertId: string },
  ) {
    if (!client.userId) {
      throw new WsException('Unauthorized');
    }

    await this.alertService.markAsRead(client.userId, data.alertId);
    return { success: true };
  }

  @SubscribeMessage('mark-all-read')
  async handleMarkAllRead(@ConnectedSocket() client: AuthenticatedSocket) {
    if (!client.userId) {
      throw new WsException('Unauthorized');
    }

    await this.alertService.markAllAsRead(client.userId);
    return { success: true };
  }

  private async handleAlertCreated(event: AlertCreatedEvent) {
    const alert = event.alert;

    if (event.targetCity) {
      this.broadcastAlertToCity(event.targetCity, alert);
    }

    if (event.targetZoneId) {
      this.broadcastAlertToZone(event.targetZoneId, alert);
    }

    if (!event.targetCity && !event.targetZoneId) {
      this.server.emit('new-alert', { ...alert, global: true });
      this.logger.log('Global alert broadcasted');
    }
  }

  async broadcastAlertToCity(city: string, alert: any) {
    const room = `alerts-${city}`;
    const alertWithRead = {
      ...alert,
      read: false,
    };
    this.server.to(room).emit('newAlert', { type: 'newAlert', alert: alertWithRead });
    this.logger.log(`Alert broadcasted to ${room}`);
  }

  async broadcastAlertToZone(zoneId: string, alert: any) {
    const room = `zone-${zoneId}`;
    this.server.to(room).emit('newAlert', { type: 'newAlert', alert });
    this.logger.log(`Alert broadcasted to ${room}`);
  }

  async broadcastGlobalAlert(alert: any) {
    this.server.emit('newAlert', { type: 'newAlert', alert: { ...alert, global: true } });
    this.logger.log('Global alert broadcasted');
  }

  async sendAlertToUser(userId: string, alert: any) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.forEach(socketId => {
        this.server.to(socketId).emit('newAlert', { type: 'newAlert', alert });
      });
    }
    this.logger.log(`Alert sent to user ${userId}`);
  }

  async broadcastRiskUpdate(zone: any) {
    this.server.emit('riskUpdate', { type: 'riskUpdate', zone });
    this.logger.log(`Risk update broadcasted for zone ${zone.id}`);
  }

  async broadcastWeatherUpdate(weather: any) {
    this.server.emit('weatherUpdate', { type: 'weatherUpdate', weather });
    this.logger.log('Weather update broadcasted');
  }

  async sendNotification(userId: string, notification: any) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.forEach(socketId => {
        this.server.to(socketId).emit('notification', notification);
      });
    }
  }
}
