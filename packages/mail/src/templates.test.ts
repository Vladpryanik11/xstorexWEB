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

describe('device_preparing', () => {
  it('says the device is connected and being prepared, up to 24 hours', () => {
    const mail = renderMail('device_preparing', { family: 'iphone' }, SITE);
    expect(mail.subject).toBe('iPhone подключён, готовим его');
    expect(mail.text).toContain('Обычно это занимает до 24 часов');
    expect(mail.text).toContain('Пришлём письмо, когда всё будет готово');
    expect(mail.text).not.toMatch(/UDID|сертификат|профиль|поставщик/i);
  });

  it('says iPad for an iPad', () => {
    expect(renderMail('device_preparing', { family: 'ipad' }, SITE).subject).toBe(
      'iPad подключён, готовим его',
    );
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

describe('access_ready', () => {
  const data = { code: '482913', until: new Date('2026-12-18T12:00:00Z'), email: 'a+b@example.ru' };
  const mail = renderMail('access_ready', data, SITE);

  it('subject says access is open and has no code', () => {
    expect(mail.subject).toBe('Доступ открыт');
    expect(mail.subject).not.toContain('482913');
  });

  it('text has the code, 10 minutes, the end date and the one-time link in the hash', () => {
    expect(mail.text).toContain('482913');
    expect(mail.text).toContain('10 минут');
    expect(mail.text).toContain('18 декабря 2026');
    expect(mail.text).toContain(`${SITE}/signin/link#e=a%2Bb%40example.ru&c=482913`);
  });

  it('requires a code, the date and the email', () => {
    expect(() => renderMail('access_ready', { ...data, code: '1' }, SITE)).toThrow();
    expect(() => renderMail('access_ready', { code: '482913', email: 'a@b.ru' }, SITE)).toThrow();
    expect(() => renderMail('access_ready', { code: '482913', until: data.until }, SITE)).toThrow();
  });
});
