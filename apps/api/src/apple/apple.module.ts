import { type DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MailModule } from '../mail/mail.module.js';
import { DeviceCertificatesController } from './device-certificates.controller.js';
import { DeviceCertificatesService } from './device-certificates.service.js';
import { DeviceWaitingNotifier } from './device-waiting.notifier.js';
import { OCSP_OPTIONS, type OcspOptions } from './ocsp.provider.js';

/**
 * Supplier certificates (`/admin/devices/*`, admin only). The only API module allowed to import
 * `@xstore/secrets/decrypt` (Biome rule).
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic modules are configured through a static forRoot
export class AppleModule {
  static forRoot(ocsp: OcspOptions = {}): DynamicModule {
    return {
      module: AppleModule,
      global: true,
      imports: [AuthModule, MailModule],
      controllers: [DeviceCertificatesController],
      providers: [
        { provide: OCSP_OPTIONS, useValue: ocsp },
        DeviceCertificatesService,
        DeviceWaitingNotifier,
      ],
      exports: [DeviceWaitingNotifier],
    };
  }
}
