import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '@xstore/db';
import { formatRuDate } from '@xstore/shared';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createSmtpMailer, type MailDeps, sendMail, sendPaymentPaid } from '../src/index.js';
import { mailpitMessages, testSmtpUrl, waitForMail } from '../src/testing.js';

// biome-ignore lint/style/noNonNullAssertion: guaranteed by global-setup
const db = createPrismaClient(process.env.DATABASE_URL_TEST!);
const mailer = createSmtpMailer({ smtpUrl: testSmtpUrl(), from: 'Xstore <noreply@xstorex.test>' });
const SITE = 'https://xstorex.test';
const logger = { warn: vi.fn() };
const deps: MailDeps = { db, mailer, siteUrl: SITE, logger };

afterAll(async () => {
  mailer.close();
  await db.$disconnect();
});

/** Each test has its own recipient: other suites may share this Mailpit. */
const rcpt = () => `mail-${randomUUID()}@example.ru`;

describe('sendMail', () => {
  it('delivers payment_paid and logs it as sent', async () => {
    const to = rcpt();
    const status = await sendMail(deps, 'payment_paid', to, {
      until: new Date('2026-12-18T12:00:00Z'),
    });
    expect(status).toBe('sent');
    const [msg] = await waitForMail(to);
    expect(msg?.subject).toBe('Оплата прошла, доступ до 18 декабря 2026');
    expect(msg?.text).toContain(SITE);
    const rows = await db.notificationLog.findMany({ where: { to } });
    expect(rows).toMatchObject([
      { template: 'payment_paid', status: 'sent', error: null, dedupeKey: null },
    ]);
  });

  it('NotificationLog never stores the code', async () => {
    const to = rcpt();
    const code = '739214';
    expect(await sendMail(deps, 'login_code', to, { code })).toBe('sent');
    const [msg] = await waitForMail(to);
    expect(msg?.subject).toBe('Код для входа');
    expect(msg?.text).toContain(`Ваш код: ${code}`);
    const rows = await db.notificationLog.findMany({ where: { to } });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(code);
  });

  it('sends a letter with a dedupeKey at most once', async () => {
    const to = rcpt();
    const key = `payment_paid:${randomUUID()}`;
    const data = { until: new Date('2026-12-18T12:00:00Z') };
    expect(await sendMail(deps, 'payment_paid', to, data, { dedupeKey: key })).toBe('sent');
    expect(await sendMail(deps, 'payment_paid', to, data, { dedupeKey: key })).toBe('duplicate');
    await waitForMail(to);
    expect(await mailpitMessages(to)).toHaveLength(1);
    expect(await db.notificationLog.count({ where: { dedupeKey: key } })).toBe(1);
  });

  it('a failed send is logged as failed, without the code, and does not throw', async () => {
    const down = createSmtpMailer({
      smtpUrl: 'smtp://127.0.0.1:1',
      from: 'Xstore <noreply@xstorex.test>',
    });
    const warn = vi.fn();
    const to = rcpt();
    const code = '551208';
    try {
      const status = await sendMail({ ...deps, mailer: down, logger: { warn } }, 'login_code', to, {
        code,
      });
      expect(status).toBe('failed');
    } finally {
      down.close();
    }
    const [row] = await db.notificationLog.findMany({ where: { to } });
    expect(row?.status).toBe('failed');
    expect(row?.error).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain(code);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(code);
  });
});

describe('sendPaymentPaid', () => {
  async function paidOrder(email: string, expiresAt: Date) {
    const user = await db.user.create({
      data: { isProvisional: true, checkoutEmail: email, role: 'user' },
    });
    const sub = await db.subscription.create({ data: { userId: user.id } });
    const plan = await db.plan.upsert({
      where: { code: 'month' },
      create: { code: 'month', title: 'Подписка на месяц', durationDays: 30, priceRub: 1 },
      update: {},
    });
    const paidAt = new Date(expiresAt.getTime() - 30 * 86_400_000);
    const order = await db.order.create({
      data: {
        userId: user.id,
        subscriptionId: sub.id,
        planId: plan.id,
        planSnapshot: { code: 'month', title: 'Подписка на месяц', durationDays: 30, priceRub: 1 },
        checkoutEmail: email,
        checkoutKey: randomUUID(),
        amountRub: 1,
        status: 'paid',
        provider: 'fake',
        paidAt,
        expiresAt: new Date(paidAt.getTime() + 86_400_000),
      },
    });
    await db.entitlement.create({
      data: {
        subscriptionId: sub.id,
        planCode: 'month',
        durationDays: 30,
        startsAt: paidAt,
        expiresAt,
        orderId: order.id,
      },
    });
    return order;
  }

  it('mails the checkout email with the access end, once per order', async () => {
    const to = rcpt();
    const until = new Date(Date.now() + 30 * 86_400_000);
    const order = await paidOrder(to, until);

    expect(await sendPaymentPaid(deps, order.id)).toBe('sent');
    expect(await sendPaymentPaid(deps, order.id)).toBe('duplicate');

    const msgs = await waitForMail(to);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.subject).toMatch(/^Оплата прошла, доступ до \d{1,2} [а-я]+ \d{4}$/);
    const rows = await db.notificationLog.findMany({ where: { to } });
    expect(rows).toMatchObject([{ status: 'sent', dedupeKey: `payment_paid:${order.id}` }]);
  });

  it('payment mail date follows buyer chain', async () => {
    const to = rcpt();
    const paidEnd = new Date(Date.now() + 10 * 86_400_000);
    const order = await paidOrder(to, paidEnd);
    // After a claim the buyer can own another subscription whose rights chain after this one.
    const other = await db.subscription.create({ data: { userId: order.userId } });
    const chainEnd = new Date(paidEnd.getTime() + 30 * 86_400_000);
    await db.entitlement.create({
      data: {
        subscriptionId: other.id,
        planCode: 'month',
        durationDays: 30,
        startsAt: paidEnd,
        expiresAt: chainEnd,
      },
    });

    expect(await sendPaymentPaid(deps, order.id)).toBe('sent');
    const msgs = await waitForMail(to);
    expect(msgs[0]?.subject).toBe(`Оплата прошла, доступ до ${formatRuDate(chainEnd)}`);
  });

  it('skips an order that is not paid', async () => {
    const to = rcpt();
    const order = await paidOrder(to, new Date(Date.now() + 86_400_000));
    await db.order.update({ where: { id: order.id }, data: { status: 'pending' } });
    expect(await sendPaymentPaid(deps, order.id)).toBe('skipped');
    expect(await db.notificationLog.count({ where: { to } })).toBe(0);
  });
});
