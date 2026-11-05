const UNITS = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'] as const;

const decimal = (value: number, digits: number) =>
  value.toFixed(digits).replace(/\.0+$/, '').replace('.', ',');

/** Binary units with Russian labels: «1,2 ГБ», «850 МБ». One decimal below 10. */
export function formatBytes(n: number): string {
  let value = Math.max(0, n);
  let unit = 0;
  while (unit < UNITS.length - 1 && value >= 1024) {
    value /= 1024;
    unit += 1;
  }
  let digits = value < 10 && unit > 0 ? 1 : 0;
  // 1023.96 МБ must read «1 ГБ», not «1024 МБ».
  if (Number(value.toFixed(digits)) >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
    digits = 1;
  }
  return `${decimal(value, digits)} ${UNITS[unit]}`;
}

/** Rating with a Russian decimal comma: «4,5». */
export function formatRating(n: number): string {
  return n.toFixed(1).replace('.', ',');
}
