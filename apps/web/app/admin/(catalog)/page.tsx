import { redirect } from 'next/navigation';
import { requireStaff } from '../../../src/auth/session';

export default async function AdminHome() {
  const session = await requireStaff('/admin', false);
  redirect(session.user.role === 'admin' ? '/admin/apps' : '/admin/jobs');
}
