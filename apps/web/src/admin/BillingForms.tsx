'use client';
import { type AdminPlan, formatRuDate, type GrantResult } from '@xstore/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import s from './admin.module.css';
import { errorText, mutate } from './api';
import { FormField } from './FormField';
import { Switch } from './Switch';

type Outcome = { ok: true; text: string } | { ok: false; text: string } | null;

function Result({ value }: { value: Outcome }) {
  if (!value) return null;
  return value.ok ? (
    <p role="status" className={s.ok}>
      {value.text}
    </p>
  ) : (
    <p role="alert" className={s.err}>
      {value.text}
    </p>
  );
}

/** «Тариф»: title, price in whole rubles, on sale or not. Paid orders keep their own price. */
export function PlanForm({ initial }: { initial: AdminPlan }) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setOutcome(null);
    try {
      await mutate<AdminPlan>('/admin/billing/plan', 'PATCH', {
        title: String(form.get('title') ?? ''),
        priceRub: Number(form.get('priceRub')),
        active: form.get('active') === 'on',
      });
      setOutcome({ ok: true, text: 'Сохранено' });
    } catch (err) {
      setOutcome({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`${s.card} ${s.form}`} onSubmit={submit}>
      <div className={s.fields}>
        <FormField label="Название">
          <input name="title" required maxLength={120} defaultValue={initial.title} />
        </FormField>
        <FormField label="Цена, ₽">
          <input
            name="priceRub"
            type="number"
            inputMode="numeric"
            min="1"
            max="1000000"
            step="1"
            required
            defaultValue={initial.priceRub}
          />
        </FormField>
      </div>
      <p className={s.muted}>
        Срок — {initial.durationDays} дней. Новая цена действует для новых оплат, оплаченные заказы
        не меняются.
      </p>
      <Switch name="active" defaultChecked={initial.active}>
        Продаётся на сайте
      </Switch>
      <div>
        <button type="submit" disabled={busy}>
          Сохранить тариф
        </button>
      </div>
      <Result value={outcome} />
    </form>
  );
}

/** Manual grant: N days on an email, after the access that person already has. */
export function GrantForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const el = e.currentTarget;
    const form = new FormData(el);
    const email = String(form.get('email') ?? '').trim();
    setBusy(true);
    setOutcome(null);
    try {
      const res = await mutate<GrantResult>('/admin/billing/grants', 'POST', {
        email,
        days: Number(form.get('days')),
        note: String(form.get('note') ?? ''),
      });
      setOutcome({
        ok: true,
        text: `Доступ выдан: ${email}, до ${formatRuDate(new Date(res.expiresAt))}`,
      });
      el.reset();
      router.refresh();
    } catch (err) {
      setOutcome({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`${s.card} ${s.form}`} onSubmit={submit} aria-labelledby="grant-title">
      <h2 id="grant-title" className={s.cardTitle}>
        Выдать доступ вручную
      </h2>
      <div className={s.fields}>
        <FormField label="Почта">
          <input name="email" type="email" required maxLength={254} autoComplete="off" />
        </FormField>
        <FormField label="Дней">
          <input
            name="days"
            type="number"
            inputMode="numeric"
            min="1"
            max="365"
            step="1"
            required
            defaultValue={30}
          />
        </FormField>
        <FormField label="Комментарий">
          <input name="note" maxLength={500} placeholder="Тестер, компенсация…" />
        </FormField>
      </div>
      <p className={s.muted}>
        Срок продолжит текущий доступ. Если по почте ещё никто не входил, вход появится после кода
        на эту почту.
      </p>
      <div>
        <button type="submit" disabled={busy}>
          Выдать доступ
        </button>
      </div>
      <Result value={outcome} />
    </form>
  );
}

/** Marks a refund already made in the Platega dashboard; the order's access ends. */
export function RefundButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) {
    return (
      <button type="button" className={s.quiet} onClick={() => setOpen(true)}>
        Отметить возврат
      </button>
    );
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await mutate(`/admin/billing/orders/${encodeURIComponent(orderId)}/refund`, 'POST', {
        note: String(form.get('note') ?? ''),
      });
      router.refresh();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form className={s.refund} onSubmit={submit}>
      <p className={s.muted}>
        Деньги возвращаются в кабинете Platega. Здесь доступ заказа закончится.
      </p>
      <FormField label="Комментарий к возврату">
        <input name="note" maxLength={500} />
      </FormField>
      <div className={s.row}>
        <button type="submit" disabled={busy}>
          Подтвердить возврат
        </button>
        <button type="button" className={s.quiet} disabled={busy} onClick={() => setOpen(false)}>
          Отмена
        </button>
      </div>
      {error && (
        <p role="alert" className={s.err}>
          {error}
        </p>
      )}
    </form>
  );
}
