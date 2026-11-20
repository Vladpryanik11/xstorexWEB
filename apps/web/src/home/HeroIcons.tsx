import type { CollectionView } from '@xstore/shared';
import styles from './HeroIcons.module.css';

const COUNT = 6;
const KINDS = ['Банки', 'Сервисы', 'Игры'];

/** Unique icon URLs from the home collections, in shelf order. */
export function heroIcons(collections: CollectionView[], count: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of collections) {
    for (const app of c.items) {
      if (out.length >= count) return out;
      if (!app.iconUrl || seen.has(app.slug)) continue;
      seen.add(app.slug);
      out.push(app.iconUrl);
    }
  }
  return out;
}

/**
 * Phone hero picture (variant A, owner 2026-11-20): real catalog icons on a soft ring, with a
 * «Банки / Сервисы / Игры» card and a «Premium включён» card. Decorative only.
 */
export function HeroIcons({ collections }: { collections: CollectionView[] }) {
  const icons = heroIcons(collections, COUNT);
  return (
    <div className={styles.stage} aria-hidden="true" data-hero-icons="">
      <span className={styles.ring} />
      <span className={styles.grid}>
        {Array.from({ length: COUNT }, (_, i) =>
          icons[i] ? (
            // biome-ignore lint/performance/noImgElement: tiny decorative icons from S3
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed positions
            <img key={i} className={styles.icon} src={icons[i]} alt="" data-icon="" />
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed positions
            <span key={i} className={styles.icon} data-icon="" />
          ),
        )}
      </span>
      <span className={`${styles.card} ${styles.kinds}`}>
        {KINDS.map((k) => (
          <span key={k} className={styles.kind}>
            <i />
            {k}
          </span>
        ))}
      </span>
      <span className={`${styles.card} ${styles.premium}`}>
        Premium включён
        <small>во всех приложениях</small>
      </span>
    </div>
  );
}
