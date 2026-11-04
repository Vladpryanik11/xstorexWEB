import { Button } from '@xstore/ui';
import { SiteShell } from '../src/shell/SiteShell';
import styles from './status.module.css';

// Unknown URLs and notFound() outside the (site) group land here, so the shell is rendered here.
export default function NotFound() {
  return (
    <SiteShell>
      <section className={styles.status}>
        <h1 className={styles.title}>Страница не найдена</h1>
        <p className={styles.text}>Проверьте адрес или вернитесь на главную.</p>
        <Button href="/">На главную</Button>
      </section>
    </SiteShell>
  );
}
