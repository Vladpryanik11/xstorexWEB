import { webcrypto } from 'node:crypto';
import * as pkijs from 'pkijs';

/** pkijs on Node's WebCrypto, set once per process. */
export const cryptoEngine = new pkijs.CryptoEngine({
  name: 'node',
  crypto: webcrypto as unknown as Crypto,
});
pkijs.setEngine('node', cryptoEngine);
