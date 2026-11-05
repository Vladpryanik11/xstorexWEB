export type SearchParams = Record<string, string | string[] | undefined>;

/** First value of a query parameter (`?q=a&q=b` → `a`). */
export const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;
