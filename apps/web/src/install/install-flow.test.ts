import { describe, expect, it } from 'vitest';
import { flowText, type InstallFlow, installReducer, ringTarget } from './install-flow';

const IDLE: InstallFlow = { kind: 'idle' };

describe('installReducer', () => {
  it('a tap starts at «Проверяем доступ»', () => {
    const s = installReducer(IDLE, { type: 'start' });
    expect(s).toEqual({ kind: 'working', jobId: '', stage: 'queued' });
    expect(flowText(s)).toBe('Проверяем доступ');
  });

  it('stages move the ring forward only', () => {
    let s = installReducer(IDLE, { type: 'start' });
    s = installReducer(s, { type: 'stage', jobId: 'j', stage: 'signing' });
    expect(flowText(s)).toBe('Подписываем сертификатом вашего iPhone');
    s = installReducer(s, { type: 'stage', jobId: 'j', stage: 'downloading' });
    expect(s).toEqual({ kind: 'working', jobId: 'j', stage: 'signing' });
    s = installReducer(s, { type: 'stage', jobId: 'j', stage: 'uploading' });
    expect(flowText(s)).toBe('Упаковываем');
  });

  it('a failed signing offers a retry message', () => {
    const s = installReducer(
      { kind: 'working', jobId: 'j', stage: 'signing' },
      { type: 'stage', jobId: 'j', stage: 'failed' },
    );
    expect(s).toEqual({ kind: 'failed', message: 'Не получилось подготовить приложение' });
  });

  it('warns before replacing the previous app', () => {
    const s = installReducer(IDLE, { type: 'replaces', previous: 'Первое' });
    expect(flowText(s)).toBe('Это приложение заменит «Первое» на iPhone');
    expect(installReducer(s, { type: 'cancel' })).toEqual(IDLE);
  });

  it('the link tells to confirm in the iPhone window', () => {
    const s = installReducer(IDLE, { type: 'link', itmsUrl: 'itms-services://?x' });
    expect(flowText(s)).toBe('Нажмите «Установить» в окне iPhone');
  });
});

describe('ringTarget', () => {
  it('creeps short of each stage end and fills at ready', () => {
    expect(ringTarget('signing').percent).toBeLessThan(80);
    expect(ringTarget('signing').percent).toBeGreaterThan(30);
    expect(ringTarget('uploading').percent).toBeGreaterThan(ringTarget('signing').percent);
    expect(ringTarget('ready')).toEqual({ percent: 100, durationMs: 400 });
  });
});
