import { expect, type Page, type TestInfo } from '@playwright/test';
import { formatRuDate } from '@xstore/shared';

// Purchase flow helpers for the fake payment provider (`PAYMENT_PROVIDER=fake`,
// `XSTORE_DEV_PAGES=1`, plan `month` from seed:e2e). Each test buys with its own address, so
// tests never share an account and Mailpit is read per recipient.

const DAY_MS = 24 * 60 * 60 * 1000;

/** A unique buyer address per test, project and retry. */
export function buyerEmail(info: TestInfo, tag: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${tag}-${info.project.name}-${info.retry}-${Date.now()}-${random}@xstorex.test`;
}

/**
 * The end of a term bought now, as the site prints it. Two values around midnight in Moscow,
 * computed before and after the payment, so a test that crosses midnight still matches.
 */
export function termEndingFrom(before: number, after = Date.now()): RegExp {
  const dates = new Set([
    formatRuDate(new Date(before + 30 * DAY_MS)),
    formatRuDate(new Date(after + 30 * DAY_MS)),
  ]);
  return new RegExp(`Доступ активен до (${[...dates].join('|')})$`);
}

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/** «18 декабря 2026» → the UTC midnight of that calendar day (only for day arithmetic). */
export function parseRuDate(text: string): number {
  const m = text.match(/(\d{1,2}) ([а-я]+) (\d{4})/);
  if (!m) throw new Error(`no Russian date in «${text}»`);
  const month = MONTHS.indexOf(m[2] as string);
  if (month < 0) throw new Error(`unknown month in «${text}»`);
  return Date.UTC(Number(m[3]), month, Number(m[1]));
}

/** Days between two printed dates. */
export const daysBetween = (from: string, to: string) =>
  Math.round((parseRuDate(to) - parseRuDate(from)) / DAY_MS);

/** On `/get`: email, consent and «Оплатить», then «Оплатить» on the fake payment page. */
export async function payOnGetPage(page: Page, email?: string): Promise<void> {
  await expect(page).toHaveURL(/\/get(\?|$)/);
  const input = page.getByLabel('Почта', { exact: true });
  if (email !== undefined) await input.fill(email);
  else await expect(input).not.toHaveValue('');
  await page.getByRole('checkbox', { name: /Согласен с/ }).check();
  await page.getByRole('button', { name: /^Оплатить / }).click();

  await expect(page).toHaveURL(/\/dev\/pay\//);
  await expect(page.getByRole('heading', { name: 'Тестовая оплата' })).toBeVisible();
  await page.getByRole('button', { name: 'Оплатить', exact: true }).click();
  await expect(page).toHaveURL(/\/get\/[^/?#]+$/);
}

/** The wizard after payment: «Доступ активен до <дата>». Returns the printed date. */
export async function paidUntil(page: Page): Promise<string> {
  const heading = page.getByRole('heading', { level: 1, name: /^Доступ активен до / });
  await expect(heading).toBeVisible({ timeout: 15_000 });
  return ((await heading.textContent()) ?? '').replace('Доступ активен до ', '').trim();
}

/** A guest buys access from `/get` and skips the password. Returns the printed end date. */
export async function buyAsGuest(page: Page, email: string): Promise<string> {
  await page.goto('/get');
  await payOnGetPage(page, email);
  return paidUntil(page);
}

/** The date on «Мой доступ». */
export async function accessUntil(page: Page): Promise<string> {
  const term = page.getByRole('region', { name: 'Срок доступа' });
  const heading = term.getByRole('heading', { name: /^Доступ активен до / });
  await expect(heading).toBeVisible();
  return ((await heading.textContent()) ?? '').replace('Доступ активен до ', '').trim();
}

// ---------------------------------------------------------------------------------------------
// Mailpit (`MAILPIT_API_URL`, by default the local one). Never cleared: tests read only the
// letters of their own recipient.

type Letter = { subject: string; text: string };

const mailpit = () => (process.env.MAILPIT_API_URL ?? 'http://127.0.0.1:8025').replace(/\/$/, '');

async function lettersTo(to: string): Promise<Letter[]> {
  const query = encodeURIComponent(`to:"${to}"`);
  const res = await fetch(`${mailpit()}/api/v1/search?query=${query}&limit=50`);
  if (!res.ok) throw new Error(`Mailpit search failed: ${res.status}`);
  const body = (await res.json()) as { messages: { ID: string }[] };
  const out: Letter[] = [];
  for (const { ID } of body.messages.toReversed()) {
    const msg = await fetch(`${mailpit()}/api/v1/message/${ID}`);
    if (!msg.ok) throw new Error(`Mailpit message failed: ${msg.status}`);
    const m = (await msg.json()) as { Subject: string; Text: string };
    out.push({ subject: m.Subject, text: m.Text });
  }
  return out;
}

/** Waits for a letter to `to` with this subject and returns the newest one. */
export async function waitForLetter(to: string, subject: string | RegExp): Promise<Letter> {
  let found: Letter | undefined;
  await expect
    .poll(
      async () => {
        const all = await lettersTo(to);
        found = all
          .filter((l) =>
            typeof subject === 'string' ? l.subject === subject : subject.test(l.subject),
          )
          .at(-1);
        return found !== undefined;
      },
      { timeout: 15_000, message: `letter «${subject}» to ${to}` },
    )
    .toBe(true);
  return found as Letter;
}

/** The 6-digit code from the newest «Код для входа» letter. */
export async function loginCode(to: string): Promise<string> {
  const letter = await waitForLetter(to, 'Код для входа');
  const code = letter.text.match(/Ваш код: (\d{6})/)?.[1];
  if (!code) throw new Error('no code in the letter');
  return code;
}
