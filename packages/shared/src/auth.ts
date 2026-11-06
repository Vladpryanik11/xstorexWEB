import { z } from 'zod';

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
