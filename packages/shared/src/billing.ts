import { z } from 'zod';

export const orderStatusSchema = z.enum([
  'created',
  'pending',
  'paid',
  'failed',
  'expired',
  'refunded',
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const planViewSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  durationDays: z.number().int().positive(),
  priceRub: z.number().int().positive(),
});
export type PlanView = z.infer<typeof planViewSchema>;

/** Copy of the plan stored on an order at purchase time. */
export type PlanSnapshot = PlanView;

export const orderViewSchema = z.object({
  id: z.string().min(1),
  status: orderStatusSchema,
  amountRub: z.number().int().positive(),
  paidAt: z.string().nullable(),
  returnTo: z.string().nullable(),
  accessUntil: z.string().nullable(),
});
export type OrderView = z.infer<typeof orderViewSchema>;

export const checkoutRequestSchema = z.object({
  checkoutKey: z.uuid(),
  email: z.email().max(254),
  returnTo: z.string().max(500).optional(),
  acceptTerms: z.literal(true),
});
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
