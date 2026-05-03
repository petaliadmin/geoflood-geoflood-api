import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../notifications/notifications.service';
import { AlertPendingEvent, AlertValidatedEvent } from './alerts.service';

/**
 * Listens for alert lifecycle events and dispatches FCM notifications.
 *
 * - alert.validated -> push to users in target city (or zone fallback)
 * - alert.pending   -> push to admins so they can review
 */
@Injectable()
export class AlertsNotificationListener {
  private readonly logger = new Logger(AlertsNotificationListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent('alert.validated')
  async onAlertValidated(event: AlertValidatedEvent) {
    const alert = event.alert;
    const payload = {
      title: `[${alert.level.toUpperCase()}] ${alert.title}`,
      body: alert.message,
      data: {
        alertId: alert.id,
        category: alert.category,
        level: alert.level,
        targetZoneId: event.targetZoneId || '',
      },
    };

    if (event.targetZoneId) {
      const result = await this.notifications.sendToZone(
        event.targetZoneId,
        payload,
        event.targetCity,
      );
      this.logger.log(
        `FCM zone push (zone=${event.targetZoneId}): attempted=${result.attempted} delivered=${result.delivered} failed=${result.failed} skipped=${result.skipped}`,
      );
      return;
    }

    if (event.targetCity) {
      const result = await this.notifications.sendToCity(event.targetCity, payload);
      this.logger.log(
        `FCM city push (city=${event.targetCity}): attempted=${result.attempted} delivered=${result.delivered} failed=${result.failed} skipped=${result.skipped}`,
      );
    }
  }

  @OnEvent('alert.pending')
  async onAlertPending(event: AlertPendingEvent) {
    const alert = event.alert;
    const result = await this.notifications.sendToRole('admin', {
      title: 'Nouvelle alerte à valider',
      body: `${alert.title} — ${alert.area}`,
      data: {
        alertId: alert.id,
        category: alert.category,
        level: alert.level,
        kind: 'pending_review',
      },
    });
    this.logger.log(
      `FCM admin review push: attempted=${result.attempted} delivered=${result.delivered} failed=${result.failed} skipped=${result.skipped}`,
    );
  }
}
