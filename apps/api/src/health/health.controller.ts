import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Health } from '@xstore/shared';
import { HealthService } from './health.service.js';

type HttpRes = { status(code: number): unknown };

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async get(@Res({ passthrough: true }) res: HttpRes): Promise<Health> {
    const report = await this.health.check();
    if (report.status !== 'ok') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }
}
