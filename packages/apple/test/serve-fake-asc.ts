import { startFakeAsc } from './fake-asc.ts';

const fake = await startFakeAsc(3199);
console.log(`Fake ASC: ${fake.url}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void fake.close().then(() => process.exit(0));
  });
}
