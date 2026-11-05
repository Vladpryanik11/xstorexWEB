import type { CategoryView } from '@xstore/shared';
import { Chip } from '@xstore/ui';
import styles from './CategoryChips.module.css';
import { CategoryIcon } from './CategoryIcon';
import { categoryHref } from './links';

export type CategoryChipsProps = {
  categories: CategoryView[];
  /** Slug of the category being shown, highlighted as the active chip. */
  active?: string;
};

export function CategoryChips({ categories, active }: CategoryChipsProps) {
  if (categories.length === 0) return null;
  return (
    <nav className={styles.chips} aria-label="Категории">
      <ul className={styles.list}>
        {categories.map((c) => (
          <li key={c.slug}>
            <Chip
              href={categoryHref(c.slug)}
              icon={<CategoryIcon name={c.icon} />}
              active={c.slug === active}
            >
              {c.name}
            </Chip>
          </li>
        ))}
      </ul>
    </nav>
  );
}
