/**
 * Mailpit helpers for integration tests. Suites share one Mailpit and never clear it: each test
 * reads only the letters of its own unique recipient.
 */

export type CapturedMail = { id: string; subject: string; text: string };

const apiUrl = () => (process.env.MAILPIT_API_URL ?? 'http://127.0.0.1:8025').replace(/\/$/, '');

/** SMTP of the test Mailpit (`SMTP_URL_TEST`, by default 127.0.0.1:1025). */
export const testSmtpUrl = (): string => process.env.SMTP_URL_TEST ?? 'smtp://127.0.0.1:1025';

/** Letters to `to`, oldest first, with their plain text. */
export async function mailpitMessages(to: string): Promise<CapturedMail[]> {
  const query = encodeURIComponent(`to:"${to}"`);
  const res = await fetch(`${apiUrl()}/api/v1/search?query=${query}&limit=50`);
  if (!res.ok) throw new Error(`Mailpit search failed: ${res.status}`);
  const body = (await res.json()) as { messages: { ID: string }[] };
  const out: CapturedMail[] = [];
  for (const { ID } of body.messages.toReversed()) {
    const msg = await fetch(`${apiUrl()}/api/v1/message/${ID}`);
    if (!msg.ok) throw new Error(`Mailpit message failed: ${msg.status}`);
    const m = (await msg.json()) as { ID: string; Subject: string; Text: string };
    out.push({ id: m.ID, subject: m.Subject, text: m.Text });
  }
  return out;
}

/** Waits until `to` has at least `count` letters (5 s by default). */
export async function waitForMail(
  to: string,
  count = 1,
  timeoutMs = 5_000,
): Promise<CapturedMail[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = await mailpitMessages(to);
    if (found.length >= count) return found;
    if (Date.now() > deadline) throw new Error(`no mail for ${to}: ${found.length}/${count}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}
