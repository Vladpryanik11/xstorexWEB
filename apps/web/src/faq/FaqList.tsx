import { supportEmail } from '../legal/types';
import styles from './faq.module.css';
import { type FaqSection, faq, type Inline } from './questions';

function Text({ parts }: { parts: Inline[] }) {
  const email = supportEmail();
  return (
    <p className={styles.answer}>
      {parts.map((part, i) => {
        if (typeof part === 'string') return part;
        const href = 'email' in part ? `mailto:${email}` : part.href;
        const text = 'email' in part ? email : part.text;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: static text, never reordered
          <a key={i} className={styles.link} href={href}>
            {text}
          </a>
        );
      })}
    </p>
  );
}

/** «Вопросы»: a jump list of sections, then each section with collapsible questions. */
export function FaqList({ sections = faq }: { sections?: FaqSection[] }) {
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Вопросы</h1>
        <nav aria-label="Разделы вопросов">
          <ul className={styles.chips}>
            {sections.map((s) => (
              <li key={s.id}>
                <a className={styles.chip} href={`#${s.id}`}>
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      {sections.map((s) => (
        <section key={s.id} id={s.id} className={styles.section} aria-labelledby={`${s.id}-h`}>
          <h2 id={`${s.id}-h`} className={styles.heading}>
            {s.title}
          </h2>
          {s.questions.map((item) => (
            <details key={item.q} className={styles.item}>
              <summary className={styles.question}>{item.q}</summary>
              <Text parts={item.a} />
            </details>
          ))}
        </section>
      ))}
    </div>
  );
}
