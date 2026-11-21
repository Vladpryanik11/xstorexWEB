import type { Metadata } from 'next';
import { Contacts } from '../../../src/legal/LegalDocument';
import styles from '../../../src/legal/legal.module.css';

export const metadata: Metadata = {
  title: 'Контакты',
  description: 'Как связаться с Xstorex.',
};

export default function LegalPage() {
  return (
    <article className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Контакты</h1>
      </header>
      <p className={styles.text}>
        Xstorex — сервис подписки на каталог приложений для iPhone и iPad. По вопросам доступа,
        возврата денег и персональных данных пишите нам:
      </p>
      <Contacts />
    </article>
  );
}
