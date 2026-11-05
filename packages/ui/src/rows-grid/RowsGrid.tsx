import { Children, type ReactNode } from 'react';
import { Rail } from '../rail/Rail';
import styles from './RowsGrid.module.css';

export type RowsGridProps = {
  label: string;
  children: ReactNode;
};

const ROWS = 3;

/** «grid3» collection: rows stacked in columns of 3 that scroll sideways in a Rail. */
export function RowsGrid({ label, children }: RowsGridProps) {
  const rows = Children.toArray(children);
  const columns: ReactNode[] = [];
  for (let i = 0; i < rows.length; i += ROWS) {
    columns.push(
      <ul key={i} className={styles.column}>
        {rows.slice(i, i + ROWS).map((row, j) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows keep their position inside a column
          <li key={j}>{row}</li>
        ))}
      </ul>,
    );
  }
  return <Rail label={label}>{columns}</Rail>;
}
