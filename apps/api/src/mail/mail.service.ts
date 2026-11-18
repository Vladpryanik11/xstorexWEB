import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import {
  createSmtpMailer,
  type MailData,
  type MailDeps,
  type MailTemplate,
  type SendStatus,
  sendMail,
  sendPaymentPaid,
} from '@xstore/mail';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';
import { PrismaService } from '../infra/prisma.service.js';

/** Nest wrapper over `@xstore/mail`: the same sending and log rules as the worker. */
@Injectable()
export class MailService implements OnApplicationShutdown {
  private readonly logger = new Logger(MailService.name);
  private readonly deps: MailDeps;

  constructor(@Inject(APP_CONFIG) config: AppConfig, prisma: PrismaService) {
    this.deps = {
      db: prisma.client,
      mailer: createSmtpMailer(config.mail),
      siteUrl: config.siteUrl,
      logger: { warn: (obj, msg) => this.logger.warn(obj, msg) },
    };
  }

  /** Sends one letter; an SMTP failure is logged as `failed` and never thrown. */
  async send(template: MailTemplate, to: string, data: MailData): Promise<SendStatus> {
    return sendMail(this.deps, template, to, data);
  }

  /** «Оплата прошла» for a granted order, at most once per order. */
  async paymentPaid(orderId: string) {
    return sendPaymentPaid(this.deps, orderId);
  }

  onApplicationShutdown(): void {
    this.deps.mailer.close();
  }
}
