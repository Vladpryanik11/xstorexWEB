import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';
import { PrismaService } from '../infra/prisma.service.js';
import { MailService } from '../mail/mail.service.js';

/** Tells the owner (`ADMIN_NOTIFY_EMAIL`) that a newly bound device waits for supplier files. */
@Injectable()
export class DeviceWaitingNotifier {
  private readonly logger = new Logger(DeviceWaitingNotifier.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Never throws: the bind is already done. */
  async deviceBound(deviceId: string): Promise<void> {
    const to = this.config.signing.adminNotifyEmail;
    if (!to) return;
    try {
      const device = await this.prisma.client.device.findUnique({
        where: { id: deviceId },
        select: { user: { select: { email: true, checkoutEmail: true } } },
      });
      const buyerEmail = device?.user.email ?? device?.user.checkoutEmail;
      if (!buyerEmail) return;
      await this.mail.send('admin_device_waiting', to, { buyerEmail });
    } catch (err) {
      this.logger.error({ err: String(err) }, 'owner notification failed');
    }
  }
}
