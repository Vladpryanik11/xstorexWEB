'use client';
import {
  type AccessResponse,
  type AccessState,
  type DeviceFamily,
  waitPhase,
} from '@xstore/shared';
import { Button } from '@xstore/ui';
import { useEffect, useState } from 'react';
import { useNow } from '../access/use-now';
import { formatReadyBy } from '../access/wait-time';
import type { DeviceKind } from '../app-page/device';
import { browserApi } from './browser-api';
import { ConnectGuide } from './ConnectGuide';
import styles from './checkout.module.css';
import own from './connect.module.css';
import {
  CONNECT_POLL_INTERVAL_MS,
  CONNECT_POLL_LIMIT_MS,
  CONNECT_WAITING_STORAGE,
  type ConnectStepState,
  connectErrorText,
  connectStep,
  familyName,
} from './connect-step';
import { StepBar } from './StepBar';
import { useBrowserDevice } from './use-browser-device';

export type ConnectStepProps = {
  access: AccessState;
  /** `?r=` from the API callback: `connected` or an error code. */
  result: string | null;
  /** Detected in the browser when left out (tests pass it). */
  device?: DeviceKind;
  family?: DeviceFamily;
  getAccess?: () => Promise<AccessResponse>;
  /** The connection file; a plain link, so Safari hands it to Settings. */
  profileUrl?: string;
  navigate?: (url: string) => void;
  /** The clock for the ready-by time; read after mount when left out. */
  now?: Date;
  /** Time zone of the ready-by time; the browser's when left out. */
  timeZone?: string;
};

const defaultGetAccess = () => browserApi().getAccess();
const defaultNavigate = (url: string) => window.location.assign(url);
const SIGNIN = '/signin?next=/get/iphone';

function readWaiting(): number | null {
  try {
    const since = Number(sessionStorage.getItem(CONNECT_WAITING_STORAGE));
    if (since > 0 && Date.now() - since < CONNECT_POLL_LIMIT_MS) return since;
    sessionStorage.removeItem(CONNECT_WAITING_STORAGE);
  } catch {
    // Storage blocked: waiting lives in this page view only.
  }
  return null;
}

function writeWaiting(since: number | null): void {
  try {
    if (since === null) sessionStorage.removeItem(CONNECT_WAITING_STORAGE);
    else sessionStorage.setItem(CONNECT_WAITING_STORAGE, String(since));
  } catch {
    // Nothing stored.
  }
}

/** Н3: a device whose files ended waits for new ones under another title. */
/** Spec §4.1 (supplier certificates): when a waiting device will be ready, in local time. */
function ReadyBy({
  access,
  now,
  timeZone,
}: {
  access: AccessState;
  now: Date | null;
  timeZone?: string;
}) {
  const since = access.kind === 'active' ? access.device?.waitingSince : undefined;
  if (!since || !now) return null;
  const wait = waitPhase(since, now);
  return (
    <p className={own.preparing}>
      {wait.phase === 'late'
        ? 'Готовим чуть дольше обычного, мы уже занимаемся.'
        : `Будет готов до ${formatReadyBy(wait.readyBy, timeZone)}.`}
    </p>
  );
}

function preparingText(name: string, updating: boolean): string {
  return updating
    ? 'Обновляем доступ, обычно до 24 часов'
    : `Готовим ваш ${name}, обычно до 24 часов`;
}

function statusText(step: ConnectStepState, name: string, error: string, updating = false): string {
  switch (step) {
    case 'guide':
      return `Подключить ${name}`;
    case 'waiting':
      return 'Ждём подключения…';
    case 'connected':
      return `Готово, ${name} подключён`;
    case 'preparing':
      return preparingText(name, updating);
    case 'ready':
      return `${name} готов`;
    case 'help':
      return 'Нужна помощь поддержки';
    case 'open_on_phone':
      return 'Откройте сайт на iPhone, чтобы подключить его';
    case 'error':
      return error;
    default:
      return 'Сначала оформите доступ';
  }
}

/**
 * Wizard step 2 «Подключить iPhone» (spec v2 §4): pictures and the connect link on iPhone/iPad,
 * «Ждём подключения…» while iOS answers, the result, or the notice on a computer.
 */
