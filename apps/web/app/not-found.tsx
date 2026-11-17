import { Button } from '@xstore/ui';
import { SiteShell } from '../src/shell/SiteShell';
import styles from './status.module.css';

// Unknown URLs and notFound() outside the (site) group land here, so the shell is rendered here.
export default function NotFound() {
  return (
    <SiteShell>
      <section className={styles.status}>
        <h1 className={styles.title}>Такой страницы нет</h1>
        <p className={styles.text}>Возможно, ссылка устарела или в адресе опечатка.</p>
        <Button href="/">В каталог</Button>
      </section>
    </SiteShell>
  );
}
