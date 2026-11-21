import type { CollectionView } from '@xstore/shared';
import styles from './HeroIcons.module.css';

const COUNT = 5;

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
 * Phone hero: a plain row of real catalog icons between the promise and the button
 * (owner 2026-11-21, mockup https://claude.ai/artifact/KTT2YNZgLBaoF76GdxKMtN). Decorative only.
 */
export function HeroIcons({ collections }: { collections: CollectionView[] }) {
  const icons = heroIcons(collections, COUNT);
  return (
    <div className={styles.row} aria-hidden="true" data-hero-icons="">
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
    </div>
  );
}
