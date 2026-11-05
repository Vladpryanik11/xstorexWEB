import { Module } from '@nestjs/common';
import { AdminAppsService } from './admin-apps.service.js';
import { AppsController } from './apps.controller.js';
import { CategoriesController } from './categories.controller.js';
import { CollectionsController } from './collections.controller.js';
import { TaxonomyService } from './taxonomy.service.js';
import { VersionsController } from './versions.controller.js';

/** `/admin/*` catalog management; every endpoint is admin-only and every mutation is audited. */
@Module({
  controllers: [AppsController, VersionsController, CategoriesController, CollectionsController],
  providers: [AdminAppsService, TaxonomyService],
})
export class AdminCatalogModule {}
