'use client';
import { errorMessages, type SigningJobAdminView, stageLabel } from '@xstore/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import s from './admin.module.css';
import { errorText, mutate } from './api';
import { DataTable } from './DataTable';

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    dateStyle: 'short',
    timeStyle: 'short',
  });

const seconds = (job: SigningJobAdminView) =>
  job.finishedAt
    ? `${Math.max(0, Math.round((Date.parse(job.finishedAt) - Date.parse(job.createdAt)) / 1000))} с`
    : '—';

/** Н4 admin «Подпись»: the last signings; the admin retries a failed one. */
export function SigningJobs({
  jobs,
  canRetry,
}: {
  jobs: SigningJobAdminView[];
  canRetry: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <div className={s.tools}>
        <button type="button" onClick={() => router.refresh()}>
          Обновить
        </button>
      </div>
      <DataTable
        caption="Последние подписи, новые сверху"
        headings={['Приложение', 'Покупатель', 'Этап', 'Начата', 'Длительность', 'Действия']}
        stack
      >
        {jobs.map((job) => (
          <tr key={job.id}>
            <td data-label="Приложение">
              {job.app} <span className={s.muted}>{job.version}</span>
            </td>
            <td data-label="Покупатель">{job.email ?? '—'}</td>
            <td data-label="Этап">
              <span
                className={s.badge}
                data-tone={
                  job.stage === 'ready' ? 'ok' : job.stage === 'failed' ? 'err' : undefined
                }
              >
                {stageLabel[job.stage]}
              </span>
              {job.errorCode && (
                <div className={s.muted} data-tone="err">
                  {errorMessages[job.errorCode as keyof typeof errorMessages] ?? job.errorCode}
                </div>
              )}
            </td>
            <td data-label="Начата">{dateTime(job.createdAt)}</td>
            <td data-label="Длительность">{seconds(job)}</td>
            <td data-label="Действия">
              {canRetry && job.stage === 'failed' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      await mutate(
                        `/admin/signing-jobs/${encodeURIComponent(job.id)}/retry`,
                        'POST',
                      );
                      router.refresh();
                    } catch (err) {
                      setError(errorText(err));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Повторить
                </button>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      {jobs.length === 0 && <p>Подписей ещё не было.</p>}
    </>
  );
}
