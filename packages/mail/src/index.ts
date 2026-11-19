export {
  createSmtpMailer,
  type MailConfig,
  type MailDeps,
  type Mailer,
  type MailLogger,
  type OutgoingMail,
  type SendStatus,
  sendMail,
  sendPaymentPaid,
} from './send.js';
export { type MailData, type MailTemplate, type RenderedMail, renderMail } from './templates.js';
