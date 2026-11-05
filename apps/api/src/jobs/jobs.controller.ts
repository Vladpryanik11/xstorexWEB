import { Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { type FailedJob, failedJobsQuerySchema, QueueName } from '@xstore/shared';
import { z } from 'zod';
import { Roles } from '../auth/roles.decorator.js';
import { actor } from '../common/actor.js';
import type { HttpReq } from '../common/http.js';
import { JobsService } from './jobs.service.js';

const queueSchema = z.enum(QueueName);
const jobIdSchema = z.string().min(1).max(200);

/** Failed worker jobs: support may look, only an admin sends a job back. */
@Controller('admin/jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get('failed')
  @Roles('admin', 'support')
  failed(@Query() query: unknown): Promise<FailedJob[]> {
    return this.jobs.failed(failedJobsQuerySchema.parse(query).queue);
  }

  @Post(':queue/:id/retry')
  @Roles('admin')
  @HttpCode(200)
  async retry(
    @Param('queue') queue: string,
    @Param('id') id: string,
    @Req() req: HttpReq,
  ): Promise<{ ok: true }> {
    await this.jobs.retry(queueSchema.parse(queue), jobIdSchema.parse(id), actor(req));
    return { ok: true };
  }
}
