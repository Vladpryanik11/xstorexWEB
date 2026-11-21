import type { Metadata } from 'next';
import { consent } from '../../../src/legal/documents';
import { LegalDocument } from '../../../src/legal/LegalDocument';

export const metadata: Metadata = {
  title: 'Согласие на обработку персональных данных',
  description: 'Согласие на обработку персональных данных покупателя Xstorex.',
};

export default function ConsentPage() {
  return <LegalDocument doc={consent} />;
}
