'use client';
import {
  type AdminAppListItem,
  type AdminCategory,
  errorMessages,
  type UploadListItem,
} from '@xstore/shared';
import { toast } from '@xstore/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createResumeStore } from '../../upload/resume-store';
import { type UploadApi, uploadIpa } from '../../upload/upload-ipa';
import { adminRequest, errorText, mutate } from '../api';
import { AppRow } from './AppRow';
import s from './apps.module.css';

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

const MAX_IPA = 10 * 1024 ** 3;

/** A turned-down file: what went wrong and what to do (spec 2026-11-24 §2). */
export function rejectText(code: string | null): string {
  const reason =
    code && code in errorMessages
      ? errorMessages[code as keyof typeof errorMessages]
      : 'Не удалось прочитать файл';
  const lower = reason.charAt(0).toLowerCase() + reason.slice(1);
  return code === 'DUPLICATE_VERSION'
    ? `Не подошло: ${lower}`
    : `Не подошло: ${lower}. Загрузите другой IPA`;
}

type Local = {
  key: string;
  file: File;
  progress: number;
  text: string;
  running: boolean;
  uploadId?: string;
  failed?: boolean;
};

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Приостановлено', 'AbortError'));
      },
      { once: true },
    );
  });

export type AppsBoardProps = {
  ownerId: string;
  apps: AdminAppListItem[];
  categories: AdminCategory[];
  uploads: UploadListItem[];
};

/**
 * The one-screen admin (owner 2026-11-24): drop IPA files anywhere, watch them arrive, then pick a
 * section and a subcategory. Uploads in progress live on the server, so closing the tab loses
 * nothing; byte progress is shown only in the tab that sends the file.
 */
