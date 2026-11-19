export type DeviceKind = 'ios' | 'desktop';

/**
 * Where the visitor can install from: iPhone, iPad or iPod; iPadOS asks for the desktop site as
 * a Mac with touch. Everything else (computers, Android) is `desktop`.
 */
export function deviceKind(userAgent: string, maxTouchPoints: number): DeviceKind {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1 ? 'ios' : 'desktop';
}
