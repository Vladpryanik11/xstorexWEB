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
    const s = installReducer(IDLE, {
      type: 'link',
      jobId: 'j',
      itmsUrl: 'itms-services://?x',
      at: 5,
    });
    expect(s).toEqual({ kind: 'opened', jobId: 'j', itmsUrl: 'itms-services://?x', at: 5 });
    expect(flowText(s)).toBe('Нажмите «Установить» в окне iPhone');
  });

  it('back from the iPhone window says it is installed', () => {
    const opened = installReducer(IDLE, {
      type: 'link',
      jobId: 'j',
      itmsUrl: 'itms-services://?x',
      at: 5,
    });
    const s = installReducer(opened, { type: 'back' });
    expect(s).toEqual({ ...opened, kind: 'installed' });
    expect(flowText(s)).toBe('Установлено. Приложение появится на экране «Домой»');
    // Only an open link turns into «Установлено».
    expect(installReducer(IDLE, { type: 'back' })).toEqual(IDLE);
  });

  it('a refusal from the worker shows its reason, a crash the generic line', () => {
    const working: InstallFlow = { kind: 'working', jobId: 'j', stage: 'queued' };
    expect(
      installReducer(working, {
        type: 'stage',
        jobId: 'j',
        stage: 'failed',
        errorCode: 'DEVICE_NOT_READY',
      }),
    ).toEqual({
      kind: 'failed',
      message: 'iPhone ещё готовится, установка будет доступна чуть позже',
    });
    expect(
      installReducer(working, {
        type: 'stage',
        jobId: 'j',
        stage: 'failed',
        errorCode: 'SIGNING_FAILED',
      }),
    ).toEqual({ kind: 'failed', message: 'Не получилось подготовить приложение' });
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
