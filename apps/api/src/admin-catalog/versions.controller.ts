import { Body, Controller, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { type AdminVersion, type UpdateVersion, updateVersionSchema } from '@xstore/shared';
import { Roles } from '../auth/roles.decorator.js';
import { actor } from '../common/actor.js';
import type { HttpReq } from '../common/http.js';
import { zodBody } from '../common/zod-body.js';
import { AdminAppsService } from './admin-apps.service.js';

/** Publishing versions: the public latest version is the one published last. */
@Controller('admin/versions')
@Roles('admin')
export class VersionsController {
  constructor(private readonly apps: AdminAppsService) {}

  @Post(':id/publish')
  @HttpCode(200)
  publish(@Param('id') id: string, @Req() req: HttpReq): Promise<AdminVersion> {
    return this.apps.publishVersion(id, actor(req));
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  unpublish(@Param('id') id: string, @Req() req: HttpReq): Promise<AdminVersion> {
    return this.apps.unpublishVersion(id, actor(req));
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(zodBody(updateVersionSchema)) body: UpdateVersion,
    @Req() req: HttpReq,
  ): Promise<AdminVersion> {
    return this.apps.updateVersion(id, body, actor(req));
  }
}
