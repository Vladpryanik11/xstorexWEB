import { expect, it } from 'vitest';
import { renderEmail } from './templates.js';

it('renders the code email with its expiration and unsolicited-request notice', () => {
  const mail = renderEmail({
    template: 'email-code',
    to: 'u@xstorex.ru',
    vars: { code: '123456' },
  });
  expect(mail.subject).toBe('Код для входа в Xstore');
  expect(mail.text).toBe(
    'Ваш код: 123456. Он действует 10 минут. Если вы не запрашивали код, просто удалите это письмо.',
  );
  expect(mail.html).toContain('123456');
});

it('escapes every template variable in HTML', () => {
  const mail = renderEmail({
    template: 'email-code',
    to: 'u@xstorex.ru',
    vars: { code: '<img src=x onerror="x">&' },
  });
  expect(mail.html).not.toContain('<img');
  expect(mail.html).toContain('&lt;img');
  expect(mail.html).toContain('&amp;');
});
