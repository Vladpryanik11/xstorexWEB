import { Module } from '@nestjs/common';
import { EnrollmentController } from './enrollment.controller.js';

@Module({ controllers: [EnrollmentController] })
export class EnrollmentModule {}
