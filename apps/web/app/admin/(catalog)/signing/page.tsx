import type { SigningJobAdminView } from '@xstore/shared';
import { SigningJobs } from '../../../../src/admin/SigningJobs';
import { adminServer } from '../../../../src/admin/server';
import { requireStaff } from '../../../../src/auth/session';

export default async function SigningPage() {
  const session = await requireStaff('/admin/signing', false);
  const jobs = await adminServer<SigningJobAdminView[]>('/signing-jobs');
  return (
    <>
      <h1>Подпись</h1>
      <SigningJobs jobs={jobs} canRetry={session.user.role === 'admin'} />
    </>
  );
}