export function AppsBoard({ ownerId, apps: initialApps, categories, uploads }: AppsBoardProps) {
  const router = useRouter();
  const [apps, setApps] = useState(initialApps);
  const [local, setLocal] = useState<Local[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(new Map<string, AbortController>());
  const pickRef = useRef<HTMLInputElement>(null);

  useEffect(() => setApps(initialApps), [initialApps]);
  useEffect(
    () => () => {
      for (const c of active.current.values()) c.abort();
    },
    [],
  );

  // Server-side work still running: look again in a few seconds.
  const pending = uploads.some((u) => u.status !== 'rejected' && u.status !== 'uploading');
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [pending, router]);

  // Files can be dropped anywhere on the page.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth += 1;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      add([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  });

  const update = (key: string, patch: Partial<Local>) =>
    setLocal((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function start(file: File, key: string) {
    if (active.current.has(key)) return;
    const controller = new AbortController();
    active.current.set(key, controller);
    const resume = createResumeStore(ownerId);
    update(key, { running: true, failed: false, text: 'Загружается 0%' });
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
      update(key, { uploadId: result.id, progress: 1, text: 'Проверяем…' });
      while (result.status === 'uploaded' || result.status === 'inspecting') {
        await wait(2000, controller.signal);
        result = await api.get(result.id, controller.signal);
      }
      resume.remove(file);
      if (result.status === 'ready') {
        setLocal((rows) => rows.filter((r) => r.key !== key));
        toast(`${file.name} загружен`);
        router.refresh();
      } else {
        update(key, { failed: true, text: rejectText(result.rejectCode ?? null) });
      }
    } catch (err) {
      update(key, {
        failed: true,
        text: (err as Error).name === 'AbortError' ? 'Пауза. Можно продолжить' : errorText(err),
      });
    } finally {
      active.current.delete(key);
      update(key, { running: false });
    }
  }

  function add(files: File[]) {
    setError('');
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.ipa')) {
        setError(`${file.name}: это не IPA. Сюда загружаются только файлы .ipa`);
        continue;
      }
      if (file.size === 0 || file.size > MAX_IPA) {
        setError(`${file.name}: IPA должен быть до 10 ГБ`);
        continue;
      }
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (active.current.has(key)) continue;
      setLocal((rows) => [
        { key, file, progress: 0, text: 'Подготовка…', running: true },
        ...rows.filter((r) => r.key !== key),
      ]);
      void start(file, key);
    }
  }

  async function dismiss(id: string) {
    try {
      await mutate(`/admin/uploads/${id}`, 'DELETE');
      setLocal((rows) => rows.filter((r) => r.uploadId !== id));
      router.refresh();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  const localIds = new Set(local.map((r) => r.uploadId).filter(Boolean));
  const serverRows = uploads.filter((u) => !localIds.has(u.id));

  return (
    <div className={s.board}>
      {dragging && (
        <div className={s.overlay} aria-hidden="true">
          <p>Отпустите — загрузим</p>
        </div>
      )}
      <section className={s.drop} data-active={dragging || undefined} aria-label="Загрузка IPA">
        <p className={s.dropTitle}>Перетащите IPA сюда</p>
        <p className={s.dropHint}>
          Можно сразу много файлов, в любое место страницы. До 10 ГБ каждый. Если загрузка
          оборвётся, выберите тот же файл — она продолжится.
        </p>
        <button type="button" onClick={() => pickRef.current?.click()}>
          Выбрать файлы
        </button>
        <input
          ref={pickRef}
          type="file"
          accept=".ipa"
          multiple
          hidden
          aria-label="Выбрать IPA"
          onChange={(e) => {
            add([...(e.currentTarget.files ?? [])]);
            e.currentTarget.value = '';
          }}
        />
      </section>
      {error && <p role="alert">{error}</p>}

      {(local.length > 0 || serverRows.length > 0) && (
        <section className={s.section} aria-labelledby="uploads-h">
          <h2 id="uploads-h" className={s.heading}>
            Загружается
          </h2>
          <ul className={s.list} aria-label="Загрузки">
            {local.map((r) => (
              <li key={r.key} className={s.row} aria-label={r.file.name}>
                <span className={s.icon} aria-hidden="true" />
                <div className={s.meta}>
                  <span className={s.sub}>{r.file.name}</span>
                  <span role="status" className={s.pill} data-tone={r.failed ? 'err' : 'info'}>
                    {r.text}
                  </span>
                  {!r.failed && (
                    <progress
                      className={s.progress}
                      max="1"
                      value={r.progress}
                      aria-label={`Загрузка ${r.file.name}`}
                    />
                  )}
                </div>
                <div className={s.actions}>
                  {r.running ? (
                    <button
                      type="button"
                      className={s.link}
                      onClick={() => active.current.get(r.key)?.abort()}
                    >
                      Пауза
                    </button>
                  ) : r.text.startsWith('Не подошло') && r.uploadId ? (
                    <button
                      type="button"
                      className={s.link}
                      onClick={() => dismiss(r.uploadId ?? '')}
                    >
                      Убрать
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={s.link}
                      onClick={() => void start(r.file, r.key)}
                    >
                      Продолжить
                    </button>
                  )}
                </div>
              </li>
            ))}
            {serverRows.map((u) => (
              <li key={u.id} className={s.row} aria-label={u.fileName}>
                <span className={s.icon} aria-hidden="true" />
                <div className={s.meta}>
                  <span className={s.sub}>{u.fileName}</span>
                  <span
                    role="status"
                    className={s.pill}
                    data-tone={
                      u.status === 'rejected' ? 'err' : u.status === 'uploading' ? 'warn' : 'info'
                    }
                  >
                    {u.status === 'rejected'
                      ? rejectText(u.rejectCode)
                      : u.status === 'uploading'
                        ? 'Загрузка прервана. Выберите тот же файл, чтобы продолжить'
                        : 'Проверяем…'}
                  </span>
                </div>
                <div className={s.actions}>
                  {(u.status === 'rejected' || u.status === 'uploading') && (
                    <button type="button" className={s.link} onClick={() => dismiss(u.id)}>
                      Убрать
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={s.section} aria-labelledby="apps-h">
        <h2 id="apps-h" className={s.heading}>
          Приложения
        </h2>
        {apps.length === 0 ? (
          <p className={s.empty}>Здесь появятся приложения из загруженных IPA.</p>
        ) : (
          <ul className={s.list} aria-label="Приложения">
            {apps.map((app) => (
              <AppRow
                key={app.id}
                app={app}
                categories={categories}
                onChange={(next) =>
                  setApps((list) => list.map((a) => (a.id === next.id ? next : a)))
                }
                onRemove={(id) => setApps((list) => list.filter((a) => a.id !== id))}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
