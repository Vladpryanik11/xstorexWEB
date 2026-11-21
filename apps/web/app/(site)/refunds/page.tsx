import type { Metadata } from 'next';
import { refunds } from '../../../src/legal/documents';
import { LegalDocument } from '../../../src/legal/LegalDocument';

export const metadata: Metadata = {
  title: 'Возврат средств',
  description: 'Когда и как Xstorex возвращает деньги.',
};

export default function RefundsPage() {
  return <LegalDocument doc={refunds} />;
}
