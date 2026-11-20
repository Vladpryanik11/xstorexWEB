import { Inject, Injectable, Logger } from '@nestjs/common';
import { deviceFamily } from '@xstore/shared';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';
import { PrismaService } from '../infra/prisma.service.js';
import { MailService } from '../mail/mail.service.js';

/**
 * At a device's first bind: the buyer hears «iPhone подключён, готовим его»; the owner
 * (`ADMIN_NOTIFY_EMAIL`, when set) hears that it waits for supplier files.
 */
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
    try {
      const device = await this.prisma.client.device.findUnique({
        where: { id: deviceId },
        select: { product: true, user: { select: { email: true, checkoutEmail: true } } },
      });
      const buyerEmail = device?.user.email ?? device?.user.checkoutEmail;
      if (!device || !buyerEmail) return;
      await this.mail.send('device_preparing', buyerEmail, {
        family: deviceFamily(device.product),
      });
      const owner = this.config.signing.adminNotifyEmail;
      if (owner) await this.mail.send('admin_device_waiting', owner, { buyerEmail });
    } catch (err) {
      this.logger.error({ err: String(err) }, 'device bound notification failed');
    }
  }
}
