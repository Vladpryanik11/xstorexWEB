'use client';

import { Button, toast } from '@xstore/ui';

export function ToastDemo() {
  return (
    <Button variant="quiet" onClick={() => toast('Сохранено')}>
      Показать уведомление
    </Button>
  );
}
