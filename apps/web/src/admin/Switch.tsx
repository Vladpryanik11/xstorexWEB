import type { InputHTMLAttributes, ReactNode } from 'react';
import s from './admin.module.css';

type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'> & {
  children: ReactNode;
};

/**
 * iOS-style switch on a real checkbox (`role="switch"`), after Uiverse «afraid-eel-50» by
 * zanina-yassine (https://uiverse.io/zanina-yassine/afraid-eel-50), MIT.
 */
export function Switch({ children, className, ...input }: SwitchProps) {
  return (
    <label className={className ? `${s.switchRow} ${className}` : s.switchRow}>
      {/* biome-ignore lint/a11y/useAriaPropsForRole: a native checkbox already exposes its checked state */}
      <input {...input} type="checkbox" role="switch" className={s.switch} />
      {children}
    </label>
  );
}
