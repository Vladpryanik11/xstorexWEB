import { expect, it } from 'vitest';
import { attachmentDisposition } from './content-disposition.js';

it('keeps an ASCII name as is', () => {
  expect(attachmentDisposition('Telegram.ipa')).toBe(
    `attachment; filename="Telegram.ipa"; filename*=UTF-8''Telegram.ipa`,
  );
});

it('encodes Cyrillic and strips quotes from the fallback', () => {
  expect(attachmentDisposition('Яндекс "Карты".ipa')).toBe(
    `attachment; filename="_ _.ipa"; filename*=UTF-8''%D0%AF%D0%BD%D0%B4%D0%B5%D0%BA%D1%81%20%22%D0%9A%D0%B0%D1%80%D1%82%D1%8B%22.ipa`,
  );
});
