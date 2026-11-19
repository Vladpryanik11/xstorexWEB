import type { AdminPlan } from '@xstore/shared';
import { PlanForm } from '../../../../src/admin/BillingForms';
import { adminServer } from '../../../../src/admin/server';
import { requireStaff } from '../../../../src/auth/session';

export default async function PlanPage() {
  await requireStaff('/admin/plan');
  const plan = await adminServer<AdminPlan>('/billing/plan');
  return (
    <>
      <h1>Тариф</h1>
      <PlanForm initial={plan} />
    </>
  );
}
