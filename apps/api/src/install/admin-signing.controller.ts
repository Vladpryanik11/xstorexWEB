import { Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { ErrorCode, QueueName, type SigningJobAdminView } from '@xstore/shared';
import { AuditService } from '../audit/audit.service.js';
import { Roles } from '../auth/roles.decorator.js';
import { actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import type { HttpReq } from '../common/http.js';
import { PrismaService } from '../infra/prisma.service.js';
import { QUEUES, type Queues } from '../infra/queues.provider.js';
import { SIGN_JOB_NAME, SIGN_JOB_OPTIONS } from './install.service.js';

/** Admin «Подпись»: the last signings; support reads, the admin retries a failed one. */
@Controller('admin/signing-jobs')
export class AdminSigningController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(QUEUES) private readonly queues: Queues,
  ) {}

  @Get()
  @Roles('admin', 'support')
  async list(): Promise<SigningJobAdminView[]> {
    const rows = await this.prisma.client.signingJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        stage: true,
        errorCode: true,
        createdAt: true,
        finishedAt: true,
        user: { select: { email: true, checkoutEmail: true } },
        appVersion: { select: { version: true, app: { select: { name: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      app: r.appVersion.app.name,
      version: r.appVersion.version,
      email: r.user.email ?? r.user.checkoutEmail,
      stage: r.stage,
      errorCode: r.errorCode,
      createdAt: r.createdAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    }));
  }

  @Post(':id/retry')
  @Roles('admin')
  @HttpCode(200)
  async retry(@Param('id') id: string, @Req() req: HttpReq): Promise<{ ok: true }> {
    const db = this.prisma.client;
    const row = await db.signingJob.findUnique({
      where: { id },
      select: { stage: true, queueJobId: true },
    });
    if (!row) throw new DomainError(ErrorCode.NOT_FOUND, 404);
    if (row.stage !== 'failed') throw new DomainError(ErrorCode.CONFLICT, 409);
    await db.signingJob.update({
      where: { id },
      data: { stage: 'queued', errorCode: null, finishedAt: null },
    });
    const queue = this.queues[QueueName.signing];
    const existing = await queue.getJob(row.queueJobId);
    if (existing && ((await existing.isCompleted()) || (await existing.isFailed()))) {
      await existing.remove().catch(() => undefined);
    }
    await queue.add(
      SIGN_JOB_NAME,
      { signingJobId: id },
      { ...SIGN_JOB_OPTIONS, jobId: row.queueJobId },
    );
    const who = actor(req);
    await this.audit.record({
      actorId: who.userId,
      ip: who.ip,
      action: 'signing.retry',
      entity: 'signingJob',
      entityId: id,
    });
    return { ok: true };
  }
}
