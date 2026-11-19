import { describe, expect, it } from 'vitest';
import { renderMail } from './templates.js';

const SITE = 'https://xstorex.ru';

describe('payment_paid', () => {
  const mail = renderMail('payment_paid', { until: new Date('2026-12-18T12:00:00Z') }, SITE);

  it('subject names the access end date in Russian', () => {
    expect(mail.subject).toBe('Оплата прошла, доступ до 18 декабря 2026');
  });

  it('text has the date and the site address', () => {
    expect(mail.text).toContain('18 декабря 2026');
    expect(mail.text).toContain('https://xstorex.ru');
  });

  it('uses the Moscow date near midnight UTC', () => {
    const late = renderMail('payment_paid', { until: new Date('2026-12-18T22:30:00Z') }, SITE);
    expect(late.subject).toBe('Оплата прошла, доступ до 19 декабря 2026');
  });

  it('requires the date', () => {
    expect(() => renderMail('payment_paid', {}, SITE)).toThrow();
  });
});

describe('login_code', () => {
  const mail = renderMail('login_code', { code: '482913' }, SITE);

  it('subject has no code', () => {
    expect(mail.subject).toBe('Код для входа');
    expect(mail.subject).not.toContain('482913');
  });

  it('text has the code and the 10 minutes', () => {
    expect(mail.text).toContain('Ваш код: 482913. Он действует 10 минут');
  });

  it('requires a 6-digit code', () => {
    expect(() => renderMail('login_code', { code: '12' }, SITE)).toThrow();
    expect(() => renderMail('login_code', {}, SITE)).toThrow();
  });
});

describe('device_ready', () => {
  const mail = renderMail('device_ready', { family: 'iphone' }, SITE);

  it('subject and site address, no technical words', () => {
    expect(mail.subject).toBe('iPhone готов, можно ставить');
    expect(mail.text).toContain(SITE);
    expect(`${mail.subject} ${mail.text}`).not.toMatch(/UDID|сертификат|профиль|поставщик/i);
  });

  it('says iPad on an iPad', () => {
    const ipad = renderMail('device_ready', { family: 'ipad' }, SITE);
    expect(ipad.subject).toBe('iPad готов, можно ставить');
    expect(ipad.text).not.toContain('iPhone');
  });
});

describe('reinstall_apps', () => {
  const mail = renderMail('reinstall_apps', { family: 'iphone' }, SITE);

  it('asks to install the apps again', () => {
    expect(mail.subject).toBe('Переустановите приложения');
    expect(mail.text).toContain(
      'Мы обновили доступ. Откройте сайт в Safari на iPhone и установите приложения заново.',
    );
    expect(mail.text).toContain(SITE);
    expect(mail.text).not.toMatch(/UDID|сертификат|профиль|поставщик/i);
  });
});

describe('admin_device_waiting', () => {
  const mail = renderMail('admin_device_waiting', { buyerEmail: 'buyer@example.ru' }, SITE);

  it('names the buyer and links the admin list, without the UDID value', () => {
    expect(mail.subject).toBe('Новый iPhone ждёт сертификата');
    expect(mail.text).toContain('buyer@example.ru');
    expect(mail.text).toContain(`${SITE}/admin/devices`);
    expect(mail.text).not.toMatch(/[0-9A-F]{8}-[0-9A-F]{16}/);
  });

  it('requires the buyer email', () => {
    expect(() => renderMail('admin_device_waiting', {}, SITE)).toThrow();
  });
});
