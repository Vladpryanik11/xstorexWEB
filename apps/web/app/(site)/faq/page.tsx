import type { Metadata } from 'next';
import { FaqList } from '../../../src/faq/FaqList';

export const metadata: Metadata = {
  title: 'Вопросы',
  description: 'Ответы на частые вопросы о подписке Xstorex, подключении iPhone и установке.',
};

export default function FaqPage() {
  return <FaqList />;
}
