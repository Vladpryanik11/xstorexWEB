import type { Metadata } from 'next';
import { privacy } from '../../../src/legal/documents';
import { LegalDocument } from '../../../src/legal/LegalDocument';

export const metadata: Metadata = {
  title: 'Политика конфиденциальности',
  description: 'Какие данные собирает Xstorex и как их защищает.',
};

export default function PrivacyPage() {
  return <LegalDocument doc={privacy} />;
}
