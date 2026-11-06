import type { ReactNode } from 'react';
import s from './admin.module.css';

export function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the field control is passed as children and nested in this label
    <label className={s.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}
