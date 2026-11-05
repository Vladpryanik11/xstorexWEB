import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  type AdminAppDetail,
  type AdminAppListItem,
  type AdminVersion,
  adminAppsQuerySchema,
  type CommitMedia,
  commitMediaSchema,
  type HideApp,
  hideAppSchema,
  type MediaUploadTicket,
  mediaKindSchema,
  type Page,
  type PresignMedia,
  presignMediaSchema,
  type ScreenshotOrder,
  screenshotOrderSchema,
  type UpdateApp,
  updateAppSchema,
} from '@xstore/shared';
import { z } from 'zod';
import { Roles } from '../auth/roles.decorator.js';
import { actor } from '../common/actor.js';
import type { HttpReq } from '../common/http.js';
import { zodBody } from '../common/zod-body.js';
import { AdminAppsService } from './admin-apps.service.js';

const indexSchema = z.coerce.number().int().min(0).max(1000);

/** Admin app cards: metadata typed in by hand, publishing, hiding and media. */
@Controller('admin/apps')
@Roles('admin')
export class AppsController {
  constructor(private readonly apps: AdminAppsService) {}

  @Get()
  list(@Query() query: unknown): Promise<Page<AdminAppListItem>> {
    return this.apps.list(adminAppsQuerySchema.parse(query));
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<AdminAppDetail> {
    return this.apps.get(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(zodBody(updateAppSchema)) body: UpdateApp,
    @Req() req: HttpReq,
  ): Promise<AdminAppDetail> {
    return this.apps.update(id, body, actor(req));
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(@Param('id') id: string, @Req() req: HttpReq): Promise<AdminAppDetail> {
    return this.apps.publish(id, actor(req));
  }

  @Post(':id/hide')
  @HttpCode(200)
  hide(
    @Param('id') id: string,
    @Body(zodBody(hideAppSchema)) body: HideApp,
    @Req() req: HttpReq,
  ): Promise<AdminAppDetail> {
    return this.apps.hide(id, body.reason, actor(req));
  }

  @Post(':id/unhide')
  @HttpCode(200)
  unhide(@Param('id') id: string, @Req() req: HttpReq): Promise<AdminAppDetail> {
    return this.apps.unhide(id, actor(req));
  }

  @Post(':id/media/:kind')
  @HttpCode(200)
  presignMedia(
    @Param('id') id: string,
    @Param('kind') kind: string,
    @Body(zodBody(presignMediaSchema)) body: PresignMedia,
  ): Promise<MediaUploadTicket> {
    return this.apps.presignMedia(id, mediaKindSchema.parse(kind), body);
  }

  @Post(':id/media/:kind/commit')
  @HttpCode(200)
  commitMedia(
    @Param('id') id: string,
    @Param('kind') kind: string,
    @Body(zodBody(commitMediaSchema)) body: CommitMedia,
    @Req() req: HttpReq,
  ): Promise<AdminAppDetail> {
    return this.apps.commitMedia(id, mediaKindSchema.parse(kind), body.key, actor(req));
  }

  @Delete(':id/screenshots/:index')
  deleteScreenshot(
    @Param('id') id: string,
    @Param('index') index: string,
    @Req() req: HttpReq,
  ): Promise<AdminAppDetail> {
    return this.apps.deleteScreenshot(id, indexSchema.parse(index), actor(req));
  }

  @Put(':id/screenshots/order')
  orderScreenshots(
    @Param('id') id: string,
    @Body(zodBody(screenshotOrderSchema)) body: ScreenshotOrder,
    @Req() req: HttpReq,
  ): Promise<AdminAppDetail> {
    return this.apps.orderScreenshots(id, body.keys, actor(req));
  }

  @Get(':id/versions')
  versions(@Param('id') id: string): Promise<AdminVersion[]> {
    return this.apps.versions(id);
  }
}
