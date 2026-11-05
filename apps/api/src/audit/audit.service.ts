import { Injectable } from '@nestjs/common';
import { Prisma } from '@xstore/db';
import { PrismaService } from '../infra/prisma.service.js';

export type AuditEntry = {
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string;
  diff?: unknown;
  ip?: string;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        diff: entry.diff === undefined ? undefined : (entry.diff as Prisma.InputJsonValue),
        ip: entry.ip,
      },
    });
  }
}
