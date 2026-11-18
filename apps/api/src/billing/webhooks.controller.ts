import { Controller, HttpCode, Inject, Logger, Param, Post, Req } from '@nestjs/common';
import type { ApplyPaymentResult, PaymentProvider } from '@xstore/billing';
import { ErrorCode } from '@xstore/shared';
import { DomainError } from '../common/domain-error.js';
import type { HttpReq } from '../common/http.js';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';
import { CheckoutService } from './checkout.service.js';
import { isFakeProvider, PAYMENT_PROVIDER } from './provider.provider.js';

type WebhookReq = HttpReq & { body?: unknown };

/** Called by the payment provider: no Origin check (see OriginMiddleware), raw body ≤ 64 KB. */
@Controller('billing')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  private readonly devPayments: boolean;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly checkout: CheckoutService,
  ) {
    this.devPayments = config.payment.provider === 'fake' && config.devPages;
  }

  @Post('webhooks/:provider')
  @HttpCode(204)
  async webhook(@Param('provider') name: string, @Req() req: WebhookReq): Promise<void> {
    if (name !== this.provider.name) throw new DomainError(ErrorCode.NOT_FOUND, 404);
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      headers[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
    }
    let event: { providerPaymentId: string; eventKey: string };
    try {
      event = this.provider.authenticateWebhook(headers, raw);
    } catch {
      throw new DomainError(ErrorCode.UNAUTHORIZED, 401);
    }
    // The body is trusted for nothing but the payment id; amount and status are re-read.
    const result = await this.apply(event.providerPaymentId, event.eventKey);
    if (result.result === 'unknown_order' || result.result === 'mismatch') {
      this.logger.warn({ result: result.result, orderId: result.orderId }, 'payment webhook');
    }
  }

  /** Development only: plays the provider for the `/dev/pay/<id>` page. 404 otherwise. */
  @Post('dev/fake-payments/:id/:action')
  @HttpCode(200)
  async devPayment(
    @Param('id') id: string,
    @Param('action') action: string,
  ): Promise<{ result: ApplyPaymentResult['result'] }> {
    const provider = this.provider;
    if (!this.devPayments || !isFakeProvider(provider) || (action !== 'pay' && action !== 'fail')) {
      throw new DomainError(ErrorCode.NOT_FOUND, 404);
    }
    try {
      await provider.setStatus(id, action === 'pay' ? 'paid' : 'failed');
    } catch {
      throw new DomainError(ErrorCode.NOT_FOUND, 404);
    }
    const { result } = await this.apply(id, `fake:dev-${action}-${id}`);
    return { result };
  }

  private async apply(providerPaymentId: string, eventKey: string): Promise<ApplyPaymentResult> {
    try {
      return await this.checkout.processPayment(providerPaymentId, {
        kind: 'webhook',
        eventKey,
        payload: { providerPaymentId },
      });
    } catch (err) {
      // The provider retries a failed delivery; reconciliation catches anything it misses.
      this.logger.error({ err: (err as Error).message }, 'payment webhook failed');
      throw new DomainError(ErrorCode.PAYMENT_PROVIDER_DOWN, 503);
    }
  }
}
