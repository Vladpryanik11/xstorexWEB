import type { ReactNode } from 'react';
import { AdminShell } from '../../../src/admin/AdminShell';
import { getSession } from '../../../src/auth/session';

// Every page performs its own role check, preserving the exact return path on login.
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  return <AdminShell session={await getSession()}>{children}</AdminShell>;
}
