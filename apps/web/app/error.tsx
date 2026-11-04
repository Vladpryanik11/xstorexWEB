'use client';

import { Button } from '@xstore/ui';
import { SiteShell } from '../src/shell/SiteShell';
import styles from './status.module.css';

// Wraps every page, the (site) layout included, so the shell is rendered here. The thrown value
// is never shown: production hides server error details anyway.
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <SiteShell>
      <section className={styles.status}>
        <h1 className={styles.title}>Что-то пошло не так</h1>
        <p className={styles.text}>Страница не загрузилась. Попробуйте ещё раз.</p>
        <Button onClick={() => retry()}>Попробовать снова</Button>
      </section>
    </SiteShell>
  );
}
