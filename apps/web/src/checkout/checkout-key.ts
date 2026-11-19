import { CHECKOUT_KEY_STORAGE } from './wizard-step';

/** The checkout key of this payment form, kept in `sessionStorage` so a reload reuses it. */
export function readCheckoutKey(): string {
  try {
    const stored = sessionStorage.getItem(CHECKOUT_KEY_STORAGE);
    if (stored) return stored;
  } catch {
    // Storage blocked: a key for this page view only.
  }
  return newCheckoutKey();
}

export function newCheckoutKey(): string {
  const key = crypto.randomUUID();
  try {
    sessionStorage.setItem(CHECKOUT_KEY_STORAGE, key);
  } catch {
    // Storage blocked: the key lives in memory only.
  }
  return key;
}

/** Called once an order is settled: the next payment form starts a new checkout. */
export function clearCheckoutKey(): void {
  try {
    sessionStorage.removeItem(CHECKOUT_KEY_STORAGE);
  } catch {
    // Nothing stored.
  }
}
