import type {
  CompleteUpload,
  CreateUpload,
  PresignedParts,
  UploadedParts,
  UploadView,
} from '@xstore/shared';
import type { ResumeStore } from './resume-store';

export type UploadApi = {
  create(input: CreateUpload, signal?: AbortSignal): Promise<UploadView>;
  get(id: string, signal?: AbortSignal): Promise<UploadView>;
  listParts(id: string, signal?: AbortSignal): Promise<UploadedParts>;
  presign(id: string, partNumbers: number[], signal?: AbortSignal): Promise<PresignedParts>;
  complete(id: string, input: CompleteUpload, signal?: AbortSignal): Promise<UploadView>;
};

const aborted = () => new DOMException('Загрузка приостановлена', 'AbortError');
function check(signal: AbortSignal) {
  if (signal.aborted) throw aborted();
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  check(signal);
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      reject(aborted());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, ms);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

function put(
  url: string,
  body: Blob,
  signal: AbortSignal,
  progress: (sent: number) => void,
): Promise<string> {
  check(signal);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const cancel = () => xhr.abort();
    const done = (error?: Error, etag?: string) => {
      signal.removeEventListener('abort', cancel);
      if (error) reject(error);
      else resolve(etag ?? '');
    };
    xhr.open('PUT', url);
    xhr.timeout = 600_000;
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => progress(Math.min(e.loaded, body.size));
    xhr.onload = () => {
      const etag = xhr.getResponseHeader('ETag');
      if (xhr.status >= 200 && xhr.status < 300 && etag) done(undefined, etag);
      else done(new Error('Не удалось загрузить часть файла. Попробуйте продолжить загрузку.'));
    };
    xhr.onerror = xhr.ontimeout = () =>
      done(new Error('Соединение прервано. Можно продолжить загрузку.'));
    xhr.onabort = () => done(aborted());
    signal.addEventListener('abort', cancel, { once: true });
    xhr.send(body);
  });
}

/** A resumable upload: stored IDs survive reloads; MinIO is the authority for completed parts. */
export async function uploadIpa(
  file: File,
  opts: {
    api: UploadApi;
    onProgress: (sent: number, total: number) => void;
    signal?: AbortSignal;
    concurrency?: number;
    resume?: ResumeStore;
  },
): Promise<UploadView> {
  const controller = new AbortController();
  const signal = controller.signal;
  const cancel = () => controller.abort();
  opts.signal?.addEventListener('abort', cancel, { once: true });
  if (opts.signal?.aborted) cancel();
  const { api, resume } = opts;
  try {
    check(signal);
    const saved = resume?.get(file);
    let upload: UploadView | undefined;
    if (saved) {
      try {
        upload = await api.get(saved, signal);
      } catch (err) {
        // Only a deleted upload is stale. Keep IDs on network/server/authentication errors.
        if ((err as { status?: number }).status !== 404) throw err;
        resume?.remove(file);
      }
    }
    if (upload?.status === 'expired' || upload?.status === 'rejected') {
      resume?.remove(file);
      upload = undefined;
    }
    upload ??= await api.create({ fileName: file.name, sizeBytes: file.size }, signal);
    const { id, partSize } = upload;
    resume?.set(file, id);
    if (upload.status === 'uploaded') upload = await api.complete(id, { parts: [] }, signal);
    if (upload.status !== 'uploading') {
      if (upload.status === 'ready') resume?.remove(file);
      return upload;
    }
    if (partSize <= 0 || upload.sizeBytes !== file.size)
      throw new Error('Параметры файла не совпадают с сохранённой загрузкой.');
    const count = Math.ceil(file.size / partSize);
    const listed = await api.listParts(id, signal);
    const etags = new Map<number, string>();
    const bytes = new Map<number, number>();
    const partBytes = (n: number) => Math.min(partSize, file.size - (n - 1) * partSize);
    for (const p of listed.parts) {
      if (p.partNumber >= 1 && p.partNumber <= count && p.size === partBytes(p.partNumber)) {
        etags.set(p.partNumber, p.etag);
        bytes.set(p.partNumber, p.size);
      }
    }
    const report = () =>
      opts.onProgress(
        Math.min(
          file.size,
          [...bytes.values()].reduce((a, b) => a + b, 0),
        ),
        file.size,
      );
    report();
    const missing = Array.from({ length: count }, (_, i) => i + 1).filter((n) => !etags.has(n));
    const concurrency = Math.max(1, Math.min(8, Math.floor(opts.concurrency ?? 4) || 4));
    for (let at = 0; at < missing.length; at += 10) {
      check(signal);
      const batch = missing.slice(at, at + 10);
      const { urls } = await api.presign(id, batch, signal);
      let next = 0;
      const transfer = async () => {
        while (next < batch.length) {
          check(signal);
          const n = batch[next++];
          if (n === undefined) return;
          let url = urls.find((p) => p.partNumber === n)?.url;
          if (!url) throw new Error('Не получена ссылка для загрузки.');
          const body = file.slice((n - 1) * partSize, n * partSize);
          for (let attempt = 0; ; attempt++) {
            try {
              const etag = await put(url, body, signal, (sent) => {
                bytes.set(n, sent);
                report();
              });
              etags.set(n, etag);
              bytes.set(n, body.size);
              report();
              break;
            } catch (err) {
              check(signal);
              bytes.set(n, 0);
              report();
              if (attempt === 3) throw err;
              await pause(1000 * 2 ** attempt, signal);
              url = (await api.presign(id, [n], signal)).urls[0]?.url;
              if (!url) throw new Error('Не получена ссылка для загрузки.');
            }
          }
        }
      };
      // Cancel sibling transfers immediately, then wait for all to settle before returning.
      await Promise.all(
        Array.from({ length: Math.min(concurrency, batch.length) }, async () => {
          try {
            await transfer();
          } catch (err) {
            controller.abort();
            throw err;
          }
        }),
      );
    }
    check(signal);
    const result = await api.complete(
      id,
      {
        parts: [...etags]
          .sort(([a], [b]) => a - b)
          .map(([partNumber, etag]) => ({ partNumber, etag })),
      },
      signal,
    );
    if (result.status === 'ready' || result.status === 'rejected') resume?.remove(file);
    return result;
  } finally {
    controller.abort();
    opts.signal?.removeEventListener('abort', cancel);
  }
}
