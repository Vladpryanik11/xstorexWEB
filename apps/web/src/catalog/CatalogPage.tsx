import type { ReactNode } from 'react';
import styles from './CatalogPage.module.css';

/** Frame of the category, list and search pages: title, optional lead, content. */
export function CatalogPage({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>{title}</h1>
        {lead}
      </div>
      {children}
    </div>
  );
}

export function MoreLink({ href }: { href: string }) {
  return (
    <p className={styles.more}>
      <a className={styles.moreLink} href={href}>
        Показать ещё
      </a>
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}
