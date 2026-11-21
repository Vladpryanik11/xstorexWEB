import styles from './legal.module.css';
import type { LegalBlock, LegalDoc } from './types';
import { supportEmail } from './types';

export function Contacts() {
  const email = supportEmail();
  const telegram = process.env.NEXT_PUBLIC_TELEGRAM_URL;
  return (
    <ul className={styles.list}>
      <li>
        Почта:{' '}
        <a className={styles.link} href={`mailto:${email}`}>
          {email}
        </a>
      </li>
      {telegram ? (
        <li>
          <a className={styles.link} href={telegram} target="_blank" rel="noopener noreferrer">
            Telegram
          </a>
        </li>
      ) : null}
    </ul>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === 'string') return <p className={styles.text}>{block}</p>;
  if ('contacts' in block) return <Contacts />;
  return (
    <ul className={styles.list}>
      {block.list.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** One legal page: title, update date, intro and numbered sections (structure as at DDE Store). */
export function LegalDocument({ doc }: { doc: LegalDoc }) {
  return (
    <article className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{doc.title}</h1>
        <p className={styles.updated}>Обновлено {doc.updated}</p>
      </header>
      {doc.intro.map((p) => (
        <p key={p} className={styles.text}>
          {p}
        </p>
      ))}
      {doc.sections.map((section) => (
        <section key={section.heading} className={styles.section}>
          <h2 className={styles.heading}>{section.heading}</h2>
          {section.blocks.map((block, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static text, never reordered
            <Block key={i} block={block} />
          ))}
        </section>
      ))}
    </article>
  );
}
