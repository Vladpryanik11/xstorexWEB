import { Controller, Get, Req } from '@nestjs/common';
import type { HttpReq } from '../common/http.js';
import { type AccessJson, CheckoutService } from './checkout.service.js';

/** «Мой доступ»: public, answers `{ state: { kind: 'none' } }` without a buyer session. */
@Controller('access')
export class AccessController {
  constructor(private readonly checkout: CheckoutService) {}

  @Get()
  access(@Req() req: HttpReq): Promise<AccessJson> {
    return this.checkout.access(req.auth);
  }
}
