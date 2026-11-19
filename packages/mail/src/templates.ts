import { type DeviceFamily, formatRuDate } from '@xstore/shared';

export type MailTemplate =
  | 'payment_paid'
  | 'login_code'
  | 'device_ready'
  | 'reinstall_apps'
  | 'admin_device_waiting';

export type MailData = {
  until?: Date;
  code?: string;
  /** «iPad» instead of «iPhone» in device letters. */
  family?: DeviceFamily;
  /** The buyer, in the owner's letter about a device waiting for its certificate. */
  buyerEmail?: string;
};

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
    case 'device_ready': {
      const device = data.family === 'ipad' ? 'iPad' : 'iPhone';
      return {
        subject: `${device} готов, можно ставить`,
        text: [
          'Здравствуйте!',
          '',
          `Ваш ${device} готов. Откройте ${site} в Safari на ${device} и устанавливайте приложения из каталога.`,
          '',
          'Xstore',
        ].join('\n'),
      };
    }
    case 'reinstall_apps': {
      const device = data.family === 'ipad' ? 'iPad' : 'iPhone';
      return {
        subject: 'Переустановите приложения',
        text: [
          'Здравствуйте!',
          '',
          `Мы обновили доступ. Откройте сайт в Safari на ${device} и установите приложения заново.`,
          `Адрес сайта: ${site}`,
          '',
          'Xstore',
        ].join('\n'),
      };
    }
    case 'admin_device_waiting': {
      if (!data.buyerEmail) throw new Error('admin_device_waiting needs the buyer email');
      return {
        subject: 'Новый iPhone ждёт сертификата',
        text: [
          `Покупатель ${data.buyerEmail} подключил устройство.`,
          `Скопируйте UDID и загрузите файлы поставщика: ${site}/admin/devices`,
        ].join('\n'),
      };
    }
  }
}
