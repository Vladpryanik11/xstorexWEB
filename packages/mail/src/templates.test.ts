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
