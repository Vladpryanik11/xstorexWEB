import { type FailedJob, QueueName } from '@xstore/shared';
import s from '../../../../src/admin/admin.module.css';
import { FormField } from '../../../../src/admin/FormField';
import { JobsPanel } from '../../../../src/admin/JobsPanel';
import { adminServer } from '../../../../src/admin/server';
import { requireStaff } from '../../../../src/auth/session';

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string }>;
}) {
  const session = await requireStaff('/admin/jobs', false);
  const query = await searchParams;
  const queue = Object.values(QueueName).find((n) => n === query.queue);
  const jobs = await adminServer<FailedJob[]>(`/jobs/failed${queue ? `?queue=${queue}` : ''}`);
  return (
    <>
      <h1>Ошибки заданий</h1>
      <form className={s.tools}>
        <FormField label="Очередь">
          <select name="queue" defaultValue={queue ?? ''}>
            <option value="">Все очереди</option>
            {Object.values(QueueName).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </FormField>
        <button type="submit">Показать</button>
      </form>
      <JobsPanel jobs={jobs} canRetry={session.user.role === 'admin'} />
    </>
  );
}
