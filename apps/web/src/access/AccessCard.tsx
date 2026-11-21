'use client';
import {
  type AccessDevice,
  type AccessResponse,
  type DeviceFamily,
  formatRuDate,
} from '@xstore/shared';
import { Button } from '@xstore/ui';
import { useState } from 'react';
import { AccessReadyForm } from '../auth/AccessReadyForm';
import { browserApi } from '../checkout/browser-api';
import styles from '../checkout/checkout.module.css';
import { familyName } from '../checkout/connect-step';
import { PasswordForm } from '../checkout/PasswordForm';
import { useBrowserDevice } from '../checkout/use-browser-device';
import own from './access.module.css';
import { useNow } from './use-now';
import { WaitStatus } from './WaitStatus';

export type AccessCardProps = {
  access: AccessResponse;
  logout?: () => Promise<void>;
  /** Full page load after sign-out, so the header turns back into the guest one. */
  go?: (url: string) => void;
  /** iPhone or iPad before a device is connected; read from the browser when left out. */
  family?: DeviceFamily;
  /** The clock for the wait status; read after mount when left out (the time is local). */
  now?: Date;
  /** Time zone of the ready-by time; the browser's when left out. */
  timeZone?: string;
};

const defaultLogout = () => browserApi().logout();
const defaultGo = (url: string) => window.location.assign(url);

/**
 * The device row: connect, being prepared, ready, or a calm pointer to support when registration
 * stopped (`needsHelp`); the technical reason stays in the admin.
 */
function DeviceFact({
  device,
  family,
  detailed = false,
}: {
  device: AccessDevice | null;
  family: DeviceFamily;
  /** The wait block below tells the status: the row keeps only the model. */
  detailed?: boolean;
}) {
  if (!device) {
    const name = familyName(family);
    return (
      <div className={own.fact}>
        <dt>{name}</dt>
        <dd>
          <a className={own.action} href="/get/iphone">
            Подключить {name}
          </a>
        </dd>
      </div>
    );
  }
  return (
    <div className={own.fact}>
      <dt>{familyName(device.family)}</dt>
      {device.needsHelp ? (
        <dd>
          {device.model} ·{' '}
          <a className={own.action} href="/support">
            Нужна помощь поддержки
          </a>
        </dd>
      ) : detailed ? (
        <dd>{device.model}</dd>
      ) : (
        <dd>{`${device.model} · ${device.ready ? 'Готов' : device.updating ? 'Обновляем доступ, обычно до 24 часов' : 'Готовим, обычно до 24 часов'}`}</dd>
      )}
    </div>
  );
}

function Status({
  access,
  family,
  now,
  timeZone,
}: {
  access: AccessResponse;
  family: DeviceFamily;
  now: Date | null;
  timeZone?: string;
}) {
  const { state } = access;
  if (state.kind === 'active') {
    const device = state.device;
    const waiting =
      device && !device.ready && !device.needsHelp && device.waitingSince && now
        ? { ...device, waitingSince: device.waitingSince }
        : null;
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
          <DeviceFact device={state.device} family={family} detailed={waiting !== null} />
        </dl>
        {waiting && now ? <WaitStatus device={waiting} now={now} timeZone={timeZone} /> : null}
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
  if (access.accessReady && access.email) {
    // A guest whose access was opened on their email signs in by the code (spec v2 §5).
    return <AccessReadyForm email={access.email} />;
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
export function AccessCard({
  access,
  logout = defaultLogout,
  go = defaultGo,
  family,
  now: fixedNow,
  timeZone,
}: AccessCardProps) {
  const browser = useBrowserDevice();
  const now = useNow(fixedNow);
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
        <Status
          access={access}
          family={family ?? browser?.family ?? 'iphone'}
          now={now}
          timeZone={timeZone}
        />
      </section>
      {access.hasPassword === false && !access.accessReady ? (
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
