import { setTimeout } from 'node:timers/promises';

export const mailpitUrl = () => process.env.MAILPIT_API ?? 'http://127.0.0.1:8025';

export async function mailpitCode(email: string): Promise<string> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const list = await (await fetch(`${mailpitUrl()}/api/v1/messages`)).json();
    const summary = list.messages?.find((mail: { To?: { Address: string }[] }) =>
      mail.To?.some((to) => to.Address.toLowerCase() === email.toLowerCase()),
    );
    if (summary) {
      const mail = await (await fetch(`${mailpitUrl()}/api/v1/message/${summary.ID}`)).json();
      const code = /Ваш код: (\d{6})/.exec(mail.Text)?.[1];
      if (code) return code;
    }
    await setTimeout(50);
  }
  throw new Error('Test SMTP code was not delivered within 10 seconds');
}
