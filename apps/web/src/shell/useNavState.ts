'use client';

import { useEffect, useState } from 'react';
import { browserApi } from '../checkout/browser-api';
import { GUEST, type NavState, navStateFrom } from './nav';

/**
 * The header's session, read in the browser after mount (`GET /access` sends the cookie), so the
 * server renders one guest header for everyone and the root error page can use it too. Sign-in
 * and sign-out reload the page, which mounts the header again. A failed request leaves a guest.
 */
export function useNavState(forced?: NavState): NavState {
  const [state, setState] = useState<NavState>(GUEST);
  useEffect(() => {
    if (forced) return;
    let current = true;
    browserApi()
      .getAccess()
      .then(
        (res) => current && setState(navStateFrom(res)),
        () => undefined,
      );
    return () => {
      current = false;
    };
  }, [forced]);
  return forced ?? state;
}
