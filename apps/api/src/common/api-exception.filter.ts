import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ZodError } from 'zod';
import { DomainError } from './domain-error.js';
import { toApiError } from './to-api-error.js';

type Res = { status(code: number): { json(body: unknown): unknown } };

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(err: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const { status, body } = toApiError(err);
    const expected =
      err instanceof HttpException || err instanceof DomainError || err instanceof ZodError;
    if (status >= 500 || !expected) {
      const req = http.getRequest<{ id?: unknown }>();
      this.logger.error({ err, reqId: req.id }, 'Unhandled error');
    }
    http.getResponse<Res>().status(status).json(body);
  }
}
