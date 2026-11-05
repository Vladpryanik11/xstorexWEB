'use client';

import type { FormEvent } from 'react';
import styles from './SearchField.module.css';

export type SearchFieldProps = {
  placeholder?: string;
  defaultValue?: string;
  name?: string;
  onSubmit?: (q: string) => void;
  /** Where the native GET submit goes, e.g. `/search`; the current URL when left out. */
  action?: string;
  tone?: 'glass' | 'page';
};

export function SearchField({
  placeholder = 'Приложения, игры и другое',
  defaultValue,
  name = 'q',
  onSubmit,
  action,
  tone = 'glass',
}: SearchFieldProps) {
  // Without an onSubmit handler the form submits natively (GET with the field name).
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!onSubmit) return;
    event.preventDefault();
    const q = new FormData(event.currentTarget).get(name);
    onSubmit(typeof q === 'string' ? q : '');
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: <search> needs iOS 17+, form[role=search] works everywhere
    <form
      role="search"
      action={action}
      method="get"
      className={`${styles.field} ${styles[tone]}`}
      onSubmit={handleSubmit}
    >
      <svg
        className={styles.icon}
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="5.5" />
        <path d="m12.5 12.5 4 4" />
      </svg>
      <input
        className={styles.input}
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label="Поиск"
      />
    </form>
  );
}
