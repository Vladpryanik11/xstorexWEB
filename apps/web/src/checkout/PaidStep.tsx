import { formatRuDate, type SetPassword } from '@xstore/shared';
import { Button } from '@xstore/ui';
import styles from './checkout.module.css';
import { PasswordForm } from './PasswordForm';

export type PaidStepProps = {
  until: Date | null;
  hasPassword: boolean;
  /** Development only: the iPhone step (Н2–Н4) is not built yet. */
  devPages?: boolean;
  returnTo?: string | null;
  setPassword?: (body: SetPassword) => Promise<void>;
};

/** «Доступ активен до <дата>», then the password offer. */
export function PaidStep({ until, hasPassword, devPages, returnTo, setPassword }: PaidStepProps) {
  return (
    <section className={styles.panel}>
      <span className={styles.okBadge}>Оплата прошла</span>
      <h1 className={styles.title}>
        {until ? `Доступ активен до ${formatRuDate(until)}` : 'Доступ активен'}
      </h1>
      {hasPassword ? null : <PasswordForm setPassword={setPassword} />}
      {devPages ? (
        <p className={styles.stub}>Подключение iPhone появится в ближайшее время</p>
      ) : null}
      <Button variant="quiet" href={returnTo ?? '/'} className={styles.wide}>
        {returnTo ? 'Вернуться к приложению' : 'В каталог'}
      </Button>
    </section>
  );
}
