import type { PrismaClient } from '@xstore/db';
import { z } from 'zod';
import { hashPassword } from '../auth/password.js';
import { generateTotpSecret, totpUri } from '../auth/totp.js';

export const MIN_PASSWORD_LENGTH = 12;

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/**
 * Creates the admin or resets an existing one: new password, new TOTP secret, role `admin`,
 * unblocked, every session revoked. Returns the otpauth URI to show once.
 */
export async function upsertAdmin(
  db: PrismaClient,
  rawEmail: string,
  password: string,
): Promise<{ userId: string; created: boolean; otpauthUri: string; secret: string }> {
  const email = emailSchema.parse(rawEmail);
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`);
  }
  const passwordHash = await hashPassword(password);
  const secret = generateTotpSecret();
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  const data = { role: 'admin' as const, passwordHash, totpSecret: secret, blockedAt: null };
  const user = await db.$transaction(async (tx) => {
    const saved = existing
      ? await tx.user.update({ where: { id: existing.id }, data })
      : await tx.user.create({ data: { email, ...data } });
    await tx.session.deleteMany({ where: { userId: saved.id } });
    await tx.auditLog.create({
      data: {
        action: existing ? 'admin.reset' : 'admin.create',
        entity: 'User',
        entityId: saved.id,
        diff: { email, via: 'cli' },
      },
    });
    return saved;
  });
  return { userId: user.id, created: !existing, otpauthUri: totpUri(secret, email), secret };
}
