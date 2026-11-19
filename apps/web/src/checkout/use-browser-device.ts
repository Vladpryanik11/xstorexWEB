'use client';
import type { DeviceFamily } from '@xstore/shared';
import { useEffect, useState } from 'react';
import { type DeviceKind, deviceKind } from '../app-page/device';
import { browserFamily } from './connect-step';

export type BrowserDevice = { kind: DeviceKind; family: DeviceFamily };

/** iPhone, iPad or a computer, read after hydration (null on the server and the first render). */
export function useBrowserDevice(): BrowserDevice | null {
  const [device, setDevice] = useState<BrowserDevice | null>(null);
  useEffect(() => {
    const { userAgent, maxTouchPoints } = window.navigator;
    setDevice({
      kind: deviceKind(userAgent, maxTouchPoints),
      family: browserFamily(userAgent, maxTouchPoints),
    });
  }, []);
  return device;
}
