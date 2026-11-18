import { formatRuDate } from '@xstore/shared';

export type MailTemplate = 'payment_paid' | 'login_code';

export type MailData = { until?: Date; code?: string };

export type RenderedMail = { subject: string; text: string };

/**
 * Plain-text Russian letters. Pure: no I/O. Nothing here opens access without signing in, so the
 * only link is the site address. The login code goes into the text only, never the subject.
 */
export function renderMail(template: MailTemplate, data: MailData, siteUrl: string): RenderedMail {
  const site = new URL(siteUrl).origin;
  switch (template) {
    case 'payment_paid': {
      if (!data.until || Number.isNaN(data.until.getTime())) {
        throw new Error('payment_paid needs the access end date');
      }
      const date = formatRuDate(data.until);
      return {
        subject: `Оплата прошла, доступ до ${date}`,
        text: [
          'Здравствуйте!',
          '',
          `Оплата прошла. Доступ ко всему каталогу Xstore активен до ${date}.`,
          `Приложения устанавливаются с сайта ${site} — откройте его в Safari на iPhone.`,
          '',
          'Xstore',
        ].join('\n'),
      };
    }
    case 'login_code': {
      if (!data.code || !/^\d{6}$/.test(data.code))
        throw new Error('login_code needs a 6-digit code');
      return {
        subject: 'Код для входа',
        text: [
          'Здравствуйте!',
          '',
          `Ваш код: ${data.code}. Он действует 10 минут.`,
          `Введите его на сайте ${site}.`,
          '',
          'Если вы не запрашивали код, просто проигнорируйте это письмо.',
          '',
          'Xstore',
        ].join('\n'),
      };
    }
  }
}
