'use client';

import { ApiClientError, ErrorCode, errorMessages } from '@xstore/shared';
import { motion, useReducedMotion } from 'motion/react';
import { forwardRef, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { browserApi } from '../checkout/browser-api';
import styles from './InstallButton.module.css';
import {
  BACK_AFTER_MS,
  flowText,
  installReducer,
  LINK_FRESH_MS,
  POLL_MS,
  POLL_TOLERANCE,
  ringTarget,
} from './install-flow';
import { ProgressRing } from './ProgressRing';

const SPRING = { type: 'spring', stiffness: 420, damping: 36 } as const;

const messageOf = (err: unknown): string =>
  err instanceof ApiClientError ? err.message : errorMessages[ErrorCode.SIGNING_FAILED];

/**
 * «Установить» that installs (spec Н4 §4, variant 1 chosen by the owner 21.11): the pill shrinks
 * into a blue ring that fills by the server's signing stages, ends with a check and opens the
 * one-time `itms-services://` link; iOS then asks «Установить?». Adapted from Aceternity
 * «Stateful Button» (https://ui.aceternity.com/components/stateful-button): one element morphs
 * between idle, working and done; here through Motion `layout`, CSS Modules and Xstore tokens.
 */
export type InstallButtonProps = {
  slug: string;
  /** Wizard step 3: «В каталог» under «Установлено» (the app window already is the catalog). */
  catalogLink?: boolean;
};

export const InstallButton = forwardRef<HTMLButtonElement, InstallButtonProps>(
  function InstallButton({ slug, catalogLink = false }, ref) {
    const [state, dispatch] = useReducer(installReducer, { kind: 'idle' });
    const reduce = useReducedMotion() ?? false;
    const alive = useRef(true);
    // The ring starts empty and moves to the first target on the next frame, so it animates.
    const [armed, setArmed] = useState(false);

    useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
      };
    }, []);

    const openLink = useCallback(async (jobId: string) => {
      const { itmsUrl } = await browserApi().installLink(jobId);
      if (!alive.current) return;
      dispatch({ type: 'link', jobId, itmsUrl, at: Date.now() });
      window.location.assign(itmsUrl);
    }, []);

    const start = useCallback(
      async (confirmReplace: boolean) => {
        dispatch({ type: 'start' });
        try {
          const job = await browserApi().requestInstall(
            slug,
            confirmReplace ? { confirmReplace } : {},
          );
          if (!alive.current) return;
          dispatch({ type: 'stage', jobId: job.jobId, stage: job.stage });
          if (job.stage === 'ready') await openLink(job.jobId);
        } catch (err) {
          if (!alive.current) return;
          if (err instanceof ApiClientError && err.code === ErrorCode.REPLACES_APP) {
            dispatch({ type: 'replaces', previous: err.details[0] ?? 'прошлое приложение' });
          } else {
            dispatch({ type: 'fail', message: messageOf(err) });
          }
        }
      },
      [slug, openLink],
    );

    const jobId = state.kind === 'working' ? state.jobId : '';
    const polling = state.kind === 'working' && jobId !== '' && state.stage !== 'ready';
    useEffect(() => {
      if (!polling) return;
      let stop = false;
      let misses = 0;
      const timer = window.setInterval(async () => {
        try {
          const job = await browserApi().installJob(jobId);
          if (stop || !alive.current) return;
          misses = 0;
          dispatch({ type: 'stage', jobId, stage: job.stage, errorCode: job.errorCode });
          if (job.stage === 'ready') {
            stop = true;
            window.clearInterval(timer);
            await openLink(jobId);
          }
        } catch (err) {
          if (stop || !alive.current) return;
          misses += 1;
          // A dropped poll on a weak signal is not a failed signing; a refusal from the API is.
          if (misses < POLL_TOLERANCE && !(err instanceof ApiClientError)) return;
          stop = true;
          window.clearInterval(timer);
          dispatch({ type: 'fail', message: messageOf(err) });
        }
      }, POLL_MS);
      return () => {
        stop = true;
        window.clearInterval(timer);
      };
    }, [polling, jobId, openLink]);

    // Back in Safari after the iPhone window (or after a while): «Установлено».
    const opened = state.kind === 'opened';
    useEffect(() => {
      if (!opened) return;
      const back = () => {
        if (document.visibilityState === 'visible') dispatch({ type: 'back' });
      };
      const timer = window.setTimeout(() => dispatch({ type: 'back' }), BACK_AFTER_MS);
      document.addEventListener('visibilitychange', back);
      return () => {
        window.clearTimeout(timer);
        document.removeEventListener('visibilitychange', back);
      };
    }, [opened]);

    const linked = state.kind === 'opened' || state.kind === 'installed' ? state : null;
    // A second tap reuses a fresh link (Safari opens it from the tap itself); an older one is spent
    // on the API side, so the tap takes a new link for the same signed copy.
    const again = (event: { preventDefault(): void }) => {
      if (!linked || Date.now() - linked.at < LINK_FRESH_MS) return;
      event.preventDefault();
      openLink(linked.jobId).catch((err: unknown) => {
        if (alive.current) dispatch({ type: 'fail', message: messageOf(err) });
      });
    };

    const working = state.kind === 'working' || linked !== null;
    useEffect(() => {
      if (!working) {
        setArmed(false);
        return;
      }
      const frame = window.requestAnimationFrame(() => setArmed(true));
      return () => window.cancelAnimationFrame(frame);
    }, [working]);

    const stage = state.kind === 'working' ? state.stage : 'ready';
    const target = ringTarget(stage);
    const text = flowText(state);
    const transition = reduce ? { duration: 0 } : SPRING;

    return (
      <div className={styles.root} data-state={state.kind}>
        {working ? (
          <motion.div
            layoutId={`install-${slug}`}
            transition={transition}
            className={styles.circle}
            data-reduce={reduce ? 'true' : 'false'}
          >
            <ProgressRing
              percent={armed ? target.percent : 0}
              durationMs={reduce ? 0 : target.durationMs}
              done={linked !== null}
            />
          </motion.div>
        ) : state.kind === 'confirm' ? (
          <div className={styles.confirm}>
            <motion.button
              ref={ref}
              type="button"
              layoutId={`install-${slug}`}
              transition={transition}
              className={styles.pill}
              onClick={() => void start(true)}
            >
              Всё равно установить
            </motion.button>
            <button
              type="button"
              className={styles.quiet}
              onClick={() => dispatch({ type: 'cancel' })}
            >
              Отмена
            </button>
          </div>
        ) : (
          <motion.button
            ref={ref}
            type="button"
            layoutId={`install-${slug}`}
            transition={transition}
            className={styles.pill}
            onClick={() => void start(false)}
          >
            {state.kind === 'failed' ? 'Попробовать ещё раз' : 'Установить'}
          </motion.button>
        )}
        <p className={styles.line} role="status" aria-live="polite">
          {text}
        </p>
        {state.kind === 'opened' ? (
          <p className={styles.again}>
            Окно не появилось?{' '}
            <a href={state.itmsUrl} onClick={again}>
              Нажмите ещё раз
            </a>
          </p>
        ) : state.kind === 'installed' ? (
          <>
            <p className={styles.again}>
              Не появилось?{' '}
              <a href={state.itmsUrl} onClick={again}>
                Установить ещё раз
              </a>
            </p>
            {catalogLink ? (
              <a href="/" className={styles.quiet}>
                В каталог
              </a>
            ) : null}
          </>
        ) : null}
      </div>
    );
  },
);
