'use client';

import { useEffect } from 'react';

const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

/**
 * Server Component session reads can extend the database session, but their
 * Set-Cookie response is internal to Next.js. A same-origin browser request
 * lets the API refresh the HttpOnly cookie in the browser.
 */
export function SessionRenewal() {
  useEffect(() => {
    let requestInFlight = false;

    const refreshSession = () => {
      if (document.visibilityState !== 'visible' || requestInFlight) return;
      requestInFlight = true;
      void fetch('/api/v1/auth/me', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      })
        .catch(() => undefined)
        .finally(() => {
          requestInFlight = false;
        });
    };

    refreshSession();
    const interval = window.setInterval(refreshSession, REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', refreshSession);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshSession);
    };
  }, []);

  return null;
}
