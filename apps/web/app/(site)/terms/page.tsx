import type { Metadata } from 'next';
import { terms } from '../../../src/legal/documents';
import { LegalDocument } from '../../../src/legal/LegalDocument';

export const metadata: Metadata = {
  title: 'Пользовательское соглашение',
  description: 'Условия доступа к каталогу приложений Xstorex.',
};

export default function TermsPage() {
  return <LegalDocument doc={terms} />;
}