export function ConnectStep({
  access: initialAccess,
  result,
  device: deviceProp,
  family: familyProp,
  getAccess = defaultGetAccess,
  profileUrl = browserApi().enrollmentProfileUrl(),
  navigate = defaultNavigate,
  now: fixedNow,
  timeZone,
}: ConnectStepProps) {
  const now = useNow(fixedNow);
  const detected = useBrowserDevice();
  const device = deviceProp ?? detected?.kind ?? null;
  const [access, setAccess] = useState(initialAccess);
  const [waitingSince, setWaitingSince] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const family =
    (access.kind === 'active' ? access.device?.family : undefined) ??
    familyProp ??
    detected?.family ??
    'iphone';
  const name = familyName(family);
  const updating = access.kind === 'active' && access.device?.updating === true;
  const step = connectStep({
    device: device ?? 'ios',
    access,
    result,
    waiting: waitingSince !== null,
  });
  // Until the browser is known, the device-dependent screens wait (no notice flashing on iPad).
  const deviceUnknown =
    device === null && (step === 'guide' || step === 'waiting' || step === 'open_on_phone');
  const error = step === 'error' && result ? connectErrorText(result) : '';

  // A reload or a discarded Safari tab while iOS installs keeps waiting.
  useEffect(() => {
    const since = readWaiting();
    if (since !== null) setWaitingSince(since);
  }, []);

  // Any final screen ends the waiting kept for a reload.
  useEffect(() => {
    if (step !== 'guide' && step !== 'waiting') writeWaiting(null);
  }, [step]);

  useEffect(() => {
    if (step !== 'waiting' || waitingSince === null) return;
    let stopped = false;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = waitingSince + CONNECT_POLL_LIMIT_MS;
    const check = async () => {
      if (stopped || busy) return;
      if (Date.now() >= deadline) {
        writeWaiting(null);
        setWaitingSince(null);
        setTimedOut(true);
        return;
      }
      busy = true;
      try {
        const next = await getAccess();
        if (stopped) return;
        // The session ended while iOS was installing (`hasPassword` comes only with one): sign in,
        // then this step shows the device bound by the answer.
        if (next.hasPassword === undefined) {
          stopped = true;
          clearTimeout(timer);
          navigate(SIGNIN);
          return;
        }
        setAccess(next.state);
      } catch {
        // A failed check is retried on the next tick.
      } finally {
        busy = false;
      }
    };
    const schedule = () => {
      timer = setTimeout(async () => {
        await check();
        if (!stopped) schedule();
      }, CONNECT_POLL_INTERVAL_MS);
    };
    // Back from Settings: look at once instead of waiting for the next tick.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [step, waitingSince, getAccess, navigate]);

  function startWaiting() {
    // No preventDefault: the link itself downloads the file and iOS asks to allow it.
    const since = Date.now();
    writeWaiting(since);
    setTimedOut(false);
    setWaitingSince(since);
    // The waiting card is shorter: keep the step bar from sliding under the floating header.
    document.documentElement.scrollTo?.({ top: 0 });
  }

  const connectLink = (label: string, variant: 'primary' | 'quiet' = 'primary') => (
    <Button href={profileUrl} variant={variant} onClick={startWaiting} className={styles.wide}>
      {label}
    </Button>
  );
  const toAccess = (
    <Button variant="quiet" href="/access" className={styles.wide}>
      Мой доступ
    </Button>
  );

  return (
    <div className={styles.wizard}>
      <p role="status" aria-live="polite" className={styles.srOnly} data-testid="connect-status">
        {deviceUnknown ? '' : statusText(step, name, error, updating)}
      </p>
      <StepBar current={step === 'no_access' ? 0 : step === 'ready' ? 2 : 1} family={family} />
      {deviceUnknown ? (
        <section className={styles.panel} aria-busy="true">
          <span className={styles.spinner} aria-hidden="true" />
        </section>
      ) : step === 'guide' ? (
        <section className={styles.panel}>
          <h1 className={styles.title}>Подключить {name}</h1>
          <p className={styles.lead}>
            Один раз, чтобы приложения ставились на ваш {name}. Это займёт около минуты.
          </p>
          {timedOut ? (
            <p className={own.notice}>
              Подключение не завершилось. Нажмите «Подключить {name}» ещё раз и затем «Установить» в
              Настройках.
            </p>
          ) : null}
          <ConnectGuide family={family} />
          {connectLink(`Подключить ${name}`)}
        </section>
      ) : step === 'waiting' ? (
        <section className={styles.panel} aria-busy="true">
          <span className={styles.spinner} aria-hidden="true" />
          <h1 className={styles.title}>Ждём подключения…</h1>
          <p className={own.hint}>Вернитесь в Safari, когда нажмёте «Установить»</p>
          <p className={styles.lead}>
            Не нашли, где нажать? Откройте Настройки — сверху будет «Профиль загружен», а в нём
            «Установить».
          </p>
          {connectLink(`Подключить ${name} ещё раз`, 'quiet')}
        </section>
      ) : step === 'connected' ? (
        <section className={styles.panel}>
          <span className={styles.okBadge}>Подключено</span>
          <h1 className={styles.title}>Готово, {name} подключён</h1>
          <p className={own.preparing}>Готовим ваш {name}, обычно до 24 часов</p>
          <p className={styles.lead}>
            Когда всё будет готово, приложения из каталога можно будет ставить прямо отсюда.
          </p>
          <Button href="/" className={styles.wide}>
            В каталог
          </Button>
          {toAccess}
        </section>
      ) : step === 'preparing' ? (
        <section className={styles.panel}>
          <h1 className={styles.title}>{preparingText(name, updating)}</h1>
          <ReadyBy access={access} now={now} timeZone={timeZone} />
          <p className={styles.lead}>
            {name} уже подключён к вашему доступу. Когда всё будет готово, приложения можно будет
            ставить прямо из каталога.
          </p>
          <Button href="/" className={styles.wide}>
            В каталог
          </Button>
          {toAccess}
        </section>
      ) : step === 'help' ? (
        <section className={styles.panel}>
          <h1 className={styles.title}>Нужна помощь поддержки</h1>
          <p className={styles.lead}>
            {name} уже подключён к вашему доступу. Напишите нам, и мы поможем закончить подготовку.
          </p>
          <Button href="/support" className={styles.wide}>
            Написать в поддержку
          </Button>
          {toAccess}
        </section>
      ) : step === 'ready' ? (
        <section className={styles.panel}>
          <span className={styles.okBadge}>Можно ставить</span>
          <h1 className={styles.title}>{name} готов</h1>
          <p className={styles.lead}>Выберите приложение в каталоге и нажмите «Установить».</p>
          <Button href="/" className={styles.wide}>
            В каталог
          </Button>
        </section>
      ) : step === 'open_on_phone' ? (
        <section className={styles.panel}>
          <span className={own.phone} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
              <rect x="6" y="2.5" width="12" height="19" rx="3" />
              <path d="M10.5 18.5h3" />
            </svg>
          </span>
          <h1 className={styles.title}>Откройте сайт на iPhone, чтобы подключить его</h1>
          <p className={styles.lead}>
            Подключение идёт в Safari на самом iPhone или iPad. Откройте там этот сайт, войдите по
            почте и нажмите «Подключить iPhone».
          </p>
          {toAccess}
        </section>
      ) : step === 'error' ? (
        <section className={styles.panel}>
          <h1 className={styles.title}>Не получилось подключить {name}</h1>
          <p role="alert" className={styles.problemText}>
            {error}
          </p>
          <Button href="/get/iphone" className={styles.wide}>
            Попробовать снова
          </Button>
          {toAccess}
        </section>
      ) : (
        <section className={styles.panel}>
          <h1 className={styles.title}>Сначала оформите доступ</h1>
          <p className={styles.lead}>
            Подключить {name} можно при активной подписке. Она начнётся сразу после оплаты.
          </p>
          <Button href="/get" className={styles.wide}>
            Оформить доступ
          </Button>
        </section>
      )}
    </div>
  );
}
