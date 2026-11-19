import { type DynamicModule, Module } from '@nestjs/common';
import type { AppConfig } from '../config/config.js';
import { DevDevicesController } from './dev-devices.controller.js';
import { EnrollmentController } from './enrollment.controller.js';
import { EnrollmentService } from './enrollment.service.js';

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic modules are configured through a static forRoot
export class EnrollmentModule {
  /** The dev device route exists only with `XSTORE_DEV_PAGES=1`; otherwise it is a plain 404. */
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: EnrollmentModule,
      controllers: [EnrollmentController, ...(config.devPages ? [DevDevicesController] : [])],
      providers: [EnrollmentService],
    };
  }
}
