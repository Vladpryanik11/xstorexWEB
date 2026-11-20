import { type AccessDevice, waitPhase } from '@xstore/shared';
import { Stepper } from '@xstore/ui';
import styles from '../checkout/checkout.module.css';
import { familyName } from '../checkout/connect-step';
import own from './access.module.css';
import { formatReadyBy } from './wait-time';

type Props = { device: AccessDevice & { waitingSince: Date }; now: Date; timeZone?: string };

/**
 * Spec §4.1 (supplier certificates): the steps to «Можно ставить» and where the wait stands —
 * preparing (ready-by time and a bar), almost (hours left) or late (no time; the card's support
 * link stays below).
 */
export function WaitStatus({ device, now, timeZone }: Props) {
  const name = familyName(device.family);
  const updating = device.updating === true;
  const wait = waitPhase(device.waitingSince, now);
  const readyBy = formatReadyBy(wait.readyBy, timeZone);
  const steps = [
    { title: 'Оплачено' },
    { title: `${name} подключён` },
    { title: updating ? 'Обновляем доступ' : `Готовим ${name}` },
    { title: 'Можно ставить' },
  ];
  const title =
    wait.phase === 'late'
      ? 'Готовим чуть дольше обычного'
      : wait.phase === 'almost'
        ? 'Почти готово'
        : updating
          ? 'Обновляем доступ'
          : `Готовим ваш ${name}`;
  return (
    <section className={own.wait} aria-labelledby="wait-title">
      <span className={wait.phase === 'late' ? own.lateBadge : own.waitBadge}>
        {wait.phase === 'late'
          ? 'Задерживаемся'
          : updating
            ? 'Обновляем доступ'
            : `Готовим ${name}`}
      </span>
      <h2 id="wait-title" className={styles.subtitle}>
        {title}
      </h2>
      {wait.phase === 'late' ? (
        // «Написать в поддержку» is already on the card, below.
        <p className={styles.lead}>Мы уже знаем и занимаемся.</p>
      ) : (
        <>
          <p className={styles.lead}>
            {wait.phase === 'almost'
              ? `Осталось около ${wait.hoursLeft} ч. Будет готов до ${readyBy}.`
              : `Обычно до 24 часов. Будет готов до ${readyBy}.`}
          </p>
          <div
            className={own.bar}
            role="progressbar"
            aria-label="Ожидание"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(wait.progress * 100)}
          >
            <span style={{ width: `${Math.max(4, wait.progress * 100)}%` }} />
          </div>
        </>
      )}
      <Stepper label="Шаги" steps={steps} current={2} />
    </section>
  );
}
