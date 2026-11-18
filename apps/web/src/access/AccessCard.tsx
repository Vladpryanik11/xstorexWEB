'use client';
import { type AccessResponse, formatRuDate } from '@xstore/shared';
import { Button } from '@xstore/ui';
import { useState } from 'react';
import { browserApi } from '../checkout/browser-api';
import styles from '../checkout/checkout.module.css';
import { PasswordForm } from '../checkout/PasswordForm';
import own from './access.module.css';

export type AccessCardProps = {
  access: AccessResponse;
  logout?: () => Promise<void>;
  /** Full page load after sign-out, so the header turns back into the guest one. */
  go?: (url: string) => void;
};

const defaultLogout = () => browserApi().logout();
const defaultGo = (url: string) => window.location.assign(url);

function Status({ access }: { access: AccessResponse }) {
  const { state } = access;
  if (state.kind === 'active') {
    return (
      <>
        <span className={styles.okBadge}>Подписка действует</span>
        <h2 className={styles.subtitle}>Доступ активен до {formatRuDate(state.until)}</h2>
        <dl className={own.facts}>
          {access.email ? (
            <div className={own.fact}>
              <dt>Почта</dt>
              <dd>{access.email}</dd>
            </div>
          ) : null}
          <div className={own.fact}>
            <dt>iPhone</dt>
            <dd>{state.deviceReady ? 'Устройство подключено' : 'Устройство ещё не подключено'}</dd>
          </div>
        </dl>
        <Button href="/get?renew=1" className={styles.wide}>
          Продлить
        </Button>
        <p className={styles.note}>Продление добавит 30 дней к концу текущего срока.</p>
      </>
    );
  }
  if (state.kind === 'payment_pending') {
    return (
      <>
        <h2 className={styles.subtitle}>Ждём оплату</h2>
        <p className={styles.lead}>Заказ ещё не оплачен. Подписка начнётся сразу после оплаты.</p>
        <Button href={`/get/${encodeURIComponent(state.orderId)}`} className={styles.wide}>
          Продолжить оплату
        </Button>
      </>
    );
  }
  return (
    <>
      <h2 className={styles.subtitle}>Доступа нет</h2>
      <p className={styles.lead}>Подписка открывает весь каталог и начнётся сразу после оплаты.</p>
      {access.email ? (
        <dl className={own.facts}>
          <div className={own.fact}>
            <dt>Почта</dt>
            <dd>{access.email}</dd>
          </div>
        </dl>
      ) : null}
      <Button href="/get" className={styles.wide}>
        Оформить доступ
      </Button>
    </>
  );
}

/** «Мой доступ» (spec v2 §5): the term, the device, renewal, the password, support, sign-out. */
export function AccessCard({ access, logout = defaultLogout, go = defaultGo }: AccessCardProps) {
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');

  async function signOut() {
    setError('');
    setLeaving(true);
    try {
      await logout();
      go('/');
    } catch {
      setError('Не получилось выйти. Попробуйте ещё раз.');
      setLeaving(false);
    }
  }

  return (
    <>
      <section className={styles.panel} aria-label="Срок доступа">
        <Status access={access} />
      </section>
      {access.hasPassword === false ? (
        <section className={styles.panel} aria-label="Пароль">
          <PasswordForm title="Задать пароль" skippable={false} />
        </section>
      ) : null}
      <section className={own.footer} aria-label="Помощь и выход">
        <Button variant="quiet" href="/support">
          Написать в поддержку
        </Button>
        <button type="button" className={styles.skip} onClick={signOut} disabled={leaving}>
          {leaving ? 'Выходим…' : 'Выйти'}
        </button>
        {error ? (
          <p role="alert" className={`${styles.problemText} ${own.wideRow}`}>
            {error}
          </p>
        ) : null}
      </section>
    </>
  );
}
