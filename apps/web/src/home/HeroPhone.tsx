import type { CollectionView } from '@xstore/shared';
import { IPhoneFrame } from '@xstore/ui';
import styles from './HeroPhone.module.css';

const SHELVES = 3;
const PER_SHELF = 4;
const CHIPS = ['Все', 'Банки', 'Игры', 'Сервисы'];

/**
 * The hero iPhone: a miniature of the store built from real home collections (spec v2 §3.1).
 * The screen is laid out at phone size and scaled down in CSS, so its text stays on the type scale.
 * Purely decorative — the parent hides it from assistive tech.
 */
export function HeroPhone({ collections }: { collections: CollectionView[] }) {
  const shelves = collections.filter((c) => c.items.length > 0).slice(0, SHELVES);
  return (
    <div className={styles.phone} data-hero-phone="">
      <IPhoneFrame className={styles.frame}>
        <div className={styles.viewport}>
          <div className={styles.screen}>
            <div className={styles.brand}>
              <span className={styles.mark}>X</span>
              <span>
                X<span className={styles.accent}>storex</span>
              </span>
            </div>
            <div className={styles.search}>Поиск приложений…</div>
            <div className={styles.chips}>
              {CHIPS.map((chip, i) => (
                <span key={chip} className={i === 0 ? styles.chipOn : styles.chip}>
                  {chip}
                </span>
              ))}
            </div>
            {shelves.map((shelf) => (
              <div key={shelf.slug} className={styles.shelf} data-shelf={shelf.title}>
                <div className={styles.shelfHead}>
                  <span>{shelf.title}</span>
                  <span className={styles.accent}>Все</span>
                </div>
                <div className={styles.apps}>
                  {shelf.items.slice(0, PER_SHELF).map((app) => (
                    <div key={app.slug} className={styles.app} data-app="">
                      {app.iconUrl ? (
                        // biome-ignore lint/performance/noImgElement: tiny decorative icons from S3, no optimisation needed
                        <img className={styles.icon} src={app.iconUrl} alt="" />
                      ) : (
                        <span className={styles.icon} />
                      )}
                      <span className={styles.name}>{app.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className={styles.premium}>Premium‑доступы к приложениям</div>
          </div>
        </div>
      </IPhoneFrame>
    </div>
  );
}
