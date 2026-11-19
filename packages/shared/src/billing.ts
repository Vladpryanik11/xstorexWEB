import { z } from 'zod';
import type { AccessState } from './access.js';
import { emailSchema } from './auth.js';

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
  /** The provider's payment page while the order is open (pending, not expired); else null. */
  paymentUrl: z.string().nullable(),
});
export type OrderView = z.infer<typeof orderViewSchema>;

export const checkoutRequestSchema = z.object({
  checkoutKey: z.uuid(),
  email: emailSchema,
  returnTo: z.string().max(500).optional(),
  acceptTerms: z.literal(true),
});
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export const checkoutResponseSchema = z.object({
  orderId: z.string().min(1),
  /** Payment page of the provider, or the wizard page when the order needs no payment. */
  redirectUrl: z.string().min(1),
});
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

const isoDate = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

/** `AccessState` as sent over JSON; `until` is parsed back into a `Date`. */
export const accessStateSchema: z.ZodType<AccessState, unknown> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('payment_pending'), orderId: z.string().min(1) }),
  z.object({
    kind: z.literal('active'),
    until: isoDate,
    subscriptionId: z.string().min(1),
    device: z
      .object({
        model: z.string().min(1),
        family: z.enum(['iphone', 'ipad']),
        ready: z.boolean(),
        needsHelp: z.boolean(),
        updating: z.boolean().optional(),
      })
      .nullable(),
  }),
]);

/** `GET /access`. Without a buyer session only `state: { kind: 'none' }` is sent. */
export const accessResponseSchema = z.object({
  state: accessStateSchema,
  email: z.string().nullable().optional(),
  hasPassword: z.boolean().optional(),
});
export type AccessResponse = z.infer<typeof accessResponseSchema>;
