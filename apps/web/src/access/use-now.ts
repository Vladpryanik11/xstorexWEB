'use client';
import { useEffect, useState } from 'react';

/**
 * The clock for local times on screen: `null` until mount (so the server render never disagrees
 * with the browser), then ticking every minute. A fixed `now` (tests) is returned as is.
 */
export function useNow(fixed?: Date): Date | null {
  const [now, setNow] = useState<Date | null>(fixed ?? null);
  useEffect(() => {
    if (fixed) return;
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, [fixed]);
  return now;
}
