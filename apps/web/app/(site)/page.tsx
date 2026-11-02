import { SearchField } from '@xstore/ui';
import styles from './page.module.css';

// Placeholder hero; M1 replaces it with the real home page.
export default function HomePage() {
  return (
    <section className={styles.hero}>
      <h1 className={styles.title}>Xstore — магазин приложений для iPhone</h1>
      <SearchField tone="page" />
    </section>
  );
}
