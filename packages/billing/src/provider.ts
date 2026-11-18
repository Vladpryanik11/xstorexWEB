export type ProviderPaymentStatus = 'pending' | 'paid' | 'failed';

export type CreatePaymentInput = {
  orderId: string;
  amountRub: number;
  description: string;
  returnUrl: string;
  idempotencyKey: string;
};

export type ProviderPayment = {
  status: ProviderPaymentStatus;
  amountRub: number;
  currency: string;
  /** Confirmation time at the provider; null when the provider does not report it. */
  paidAt: Date | null;
};

export interface PaymentProvider {
  name: string;
  createPayment(i: CreatePaymentInput): Promise<{ providerPaymentId: string; redirectUrl: string }>;
  /** Throws when the webhook is not authentic. Never trust the body beyond the payment id. */
  authenticateWebhook(
    headers: Record<string, string | undefined>,
    rawBody: Buffer,
  ): { providerPaymentId: string; eventKey: string };
  getPayment(id: string): Promise<ProviderPayment>;
}
