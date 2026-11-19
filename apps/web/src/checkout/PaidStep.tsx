import { type DeviceFamily, formatRuDate, type SetPassword } from '@xstore/shared';
import { Button } from '@xstore/ui';
import type { DeviceKind } from '../app-page/device';
import styles from './checkout.module.css';
import own from './connect.module.css';
import { familyName } from './connect-step';
import { PasswordForm } from './PasswordForm';

export type PaidStepProps = {
  until: Date | null;
  hasPassword: boolean;
  /** A device is already bound (a renewal): no connect step. */
  hasDevice?: boolean;
  /** The visitor's browser; null until it is read after hydration. */
  device: DeviceKind | null;
  family?: DeviceFamily;
  returnTo?: string | null;
  setPassword?: (body: SetPassword) => Promise<void>;
};

/** «Доступ активен до <дата>», the password offer, then on to step 2 «Подключить iPhone». */
export function PaidStep({
  until,
  hasPassword,
  hasDevice = false,
  device,
  family = 'iphone',
  returnTo,
  setPassword,
}: PaidStepProps) {
  const name = familyName(family);
  return (
    <section className={styles.panel}>
      <span className={styles.okBadge}>Оплата прошла</span>
      <h1 className={styles.title}>
        {until ? `Доступ активен до ${formatRuDate(until)}` : 'Доступ активен'}
      </h1>
      {hasPassword ? null : <PasswordForm setPassword={setPassword} />}
      {hasDevice || device === null ? null : device === 'ios' ? (
        <Button href="/get/iphone" className={styles.wide}>
          Дальше: подключить {name}
        </Button>
      ) : (
        <p className={own.notice}>Откройте сайт на iPhone, чтобы подключить его</p>
      )}
      <Button variant="quiet" href={returnTo ?? '/'} className={styles.wide}>
        {returnTo ? 'Вернуться к приложению' : 'В каталог'}
      </Button>
    </section>
  );
}
