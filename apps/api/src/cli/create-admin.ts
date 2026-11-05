import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createPrismaClient } from '@xstore/db';
import { upsertAdmin } from './admin-account.js';

/** Reads one line from stdin; on a terminal the input is not echoed. */
async function readPassword(prompt: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    let data = '';
    for await (const chunk of stdin) data += chunk;
    return data.split(/\r?\n/)[0] ?? '';
  }
  process.stderr.write(prompt);
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const done = (result: string | Error): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      process.stderr.write('\n');
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          done(value);
          return;
        }
        if (ch === '\u0003') {
          done(new Error('Отменено'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
    stdin.resume();
  });
}

async function main(): Promise<void> {
  const rootEnv = fileURLToPath(new URL('../../../../.env', import.meta.url));
  if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: { email: { type: 'string' } },
  });
  if (!values.email) throw new Error('Укажите --email');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL не задан');

  const password = await readPassword('Пароль: ');
  const db = createPrismaClient(url);
  try {
    const result = await upsertAdmin(db, values.email, password);
    process.stdout.write(
      `${result.created ? 'Админ создан' : 'Админ обновлён, старые сессии закрыты'}.\n` +
        'Добавьте ключ в приложение-аутентификатор. Он показывается один раз:\n' +
        `${result.otpauthUri}\n`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : 'Ошибка'}\n`);
  process.exitCode = 1;
});
