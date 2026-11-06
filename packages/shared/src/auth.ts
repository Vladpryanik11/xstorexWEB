import { z } from 'zod';

export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const emailCodeRequestSchema = z.object({ email: emailSchema });
export const emailCodeVerifySchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/),
});
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
  kind: 'user' | 'staff';
};
