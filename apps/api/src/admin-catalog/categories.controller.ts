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
  type AdminCategory,
  type CreateCategory,
  createCategorySchema,
  type IdOrder,
  idOrderSchema,
  type UpdateCategory,
  updateCategorySchema,
} from '@xstore/shared';
import { Roles } from '../auth/roles.decorator.js';
import { actor } from '../common/actor.js';
import type { HttpReq } from '../common/http.js';
import { zodBody } from '../common/zod-body.js';
import { TaxonomyService } from './taxonomy.service.js';

@Controller('admin/categories')
@Roles('admin')
export class CategoriesController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Get()
  list(): Promise<AdminCategory[]> {
    return this.taxonomy.categories();
  }

  @Post()
  create(
    @Body(zodBody(createCategorySchema)) body: CreateCategory,
    @Req() req: HttpReq,
  ): Promise<AdminCategory> {
    return this.taxonomy.createCategory(body, actor(req));
  }

  @Put('order')
  order(
    @Body(zodBody(idOrderSchema)) body: IdOrder,
    @Req() req: HttpReq,
  ): Promise<AdminCategory[]> {
    return this.taxonomy.orderCategories(body.ids, actor(req));
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(zodBody(updateCategorySchema)) body: UpdateCategory,
    @Req() req: HttpReq,
  ): Promise<AdminCategory> {
    return this.taxonomy.updateCategory(id, body, actor(req));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: HttpReq): Promise<void> {
    return this.taxonomy.deleteCategory(id, actor(req));
  }
}
