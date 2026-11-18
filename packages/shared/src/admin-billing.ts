import { z } from 'zod';
import { emailSchema } from './auth.js';
import { type OrderStatus, orderStatusSchema } from './billing.js';

/** `GET/PATCH /admin/billing/plan`: the one plan the site sells. */
/**
 * The plan the site sells. Before the admin first saves it, `id` and `priceRub` are `null`: a
 * draft of the single `month` plan, not yet in the database (a plan never exists without a price).
 */
export type AdminPlan = {
  id: string | null;
  code: string;
  title: string;
  durationDays: number;
  priceRub: number | null;
  active: boolean;
};

/** The single plan of Н1, created by the admin's first save (never seeded in production). */
export const DEFAULT_PLAN = {
  code: 'month',
  title: 'Подписка на месяц',
  durationDays: 30,
} as const;

export const updatePlanSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(120),
    /** Whole rubles; paid orders keep their `planSnapshot`. */
    priceRub: z.number().int().positive().max(1_000_000),
    active: z.boolean(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'empty patch');
export type UpdatePlan = z.infer<typeof updatePlanSchema>;

/** An empty search box means no filter. */
const searchText = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .optional()
  .transform((v) => v || undefined);

export const adminOrdersQuerySchema = z.object({
  email: searchText,
  status: orderStatusSchema.optional(),
  cursor: z.string().max(500).optional(),
});
export type AdminOrdersQuery = z.infer<typeof adminOrdersQuerySchema>;

export const adminSubscriptionsQuerySchema = z.object({
  email: searchText,
  cursor: z.string().max(500).optional(),
});
export type AdminSubscriptionsQuery = z.infer<typeof adminSubscriptionsQuerySchema>;

/** Dates are ISO 8601. `email` is the contact given at checkout; `userEmail` the verified one. */
export type AdminOrder = {
  id: string;
  email: string;
  userEmail: string | null;
  amountRub: number;
  status: OrderStatus;
  createdAt: string;
  paidAt: string | null;
  accessStartsAt: string | null;
  accessUntil: string | null;
  revokedAt: string | null;
};

export type AdminRight = {
  id: string;
  startsAt: string;
  expiresAt: string;
  revokedAt: string | null;
  source: 'order' | 'grant';
  note: string | null;
};

export type AdminSubscription = {
  id: string;
  email: string | null;
  /** A guest purchase not yet merged into a verified buyer by a code login. */
  provisional: boolean;
  device: { id: string; name: string } | null;
  createdAt: string;
  /** End of the access running now; null when there is none. */
  accessUntil: string | null;
  rights: AdminRight[];
};

const note = z.string().trim().max(500).default('');

export const grantRequestSchema = z.strictObject({
  email: emailSchema,
  days: z.number().int().min(1).max(365),
  note,
});
export type GrantRequest = z.infer<typeof grantRequestSchema>;
export type GrantResult = { subscriptionId: string; startsAt: string; expiresAt: string };

export const refundRequestSchema = z.strictObject({ note });
export type RefundRequest = z.infer<typeof refundRequestSchema>;
