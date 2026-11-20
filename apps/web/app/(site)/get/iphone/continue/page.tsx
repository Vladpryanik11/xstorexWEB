import type { Metadata } from 'next';
import { HandoffRedeem } from '../../../../../src/checkout/HandoffRedeem';

export const metadata: Metadata = {
  title: 'Вход',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/**
 * Spec v2 §4 step 2a: `/get/iphone/continue#h=<token>` carries the sign-in from another browser
 * into Safari. The token is in the fragment, read in the browser only.
 */
export default function ContinueInSafariPage() {
  return <HandoffRedeem />;
}
