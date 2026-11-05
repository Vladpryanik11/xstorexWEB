import nodemailer from 'nodemailer';
import type { WorkerConfig } from '../config.js';

export function createMailer(config: Pick<WorkerConfig, 'smtpUrl'>) {
  return nodemailer.createTransport({
    url: config.smtpUrl,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });
}
