const MAX_SLUG_LENGTH = 80;
const FALLBACK_SLUG = 'app';

const CYRILLIC: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

function trimDashes(s: string): string {
  return s.replace(/^-+|-+$/g, '');
}

/**
 * Human-readable Latin slug: Cyrillic transliterated, everything except `a-z0-9`
 * becomes `-`, runs collapsed, at most 80 characters, `app` when nothing is left.
 */
export function slugify(input: string): string {
  const latin = Array.from(input.toLowerCase(), (ch) => CYRILLIC[ch] ?? ch).join('');
  const slug = trimDashes(trimDashes(latin.replace(/[^a-z0-9]+/g, '-')).slice(0, MAX_SLUG_LENGTH));
  return slug || FALLBACK_SLUG;
}

/** Returns `base`, or `base-2`, `base-3`, … — the first one `taken` reports free. */
export async function uniqueSlug(
  base: string,
  taken: (slug: string) => Promise<boolean>,
): Promise<string> {
  if (!(await taken(base))) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${trimDashes(base.slice(0, MAX_SLUG_LENGTH - suffix.length))}${suffix}`;
    if (!(await taken(candidate))) return candidate;
  }
}
