import { z } from 'zod';

export const roleSchema = z.enum(['user', 'support', 'admin']);
export type Role = z.infer<typeof roleSchema>;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const staffLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
  totp: z.string().regex(/^\d{6}$/),
});
export type StaffLogin = z.infer<typeof staffLoginSchema>;

export type MeResponse = { user: { id: string; email: string | null; role: Role } };
