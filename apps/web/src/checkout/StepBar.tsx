import type { DeviceFamily } from '@xstore/shared';
import styles from './checkout.module.css';
import { familyName } from './connect-step';

/**
 * «1 Оплата · 2 iPhone · 3 Установка» («iPad» on an iPad); `current` is the index of the open
 * step.
 */
export function StepBar({
  current,
  family = 'iphone',
}: {
  current: 0 | 1 | 2;
  family?: DeviceFamily;
}) {
  const steps = ['Оплата', familyName(family), 'Установка'];
  return (
    <ol className={styles.steps} aria-label="Шаги">
      {steps.map((title, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'next';
        return (
          <li
            key={title}
            className={styles.step}
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className={styles.stepNum} aria-hidden="true">
              {state === 'done' ? (
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <path
                    d="m2.5 6.5 2.2 2.2L9.5 3.8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <span className={styles.stepTitle}>{title}</span>
          </li>
        );
      })}
    </ol>
  );
}
