'use client';
import { ApiClientError, type HandoffRedeem as Body, ErrorCode } from '@xstore/shared';
import { useEffect, useRef } from 'react';
import { browserApi } from './browser-api';
import styles from './checkout.module.css';

export const HANDOFF_EXPIRED_SIGNIN = '/signin?next=/get/iphone&handoff=expired';

type Props = {
  token: string;
  redeem?: (body: Body) => Promise<void>;
  /** Replaces the page, so the token leaves the address and the history. */
  navigate?: (url: string) => void;
};

const defaultRedeem = (body: Body) => browserApi().redeemHandoff(body);
const defaultNavigate = (url: string) => window.location.replace(url);

/**
 * Spec v2 §4 step 2a: `/get/iphone?h=<token>` signs this browser in by the one-time link (a POST
 * from here, so link previews never spend it) and opens the step without the token.
 */
export function HandoffRedeem({
  token,
  redeem = defaultRedeem,
  navigate = defaultNavigate,
}: Props) {
  // Once per page: a second POST (React's development double effect) would find the link spent.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    redeem({ token })
      .then(() => navigate('/get/iphone'))
      .catch((err: unknown) => {
        const expired = err instanceof ApiClientError && err.code === ErrorCode.HANDOFF_INVALID;
        navigate(expired ? HANDOFF_EXPIRED_SIGNIN : '/get/iphone');
      });
  }, [token, redeem, navigate]);

  return (
    <div className={styles.wizard}>
      <section className={styles.panel} aria-busy="true">
        <span className={styles.spinner} aria-hidden="true" />
        <h1 className={styles.title}>Входим…</h1>
      </section>
    </div>
  );
}
