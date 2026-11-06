'use client';
import { errorMessages } from '@xstore/shared';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import s from '../admin/admin.module.css';
import { adminRequest, errorText } from '../admin/api';
import { createResumeStore } from './resume-store';
import { type UploadApi, uploadIpa } from './upload-ipa';

const api: UploadApi = {
  create: (input, signal) =>
    adminRequest('/admin/uploads', { method: 'POST', body: JSON.stringify(input), signal }),
  get: (id, signal) => adminRequest(`/admin/uploads/${id}`, { signal }),
  listParts: (id, signal) => adminRequest(`/admin/uploads/${id}/parts`, { signal }),
  presign: (id, partNumbers, signal) =>
    adminRequest(`/admin/uploads/${id}/parts`, {
      method: 'POST',
      body: JSON.stringify({ partNumbers }),
      signal,
    }),
  complete: (id, input, signal) =>
    adminRequest(`/admin/uploads/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    }),
};

type Row = {
  key: string;
  file: File;
  progress: number;
  text: string;
  running: boolean;
  appId?: string;
  uploadId?: string;
};
function wait(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Приостановлено', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, 2000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

export function UploadDropzone({ ownerId }: { ownerId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const active = useRef(new Map<string, AbortController>());
  useEffect(
    () => () => {
      for (const c of active.current.values()) c.abort();
    },
    [],
  );
  const update = (key: string, patch: Partial<Row>) =>
    setRows((items) => items.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  async function start(file: File, key: string) {
    if (active.current.has(key)) return;
    const controller = new AbortController();
    active.current.set(key, controller);
    const resume = createResumeStore(ownerId);
    update(key, { running: true, text: 'Загружается 0%' });
    try {
      let result = await uploadIpa(file, {
        api,
        signal: controller.signal,
        resume,
        onProgress: (sent, total) =>
          update(key, {
            progress: sent / total,
            text: `Загружается ${Math.floor((sent / total) * 100)}%`,
          }),
      });
      update(key, { uploadId: result.id });
      while (result.status === 'uploaded' || result.status === 'inspecting') {
        update(key, { text: 'Проверяем…', progress: 1 });
        await wait(controller.signal);
        result = await api.get(result.id, controller.signal);
      }
      if (result.status === 'ready') {
        resume.remove(file);
        update(key, { text: 'Готово', progress: 1, appId: result.appId });
      } else {
        resume.remove(file);
        update(key, {
          text:
            result.rejectCode && result.rejectCode in errorMessages
              ? errorMessages[result.rejectCode as keyof typeof errorMessages]
              : 'Файл отклонён. Выберите другой IPA.',
        });
      }
    } catch (err) {
      update(key, {
        text:
          (err as Error).name === 'AbortError'
            ? 'Приостановлено. Можно продолжить.'
            : errorText(err),
      });
    } finally {
      active.current.delete(key);
      update(key, { running: false });
    }
  }
  function add(files: File[]) {
    setError('');
    for (const file of files) {
      if (
        !file.name.toLowerCase().endsWith('.ipa') ||
        file.size === 0 ||
        file.size > 10 * 1024 ** 3
      ) {
        setError('Выберите IPA размером до 10 ГБ.');
        continue;
      }
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (active.current.has(key)) continue;
      setRows((items) => [
        ...items.filter((r) => r.key !== key),
        { key, file, progress: 0, text: 'Подготовка…', running: true },
      ]);
      void start(file, key);
    }
  }
  return (
    <>
      <fieldset
        className={s.dropzone}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          add([...e.dataTransfer.files]);
        }}
      >
        <legend>Загрузка IPA</legend>
        <p>Перетащите IPA сюда или выберите файлы. До 10 ГБ на файл.</p>
        <label>
          Выбрать IPA{' '}
          <input
            type="file"
            accept=".ipa"
            multiple
            onChange={(e) => {
              add([...(e.currentTarget.files ?? [])]);
              e.currentTarget.value = '';
            }}
          />
        </label>
        <p className={s.muted}>
          После перезагрузки страницы выберите тот же файл — загрузка продолжится.
        </p>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <ul className={s.items}>
        {rows.map((row) => (
          <li key={row.key} className={s.upload}>
            <span>
              {row.file.name}
              <p role="status">{row.text}</p>
              <progress max="1" value={row.progress} aria-label={`Загрузка ${row.file.name}`} />
            </span>
            {row.appId ? (
              <Link href={`/admin/apps/${row.appId}`}>Открыть приложение</Link>
            ) : row.running ? (
              <button type="button" onClick={() => active.current.get(row.key)?.abort()}>
                Приостановить
              </button>
            ) : (
              <button type="button" onClick={() => void start(row.file, row.key)}>
                Продолжить загрузку
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
