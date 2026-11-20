'use client';
import { CERT_P12_MAX_BYTES, CERT_PROFILE_MAX_BYTES } from '@xstore/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import s from './admin.module.css';
import { errorText, mutate } from './api';
import { FormField } from './FormField';

type Outcome = { ok: boolean; text: string } | null;

async function base64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Supplier files for one device: `.p12`, its password and `.mobileprovision`. */
export function CertificateUpload({ deviceId }: { deviceId: string }) {
  const router = useRouter();
  const [p12, setP12] = useState<File | null>(null);
  const [profile, setProfile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!p12 || !profile) return;
    setOutcome(null);
    if (p12.size > CERT_P12_MAX_BYTES || profile.size > CERT_PROFILE_MAX_BYTES) {
      setOutcome({ ok: false, text: 'Файл слишком большой' });
      return;
    }
    const form = e.currentTarget;
    const password = String(new FormData(form).get('password') ?? '');
    setBusy(true);
    try {
      await mutate(`/admin/devices/${deviceId}/certificate`, 'POST', {
        p12: await base64(p12),
        password,
        profile: await base64(profile),
      });
      setOutcome({ ok: true, text: 'Сертификат загружен, покупателю отправлено письмо' });
      form.reset();
      setP12(null);
      setProfile(null);
      router.refresh();
    } catch (err) {
      setOutcome({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`${s.card} ${s.form}`} onSubmit={submit} aria-labelledby="cert-title">
      <h2 id="cert-title" className={s.cardTitle}>
        Загрузить сертификат
      </h2>
      {outcome && !outcome.ok && (
        <p role="alert" className={s.err}>
          {outcome.text}
        </p>
      )}
      <div className={s.fields}>
        <FormField label="Файл .p12">
          <input
            type="file"
            accept=".p12,application/x-pkcs12"
            onChange={(e) => setP12(e.currentTarget.files?.[0] ?? null)}
          />
        </FormField>
        <FormField label="Пароль">
          <input name="password" type="password" autoComplete="off" maxLength={128} />
        </FormField>
        <FormField label="Файл .mobileprovision">
          <input
            type="file"
            accept=".mobileprovision"
            onChange={(e) => setProfile(e.currentTarget.files?.[0] ?? null)}
          />
        </FormField>
      </div>
      <p className={s.muted}>Файлы проверяются сразу: пароль, этот iPhone в профиле и сроки.</p>
      <div>
        <button type="submit" disabled={busy || !p12 || !profile}>
          Загрузить
        </button>
      </div>
      <p role="status" className={s.ok}>
        {outcome?.ok ? outcome.text : ''}
      </p>
    </form>
  );
}
