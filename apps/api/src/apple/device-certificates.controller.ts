import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import {
  type CertificateUpload,
  certificateUploadSchema,
  type DeviceCard,
  type WaitingDevice,
} from '@xstore/shared';
import { Roles } from '../auth/roles.decorator.js';
import { actor } from '../common/actor.js';
import type { HttpReq } from '../common/http.js';
import { zodBody } from '../common/zod-body.js';
import { DeviceCertificatesService } from './device-certificates.service.js';

/** Path of the upload route: the only JSON body allowed up to 1.5 MB (see `app.ts`). */
export const CERTIFICATE_UPLOAD_PATH = /^\/api\/v1\/admin\/devices\/[^/]+\/certificate$/;

@Controller('admin/devices')
@Roles('admin')
export class DeviceCertificatesController {
  constructor(private readonly certificates: DeviceCertificatesService) {}

  @Get('waiting')
  waiting(): Promise<WaitingDevice[]> {
    return this.certificates.waiting();
  }

  @Get('waiting/count')
  async count(): Promise<{ count: number }> {
    return { count: await this.certificates.waitingCount() };
  }

  @Get(':id')
  card(@Param('id') id: string): Promise<DeviceCard> {
    return this.certificates.card(id);
  }

  @Post(':id/certificate')
  upload(
    @Param('id') id: string,
    @Body(zodBody(certificateUploadSchema)) body: CertificateUpload,
    @Req() req: HttpReq,
  ): Promise<DeviceCard> {
    return this.certificates.upload(id, body, actor(req));
  }

  @Delete(':id/certificate')
  @HttpCode(200)
  remove(@Param('id') id: string, @Req() req: HttpReq): Promise<DeviceCard> {
    return this.certificates.remove(id, actor(req));
  }
}
