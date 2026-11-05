import type { ReactNode } from 'react';
import styles from './InfoList.module.css';

export type InfoItem = { label: string; value: ReactNode };

export type InfoListProps = {
  items: InfoItem[];
};

/** «Информация» block: key/value rows separated by hairlines. */
export function InfoList({ items }: InfoListProps) {
  return (
    <dl className={styles.list}>
      {items.map((item) => (
        <div key={item.label} className={styles.item}>
          <dt className={styles.label}>{item.label}</dt>
          <dd className={styles.value}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
