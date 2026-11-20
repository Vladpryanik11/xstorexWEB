import { describe, expect, it } from 'vitest';
import { browserApp, safariHint, safariOpenUrl } from './in-app-browser';

const IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';

describe('browserApp', () => {
  it.each([
    ['Safari on iPhone', `${IOS} Version/18.1 Mobile/15E148 Safari/604.1`, 'safari'],
    [
      'Safari on iPad (desktop site)',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      'safari',
    ],
    ['Chrome', `${IOS} CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1`, 'chrome'],
    ['Firefox', `${IOS} FxiOS/133.0 Mobile/15E148 Safari/605.1.15`, 'firefox'],
    ['Edge', `${IOS} EdgiOS/131.0.2903.68 Version/18.0 Mobile/15E148 Safari/604.1`, 'edge'],
    ['Opera', `${IOS} Version/18.0 OPT/5.1.0 Mobile/15E148 Safari/604.1`, 'opera'],
    [
      'Yandex Browser',
      `${IOS} Version/18.0 YaBrowser/24.12.0.1234.10 Mobile/15E148 Safari/604.1`,
      'yandex',
    ],
    [
      'Yandex app',
      `${IOS} Mobile/15E148 YaApp_iOS/2412.0 YaApp_iOS_Browser/2412.0 Safari/604.1`,
      'yandex',
    ],
    ['Google app', `${IOS} GSA/343.0.695551749 Mobile/15E148 Safari/604.1`, 'google'],
    [
      'Instagram',
      `${IOS} Mobile/15E148 Instagram 357.0.0.25.101 (iPhone15,2; iOS 18_1; ru_RU)`,
      'instagram',
    ],
    ['Facebook', `${IOS} Mobile/15E148 [FBAN/FBIOS;FBAV/490.0.0.38.109;FBBV/658]`, 'facebook'],
    ['VK', `${IOS} Mobile/15E148 VKClient/8.110 (iPhone; iOS 18.1)`, 'vk'],
    ['an unknown app web view', `${IOS} Mobile/15E148`, 'webview'],
  ])('%s', (_name, ua, app) => {
    expect(browserApp(ua, false)).toBe(app);
  });

  it('Telegram is known by its bridge, whatever its user agent says', () => {
    expect(browserApp(`${IOS} Version/18.1 Mobile/15E148 Safari/604.1`, true)).toBe('telegram');
  });

  it('a computer is never asked to open Safari', () => {
    expect(
      browserApp(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
        false,
      ),
    ).toBe('safari');
  });
});

describe('safariHint', () => {
  it('in-app browsers: the ⋯ menu', () => {
    expect(safariHint('telegram')).toBe(
      'Не открылось? Нажмите ⋯ вверху справа → «Открыть в Safari».',
    );
    expect(safariHint('vk')).toBe('Не открылось? Нажмите ⋯ вверху справа → «Открыть в Safari».');
    expect(safariHint('webview')).toBe(
      'Не открылось? Нажмите ⋯ вверху справа → «Открыть в Safari».',
    );
  });

  it('Instagram and Facebook call it the external browser', () => {
    expect(safariHint('instagram')).toBe(
      'Не открылось? Нажмите ⋯ вверху справа → «Открыть во внешнем браузере».',
    );
    expect(safariHint('facebook')).toBe(safariHint('instagram'));
  });

  it('other browsers: copy the link', () => {
    for (const app of ['chrome', 'yandex', 'firefox', 'edge', 'opera', 'google'] as const) {
      expect(safariHint(app)).toBe('Не открылось? Скопируйте ссылку и вставьте её в Safari.');
    }
  });
});

it('safariOpenUrl asks iOS to open the same address in Safari', () => {
  expect(safariOpenUrl('https://xstorex.ru/get/iphone?h=abc')).toBe(
    'x-safari-https://xstorex.ru/get/iphone?h=abc',
  );
  expect(safariOpenUrl('http://localhost:3000/get/iphone?h=abc')).toBe(
    'x-safari-http://localhost:3000/get/iphone?h=abc',
  );
});
