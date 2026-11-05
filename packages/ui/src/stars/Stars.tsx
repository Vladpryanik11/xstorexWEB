import { formatRating } from '../format/format';
import styles from './Stars.module.css';

export type StarsProps = {
  value: number;
  count?: number;
};

const STAR = 'M5 .5l1.4 2.9 3.1.4-2.3 2.2.6 3.1L5 7.6 2.2 9.1l.6-3.1L.5 3.8l3.1-.4z';
const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });

export function Stars({ value, count }: StarsProps) {
  const rating = Math.min(5, Math.max(0, value));
  return (
    <span className={styles.root}>
      <span className={styles.stars} role="img" aria-label={`Рейтинг ${formatRating(rating)} из 5`}>
        {Array.from({ length: 5 }, (_, i) => {
          const fill = Math.min(1, Math.max(0, rating - i));
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: five fixed stars
            <svg key={i} className={styles.star} viewBox="0 0 10 10" aria-hidden="true">
              <path d={STAR} className={styles.empty} />
              <path d={STAR} style={{ clipPath: `inset(0 ${100 - fill * 100}% 0 0)` }} />
            </svg>
          );
        })}
      </span>
      {count !== undefined ? <span className={styles.count}>{compact.format(count)}</span> : null}
    </span>
  );
}
