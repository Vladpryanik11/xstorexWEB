import type { NotificationJob } from '@xstore/shared';

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char] ?? char,
  );
}

export function renderEmail(job: NotificationJob): { subject: string; text: string; html: string } {
  const text = `Ваш код: ${job.vars.code}. Он действует 10 минут. Если вы не запрашивали код, просто удалите это письмо.`;
  return {
    subject: 'Код для входа в Xstore',
    text,
    html: `<p>Ваш код: <strong>${escapeHtml(job.vars.code)}</strong>.</p><p>Он действует 10 минут. Если вы не запрашивали код, просто удалите это письмо.</p>`,
  };
}
