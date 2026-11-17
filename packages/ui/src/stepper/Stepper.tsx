import styles from './Stepper.module.css';

export type Step = { title: string; description?: string };

export type StepperProps = {
  label: string;
  steps: Step[];
  /** Index of the current step. */
  current: number;
};

/**
 * Vertical steps with inline titles, adapted from 21st.dev «Stepper» by originui
 * (https://21st.dev/@originui/components/stepper/vertical-with-inline-titles-and-descriptions).
 */
export function Stepper({ label, steps, current }: StepperProps) {
  return (
    <ol className={styles.list} aria-label={label}>
      {steps.map((step, i) => {
        const state = i < current ? 'complete' : i === current ? 'current' : 'upcoming';
        return (
          <li
            key={step.title}
            className={styles.step}
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className={styles.dot} aria-hidden="true">
              {state === 'complete' ? (
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
            <span className={styles.text}>
              <span className={styles.title}>{step.title}</span>
              {step.description ? (
                <span className={styles.description}>{step.description}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
