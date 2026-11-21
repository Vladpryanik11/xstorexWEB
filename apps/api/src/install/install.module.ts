import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { InstallController } from './install.controller.js';
import { InstallService } from './install.service.js';

/** Н4: install requests, signing progress for the site, one-time links and OTA manifests. */
@Module({
  imports: [AuthModule],
  controllers: [InstallController],
  providers: [InstallService],
})
export class InstallModule {}
