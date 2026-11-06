import type { UploadView } from '@xstore/shared';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createResumeStore } from './resume-store';
import { type UploadApi, uploadIpa } from './upload-ipa';

const file = new File(['abcdefghijkl'], 'Тест.ipa', { lastModified: 123 });
const view: UploadView = {
  id: 'up',
  fileName: file.name,
  sizeBytes: 12,
  partSize: 4,
  status: 'uploading',
};
let puts: string[];
let fail: boolean;
let abortOnSend: (() => void) | undefined;

class FakeXHR {
  upload = { onprogress: null as ((e: { loaded: number }) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  status = 200;
  url = '';
  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader() {}
  getResponseHeader() {
    return `"etag-${this.url}"`;
  }
  abort() {
    this.onabort?.();
  }
  send(body: Blob) {
    puts.push(this.url);
    if (abortOnSend) {
      abortOnSend();
      return;
    }
    queueMicrotask(() => {
      this.upload.onprogress?.({ loaded: body.size });
      if (fail) this.onerror?.();
      else this.onload?.();
    });
  }
}

function api(parts: { partNumber: number; etag: string; size: number }[] = []): UploadApi {
  return {
    create: vi.fn(async () => view),
    get: vi.fn(async () => view),
    listParts: vi.fn(async () => ({ parts })),
    presign: vi.fn(async (_id: string, ns: number[]) => ({
      urls: ns.map((partNumber) => ({ partNumber, url: String(partNumber) })),
    })),
    complete: vi.fn(
      async (_id: string, input: { parts: { partNumber: number; etag: string }[] }) => {
        expect(input.parts).toHaveLength(3);
        return { ...view, status: 'uploaded' as const };
      },
    ),
  };
}

beforeEach(() => {
  puts = [];
  fail = false;
  abortOnSend = undefined;
  localStorage.clear();
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('uploads all parts and completes with full progress', async () => {
  const onProgress = vi.fn();
  const result = await uploadIpa(file, { api: api(), onProgress });
  expect(result.status).toBe('uploaded');
  expect(puts.sort()).toEqual(['1', '2', '3']);
  expect(onProgress).toHaveBeenLastCalledWith(12, 12);
});

it('resumes from listed parts and keeps the saved id until inspection finishes', async () => {
  const resume = createResumeStore('staff-a');
  resume.set(file, 'up');
  const client = api([
    { partNumber: 1, etag: 'one', size: 4 },
    { partNumber: 2, etag: 'two', size: 4 },
  ]);
  await uploadIpa(file, { api: client, onProgress: () => {}, resume });
  expect(puts).toEqual(['3']);
  expect(client.presign).toHaveBeenCalledWith('up', [3], expect.anything());
  expect(resume.get(file)).toBe('up');
  expect(createResumeStore('staff-b').get(file)).toBeNull();
});

it('reuses a completed upload after reload while inspection is still pending', async () => {
  const resume = createResumeStore('staff-a');
  resume.set(file, 'up');
  const client = api();
  client.get = async () => ({ ...view, status: 'inspecting' });
  expect((await uploadIpa(file, { api: client, resume, onProgress: () => {} })).status).toBe(
    'inspecting',
  );
  expect(puts).toEqual([]);
  expect(resume.get(file)).toBe('up');
});

it('resuming an uploaded file restores the inspection job through idempotent complete', async () => {
  const resume = createResumeStore('staff-a');
  resume.set(file, 'up');
  const client = api();
  client.get = async () => ({ ...view, status: 'uploaded' });
  client.complete = vi.fn(async () => ({ ...view, status: 'uploaded' as const }));
  await uploadIpa(file, { api: client, resume, onProgress: () => {} });
  expect(client.complete).toHaveBeenCalledWith('up', { parts: [] }, expect.anything());
  expect(puts).toEqual([]);
  expect(resume.get(file)).toBe('up');
});

it('retries a failed part three times, then fails without completing', async () => {
  vi.useFakeTimers();
  fail = true;
  const client = api();
  const pending = uploadIpa(file, { api: client, onProgress: () => {}, concurrency: 1 });
  const rejected = expect(pending).rejects.toThrow();
  await vi.runAllTimersAsync();
  await rejected;
  expect(puts).toEqual(['1', '1', '1', '1']);
  expect(client.complete).not.toHaveBeenCalled();
});

it('abort stops further parts and preserves the resume id', async () => {
  const signal = new AbortController();
  const resume = createResumeStore('staff-a');
  abortOnSend = () => signal.abort();
  await expect(
    uploadIpa(file, {
      api: api(),
      onProgress: () => {},
      signal: signal.signal,
      concurrency: 1,
      resume,
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(puts).toEqual(['1']);
  expect(resume.get(file)).toBe('up');
});

it('a failed parallel part aborts the other active transfer', async () => {
  vi.useFakeTimers();
  fail = true;
  const pending = uploadIpa(file, { api: api(), onProgress: () => {}, concurrency: 2 });
  const rejected = expect(pending).rejects.toThrow();
  await vi.runAllTimersAsync();
  await rejected;
  expect(puts).not.toContain('3');
});
