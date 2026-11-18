import styles from './SectionTiles.module.css';
import { SECTIONS } from './sections';

/** Four catalog sections as tiles under the home hero (owner 2026-11-18). */
export function SectionTiles() {
  return (
    <nav className={styles.tiles} aria-label="Разделы каталога">
      {SECTIONS.map((section) => (
        <a
          key={section.slug}
          href={section.href}
          className={styles.tile}
          data-section={section.slug}
        >
          <span className={styles.icon} aria-hidden="true">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d={section.icon} />
            </svg>
          </span>
          <span className={styles.text}>
            <span className={styles.title}>{section.title}</span>
            <span className={styles.lead}>{section.lead}</span>
          </span>
        </a>
      ))}
    </nav>
  );
}
