export interface AscCredentials {
  keyId: string;
  issuerId: string;
  privateKeyPem: string;
}
export async function signAscJwt(input: AscCredentials & { now: Date }): Promise<string> {
  try {
    const key = await importPKCS8(input.privateKeyPem, 'ES256');
    const issuedAt = Math.floor(input.now.getTime() / 1000);
    return await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: input.keyId, typ: 'JWT' })
      .setIssuer(input.issuerId)
      .setAudience('appstoreconnect-v1')
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 900)
      .sign(key);
  } catch {
    throw new Error('Не удалось подписать токен Apple');
  }
}

import { importPKCS8, SignJWT } from 'jose';
