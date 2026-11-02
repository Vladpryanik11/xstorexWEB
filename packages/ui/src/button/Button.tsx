import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import styles from './Button.module.css';

type OwnProps = {
  variant?: 'primary' | 'quiet';
  disabled?: boolean;
  children: ReactNode;
};

type LinkProps = OwnProps & { href: string } & Omit<ComponentPropsWithoutRef<'a'>, keyof OwnProps>;
type ActionProps = OwnProps & { href?: undefined } & Omit<
    ComponentPropsWithoutRef<'button'>,
    keyof OwnProps
  >;

export type ButtonProps = LinkProps | ActionProps;

export function Button({
  variant = 'primary',
  disabled = false,
  className,
  ...props
}: ButtonProps) {
  const classes = [styles.btn, styles[variant], className].filter(Boolean).join(' ');

  if (props.href !== undefined) {
    // A disabled link drops its href (an <a> without href is neither navigable nor focusable)
    // and keeps the link role so assistive technology still announces it.
    return (
      <a
        {...props}
        href={disabled ? undefined : props.href}
        role={disabled ? 'link' : props.role}
        aria-disabled={disabled || undefined}
        className={classes}
      />
    );
  }

  return (
    <button
      type="button"
      {...props}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      className={classes}
    />
  );
}
