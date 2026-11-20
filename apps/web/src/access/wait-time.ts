/** «21 ноября, 13:40» in the browser's time zone (or the given one, for tests). */
export function formatReadyBy(d: Date, timeZone?: string): string {
  const day = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone }).format(
    d,
  );
  const time = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(d);
  return `${day}, ${time}`;
}
