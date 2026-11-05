import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EnrollService } from './enroll.service.js';
import { EnrollmentController } from './enrollment.controller.js';

@Module({ imports: [AuthModule], controllers: [EnrollmentController], providers: [EnrollService] })
export class EnrollmentModule {}
