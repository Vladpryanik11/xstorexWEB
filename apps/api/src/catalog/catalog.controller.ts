import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import type {
  AppCard,
  AppDetail,
  CategoryView,
  CollectionView,
  HomeView,
  Page,
} from '@xstore/shared';
import { CatalogService } from './catalog.service.js';

/** Public catalog pages are cached by the CDN and the browser for a minute. */
export const CATALOG_CACHE = 'public, max-age=60, stale-while-revalidate=300';

/** Public catalog: only published apps with a published version. */
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('home')
  @Header('Cache-Control', CATALOG_CACHE)
  home(): Promise<HomeView> {
    return this.catalog.home();
  }

  @Get('apps/:slug')
  @Header('Cache-Control', CATALOG_CACHE)
  app(@Param('slug') slug: string): Promise<AppDetail> {
    return this.catalog.app(slug);
  }

  @Get('categories')
  @Header('Cache-Control', CATALOG_CACHE)
  categories(): Promise<CategoryView[]> {
    return this.catalog.categories();
  }

  @Get('categories/:slug')
  @Header('Cache-Control', CATALOG_CACHE)
  category(@Param('slug') slug: string, @Query('cursor') cursor: unknown): Promise<Page<AppCard>> {
    return this.catalog.category(slug, cursor);
  }

  @Get('lists/:slug')
  @Header('Cache-Control', CATALOG_CACHE)
  list(@Param('slug') slug: string): Promise<CollectionView> {
    return this.catalog.list(slug);
  }

  @Get('search')
  @Header('Cache-Control', CATALOG_CACHE)
  search(@Query('q') q: unknown, @Query('cursor') cursor: unknown): Promise<Page<AppCard>> {
    return this.catalog.search(q, cursor);
  }
}
