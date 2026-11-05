import { CryptoEngine } from 'pkijs';

// Pass the engine explicitly so enrollment never changes PKIjs global state.
export const enrollmentCrypto = new CryptoEngine({
  name: 'xstore-enrollment',
  crypto: globalThis.crypto,
});
