/**
 * Spec v2 §4 step 2a: only Safari downloads the connection file. Which app the site is open in
 * on an iPhone or iPad; anything not recognised counts as Safari, so the usual step shows.
 */
export type BrowserApp =
  | 'safari'
  | 'telegram'
  | 'instagram'
  | 'facebook'
  | 'vk'
  | 'chrome'
  | 'yandex'
  | 'firefox'
  | 'edge'
  | 'opera'
  | 'google'
  | 'webview';

const APPS: [RegExp, BrowserApp][] = [
  [/Instagram/, 'instagram'],
  [/FBAN|FBAV/, 'facebook'],
  [/VKClient|vkclient/, 'vk'],
  [/CriOS/, 'chrome'],
  [/FxiOS/, 'firefox'],
  [/EdgiOS/, 'edge'],
  [/OPT\/|OPiOS/, 'opera'],
  [/YaBrowser|YaApp/, 'yandex'],
  [/GSA\//, 'google'],
];

/**
 * `hasTelegramProxy`: Telegram's in-app browser adds `window.TelegramWebviewProxy` and keeps
 * a Safari-like user agent.
 */
export function browserApp(userAgent: string, hasTelegramProxy: boolean): BrowserApp {
  const ios = /iPhone|iPad|iPod/.test(userAgent);
  // iPadOS shows the desktop site as a Mac: only the app names are trusted there.
  if (!ios && !/Macintosh/.test(userAgent)) return 'safari';
  if (hasTelegramProxy) return 'telegram';
  for (const [pattern, app] of APPS) if (pattern.test(userAgent)) return app;
  // A web view inside an app has no `Safari/` in its user agent.
  return ios && !/Safari\//.test(userAgent) ? 'webview' : 'safari';
}

const MENU = 'Не открылось? Нажмите ⋯ вверху справа → «Открыть в Safari».';
const EXTERNAL = 'Не открылось? Нажмите ⋯ вверху справа → «Открыть во внешнем браузере».';
const COPY = 'Не открылось? Скопируйте ссылку и вставьте её в Safari.';

/** What to do when the button did not switch to Safari, in the words of that app. */
export function safariHint(app: Exclude<BrowserApp, 'safari'>): string {
  switch (app) {
    case 'telegram':
    case 'vk':
    case 'webview':
      return MENU;
    case 'instagram':
    case 'facebook':
      return EXTERNAL;
    default:
      return COPY;
  }
}

/** iOS 17+ opens `x-safari-https://…` in Safari; older iOS ignores it and the hint helps. */
export function safariOpenUrl(url: string): string {
  return `x-safari-${url}`;
}
