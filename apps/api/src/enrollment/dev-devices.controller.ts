import { Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ErrorCode } from '@xstore/shared';
import { RequireUser } from '../auth/roles.decorator.js';
import { DomainError } from '../common/domain-error.js';
import type { HttpReq } from '../common/http.js';
import { PrismaService } from '../infra/prisma.service.js';

const STATUS = { ready: 'active', pending: 'pending' } as const;

/**
 * Development only (registered with `XSTORE_DEV_PAGES=1`): until device registration exists the
 * interface states «Готовим ваш iPhone» and «iPhone готов» are switched by hand.
 */
@Controller('devices/dev/mine')
export class DevDevicesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post(':status')
  @RequireUser()
  @HttpCode(204)
  async setStatus(@Param('status') name: string, @Req() req: HttpReq): Promise<void> {
    const status = Object.hasOwn(STATUS, name) ? STATUS[name as keyof typeof STATUS] : null;
    if (!status) throw new DomainError(ErrorCode.NOT_FOUND, 404);
    // biome-ignore lint/style/noNonNullAssertion: @RequireUser guarantees a session
    const userId = req.auth!.userId;
    const updated = await this.prisma.client.device.updateMany({
      where: { userId },
      data: { status },
    });
    if (updated.count === 0) throw new DomainError(ErrorCode.NOT_FOUND, 404);
  }
}
