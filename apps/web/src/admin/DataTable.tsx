import type { ReactNode } from 'react';
import s from './admin.module.css';

export function DataTable({
  caption,
  headings,
  children,
  stack = false,
}: {
  caption: string;
  headings: string[];
  children: ReactNode;
  /** Below 48em each row becomes a card; cells name themselves through `data-label`. */
  stack?: boolean;
}) {
  return (
    <div className={stack ? `${s.tableScroll} ${s.stack}` : s.tableScroll}>
      <table className={s.table}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {headings.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
