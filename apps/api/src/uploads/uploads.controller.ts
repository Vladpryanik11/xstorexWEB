import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import {
  type CompleteUpload,
  type CreateUpload,
  completeUploadSchema,
  createUploadSchema,
  type PresignedParts,
  type PresignParts,
  presignPartsSchema,
  type UploadedParts,
  type UploadView,
} from '@xstore/shared';
import { Roles } from '../auth/roles.decorator.js';
import type { HttpReq } from '../common/http.js';
import { zodBody } from '../common/zod-body.js';
import { type Actor, UploadsService } from './uploads.service.js';

function actor(req: HttpReq): Actor {
  // biome-ignore lint/style/noNonNullAssertion: @Roles guarantees a session
  return { userId: req.auth!.userId, ip: req.ip };
}

/** Admin IPA uploads: the browser PUTs parts straight to S3 through presigned URLs. */
@Controller('admin/uploads')
@Roles('admin')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  create(
    @Body(zodBody(createUploadSchema)) body: CreateUpload,
    @Req() req: HttpReq,
  ): Promise<UploadView> {
    return this.uploads.create(body, actor(req));
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<UploadView> {
    return this.uploads.get(id);
  }

  @Post(':id/parts')
  @HttpCode(200)
  presign(
    @Param('id') id: string,
    @Body(zodBody(presignPartsSchema)) body: PresignParts,
  ): Promise<PresignedParts> {
    return this.uploads.presignParts(id, body.partNumbers);
  }

  @Get(':id/parts')
  parts(@Param('id') id: string): Promise<UploadedParts> {
    return this.uploads.listParts(id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(
    @Param('id') id: string,
    @Body(zodBody(completeUploadSchema)) body: CompleteUpload,
    @Req() req: HttpReq,
  ): Promise<UploadView> {
    return this.uploads.complete(id, body, actor(req));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: HttpReq): Promise<void> {
    return this.uploads.remove(id, actor(req));
  }
}
