'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import s from './admin.module.css';
import { errorText, mutate } from './api';

/** Removes files uploaded by mistake: the device returns to «Ждут сертификата». */
export function DeleteCertificate({ deviceId }: { deviceId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!confirming) {
    return (
      <p>
        <button type="button" className={s.quiet} onClick={() => setConfirming(true)}>
          Удалить файлы
        </button>
      </p>
    );
  }
  return (
    <div className={s.card}>
      <p>Устройство снова попадёт в «Ждут сертификата», покупатель увидит «Обновляем доступ».</p>
      <div className={s.row}>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await mutate(`/admin/devices/${deviceId}/certificate`, 'DELETE');
              setConfirming(false);
              router.refresh();
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          Да, удалить
        </button>
        <button type="button" className={s.quiet} onClick={() => setConfirming(false)}>
          Отмена
        </button>
      </div>
      {error && (
        <p role="alert" className={s.err}>
          {error}
        </p>
      )}
    </div>
  );
}
