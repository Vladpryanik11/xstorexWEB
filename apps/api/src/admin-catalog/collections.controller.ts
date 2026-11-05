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
  Req,
} from '@nestjs/common';
import {
  type AdminCollection,
  type CollectionItems,
  type CreateCollection,
  collectionItemsSchema,
  createCollectionSchema,
  type IdOrder,
  idOrderSchema,
  type UpdateCollection,
  updateCollectionSchema,
} from '@xstore/shared';
import { Roles } from '../auth/roles.decorator.js';
import { actor } from '../common/actor.js';
import type { HttpReq } from '../common/http.js';
import { zodBody } from '../common/zod-body.js';
import { TaxonomyService } from './taxonomy.service.js';

@Controller('admin/collections')
@Roles('admin')
export class CollectionsController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Get()
  list(): Promise<AdminCollection[]> {
    return this.taxonomy.collections();
  }

  @Post()
  create(
    @Body(zodBody(createCollectionSchema)) body: CreateCollection,
    @Req() req: HttpReq,
  ): Promise<AdminCollection> {
    return this.taxonomy.createCollection(body, actor(req));
  }

  @Put('order')
  order(
    @Body(zodBody(idOrderSchema)) body: IdOrder,
    @Req() req: HttpReq,
  ): Promise<AdminCollection[]> {
    return this.taxonomy.orderCollections(body.ids, actor(req));
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(zodBody(updateCollectionSchema)) body: UpdateCollection,
    @Req() req: HttpReq,
  ): Promise<AdminCollection> {
    return this.taxonomy.updateCollection(id, body, actor(req));
  }

  @Put(':id/items')
  items(
    @Param('id') id: string,
    @Body(zodBody(collectionItemsSchema)) body: CollectionItems,
    @Req() req: HttpReq,
  ): Promise<AdminCollection> {
    return this.taxonomy.setItems(id, body, actor(req));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: HttpReq): Promise<void> {
    return this.taxonomy.deleteCollection(id, actor(req));
  }
}
