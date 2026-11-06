'use client';
import type { FailedJob } from '@xstore/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import s from './admin.module.css';
import { errorText, mutate } from './api';
import { DataTable } from './DataTable';

export function JobsPanel({ jobs, canRetry }: { jobs: FailedJob[]; canRetry: boolean }) {
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
        caption="Задания с ошибками"
        headings={['Очередь', 'Задание', 'Причина', 'Попытки', 'Действия']}
      >
        {jobs.map((job) => (
          <tr key={`${job.queue}:${job.id}`}>
            <td>{job.queue}</td>
            <td>
              {job.name}
              <br />
              {job.id}
            </td>
            <td>{job.failedReason}</td>
            <td>{job.attemptsMade}</td>
            <td>
              {canRetry && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      await mutate(
                        `/admin/jobs/${encodeURIComponent(job.queue)}/${encodeURIComponent(job.id)}/retry`,
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
      {jobs.length === 0 && <p>Заданий с ошибками нет.</p>}
    </>
  );
}
