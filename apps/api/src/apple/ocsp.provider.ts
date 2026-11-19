/** OCSP seam: production uses the global `fetch` and Apple's responder only. */
export const OCSP_OPTIONS = Symbol('OCSP_OPTIONS');

export type OcspOptions = { fetchFn?: typeof fetch; allowedHosts?: readonly string[] };
