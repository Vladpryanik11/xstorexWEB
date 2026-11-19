import { z } from 'zod';

export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const emailCodeRequestSchema = z.object({ email: emailSchema });
export const emailCodeVerifySchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/),
});
/** Buyer password limits; the server answers `WEAK_PASSWORD` outside them. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const isAcceptablePassword = (p: string): boolean =>
  p.length >= PASSWORD_MIN && p.length <= PASSWORD_MAX;

/** Length is checked by the server (`WEAK_PASSWORD`), not here, so the code is specific. */
export const setPasswordSchema = z.object({ password: z.string().max(4096) });
export const customerLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});
export type SetPassword = z.infer<typeof setPasswordSchema>;
export type CustomerLogin = z.infer<typeof customerLoginSchema>;
export type EmailCodeRequest = z.infer<typeof emailCodeRequestSchema>;
export type EmailCodeVerify = z.infer<typeof emailCodeVerifySchema>;

export const roleSchema = z.enum(['user', 'support', 'admin']);
export type Role = z.infer<typeof roleSchema>;

export const staffLoginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(1).max(256),
  totp: z.string().regex(/^\d{6}$/),
});
export type StaffLogin = z.infer<typeof staffLoginSchema>;

export type MeResponse = {
  user: { id: string; email: string | null; role: Role };
  session: { kind: 'user' | 'staff'; deviceId: string | null };
};
