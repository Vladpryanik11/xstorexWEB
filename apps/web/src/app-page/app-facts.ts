import type { AppDetail } from '@xstore/shared';
import { formatBytes } from '@xstore/ui';

const names = new Intl.DisplayNames(['ru'], { type: 'language', fallback: 'none' });

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Facts strip «Язык»: «Русский» when `ru` is listed, else the first code upper-cased; «+N». */
export function languageFact(languages: string[]): string {
  const [first] = languages;
  if (first === undefined) return '—';
  const main = languages.some((code) => code.toLowerCase() === 'ru')
    ? 'Русский'
    : first.toUpperCase();
  return languages.length > 1 ? `${main} +${languages.length - 1}` : main;
}

function languageName(code: string): string {
  try {
    const name = names.of(code);
    if (name) return capitalize(name);
  } catch {
    // Not a valid BCP 47 tag: show the code as typed.
  }
  return code.toUpperCase();
}

/** «Информация» → «Языки»: full Russian names. */
export function languageNames(languages: string[]): string {
  return languages.map(languageName).join(', ');
}

export function compatibility(minIos: string | undefined): string | undefined {
  return minIos ? `iOS ${minIos} и новее` : undefined;
}

/** schema.org `SoftwareApplication` for the app page (spec §6.4). */
export function appJsonLd(app: AppDetail): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: app.name,
    operatingSystem: 'iOS',
    ...(app.category && { applicationCategory: app.category.name }),
    softwareVersion: app.version,
    fileSize: formatBytes(app.sizeBytes),
    ...(app.iconUrl && { image: app.iconUrl }),
    ...(app.rating !== undefined &&
      app.ratingCount !== undefined &&
      app.ratingCount > 0 && {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: app.rating,
          ratingCount: app.ratingCount,
        },
      }),
  };
}

/** JSON for an inline `<script>`: `<` is escaped so the data cannot close the tag. */
export function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
