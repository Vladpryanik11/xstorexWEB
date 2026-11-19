import { Prisma, type PrismaClient } from '@xstore/db';
import { accessUntil } from '@xstore/shared';
import nodemailer from 'nodemailer';
import { type MailData, type MailTemplate, renderMail } from './templates.js';

export type OutgoingMail = { to: string; subject: string; text: string };

export type Mailer = {
  send(mail: OutgoingMail): Promise<void>;
  close(): void;
};

/** Pino and nestjs-pino loggers both fit. */
export type MailLogger = { warn(obj: Record<string, unknown>, msg: string): void };

export type MailDeps = {
  db: PrismaClient;
  mailer: Mailer;
  /** Public site address quoted in letters. */
  siteUrl: string;
  logger: MailLogger;
};

export type MailConfig = { smtpUrl: string; from: string };

/** `sent`, `failed` (logged, never thrown) or `duplicate` (the dedupe key was already used). */
export type SendStatus = 'sent' | 'failed' | 'duplicate';

/**
 * SMTP by `SMTP_URL`, sender `MAIL_FROM`. Short timeouts: letters are sent inline after a payment,
 * and a slow SMTP server must not hold a webhook for long.
 */
export function createSmtpMailer(config: MailConfig): Mailer {
  const transport = nodemailer.createTransport(
    {
      url: config.smtpUrl,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    },
    { from: config.from },
  );
  return {
    async send(mail) {
      await transport.sendMail(mail);
    },
    close() {
      transport.close();
    },
  };
}

const MAX_ERROR = 500;

/** The SMTP error for the log, with any secret value of the letter masked. */
function describeError(err: unknown, secrets: string[]): string {
  let text = err instanceof Error ? err.message : String(err);
  for (const secret of secrets) if (secret) text = text.replaceAll(secret, '***');
  return text.slice(0, MAX_ERROR);
}

/**
 * Renders and sends one letter and records it in `NotificationLog`. The row keeps the template,
 * recipient, subject, status and error, never the body: a login code exists only in the letter.
 *
 * With `dedupeKey` the row is claimed first (`sending`), then the letter goes out, then the row
 * becomes `sent` or `failed`. A second call with the same key returns `duplicate` and sends
 * nothing, also after a failure: no automatic retries by key (a resend is a manual decision).
 * A process crash between claim and send leaves the row in `sending`, also without a resend.
 *
 * SMTP failures never throw; database errors do.
 */
export async function sendMail(
  deps: MailDeps,
  template: MailTemplate,
  to: string,
  data: MailData,
  opts: { dedupeKey?: string } = {},
): Promise<SendStatus> {
  const { subject, text } = renderMail(template, data, deps.siteUrl);
  let id: string;
  try {
    ({ id } = await deps.db.notificationLog.create({
      data: { template, to, subject, status: 'sending', dedupeKey: opts.dedupeKey ?? null },
      select: { id: true },
    }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return 'duplicate';
    }
    throw err;
  }
  try {
    await deps.mailer.send({ to, subject, text });
  } catch (err) {
    const error = describeError(err, [data.code ?? '']);
    await deps.db.notificationLog.update({ where: { id }, data: { status: 'failed', error } });
    deps.logger.warn({ template, notificationId: id, err: error }, 'mail send failed');
    return 'failed';
  }
  await deps.db.notificationLog.update({ where: { id }, data: { status: 'sent' } });
  return 'sent';
}

/**
 * «Оплата прошла, доступ до …» for a paid order, at most once per order whichever path granted it
 * (webhook, browser return, reconcile, expiry). Goes to the email entered at checkout: it is the
 * buyer's contact, and the letter opens nothing without signing in.
 */
export async function sendPaymentPaid(
  deps: MailDeps,
  orderId: string,
  now: Date = new Date(),
): Promise<SendStatus | 'skipped'> {
  const order = await deps.db.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      userId: true,
      checkoutEmail: true,
      entitlement: { select: { expiresAt: true } },
    },
  });
  if (order?.status !== 'paid' || !order.entitlement) return 'skipped';
  // The buyer's whole access, as `/access` shows it: after a claim the chain can run through
  // several subscriptions, not only this order's.
  const rights = await deps.db.entitlement.findMany({
    where: { subscription: { userId: order.userId } },
    select: { startsAt: true, expiresAt: true, revokedAt: true },
  });
  const until = accessUntil(rights, now) ?? order.entitlement.expiresAt;
  return sendMail(
    deps,
    'payment_paid',
    order.checkoutEmail,
    { until },
    { dedupeKey: `payment_paid:${orderId}` },
  );
}
