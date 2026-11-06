'use client';
import type { AdminAppListItem, AdminCategory, AdminCollection, Page } from '@xstore/shared';
import Link from 'next/link';
import { useState } from 'react';
import s from './admin.module.css';
import { adminRequest, errorText, mutate, statusLabel } from './api';
import { FormField } from './FormField';

function moved<T>(items: T[], index: number, delta: number): T[] {
  const copy = [...items];
  const item = copy.splice(index, 1)[0];
  if (item !== undefined) copy.splice(index + delta, 0, item);
  return copy;
}

const layouts = [
  ['grid3', 'Строки приложений'],
  ['icons', 'Иконки'],
  ['screenshots', 'Скриншоты'],
  ['banner', 'Баннеры'],
];
const sources = [
  ['manual', 'Вручную'],
  ['top_downloads', 'Самые загружаемые'],
  ['trending', 'Тенденции'],
  ['top_rated', 'Самый рейтинговый'],
  ['recently_updated', 'Недавно обновлённые'],
];

function CollectionFields({ value }: { value?: AdminCollection }) {
  return (
    <div className={s.fields}>
      <FormField label="Название подборки">
        <input name="title" required maxLength={120} defaultValue={value?.title} />
      </FormField>
      <FormField label="Адрес подборки">
        <input
          name="slug"
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          maxLength={80}
          defaultValue={value?.slug}
        />
      </FormField>
      <FormField label="Оформление">
        <select name="layout" defaultValue={value?.layout ?? 'grid3'}>
          {layouts.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Источник приложений">
        <select name="source" defaultValue={value?.source ?? 'manual'}>
          {sources.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Количество приложений">
        <input
          name="limit"
          type="number"
          min="1"
          max="100"
          required
          defaultValue={value?.limit ?? 12}
        />
      </FormField>
      <label>
        <input type="checkbox" name="onHome" defaultChecked={value?.onHome ?? true} /> Показывать на
        главной
      </label>
    </div>
  );
}
function collectionData(form: HTMLFormElement) {
  const f = new FormData(form);
  const slug = String(f.get('slug') ?? '').trim();
  return {
    title: String(f.get('title') ?? '').trim(),
    ...(slug ? { slug } : {}),
    layout: f.get('layout'),
    source: f.get('source'),
    limit: Number(f.get('limit')),
    onHome: f.has('onHome'),
  };
}

export function CategoriesEditor({ initial }: { initial: AdminCategory[] }) {
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = async () => setRows(await adminRequest('/admin/categories'));
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      setMessage('Сохранено');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  function fields(value?: AdminCategory) {
    return (
      <div className={s.fields}>
        <FormField label="Название категории">
          <input name="name" required maxLength={80} defaultValue={value?.name} />
        </FormField>
        <FormField label="Адрес категории">
          <input
            name="slug"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxLength={80}
            defaultValue={value?.slug}
          />
        </FormField>
        <FormField label="Значок">
          <input
            name="icon"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxLength={40}
            defaultValue={value?.icon ?? 'apps'}
          />
        </FormField>
      </div>
    );
  }
  function data(form: HTMLFormElement) {
    const f = new FormData(form);
    const slug = String(f.get('slug') ?? '').trim();
    return {
      name: String(f.get('name') ?? '').trim(),
      icon: String(f.get('icon') ?? '').trim(),
      ...(slug ? { slug } : {}),
    };
  }
  return (
    <>
      <h1>Категории</h1>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <section className={s.card}>
        <h2>Добавить категорию</h2>
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const body = data(form);
            void run(async () => {
              await mutate('/admin/categories', 'POST', body);
              await load();
              form.reset();
            });
          }}
        >
          {fields()}
          <div>
            <button type="submit" disabled={busy}>
              Добавить категорию
            </button>
          </div>
        </form>
      </section>
      {rows.map((row, i) => (
        <section className={s.card} key={row.id}>
          <h2>{row.name}</h2>
          <p>{row.appCount} приложений</p>
          <form
            className={s.form}
            onSubmit={(e) => {
              e.preventDefault();
              const body = data(e.currentTarget);
              void run(async () => {
                await mutate(`/admin/categories/${row.id}`, 'PATCH', body);
                await load();
              });
            }}
          >
            {fields(row)}
            <div>
              <button type="submit" disabled={busy}>
                Сохранить категорию
              </button>
            </div>
          </form>
          <div className={s.tools}>
            {[-1, 1].map((delta) => (
              <button
                type="button"
                key={delta}
                disabled={busy || (delta < 0 ? i === 0 : i === rows.length - 1)}
                aria-label={`${row.name}: ${delta < 0 ? 'выше' : 'ниже'}`}
                onClick={() =>
                  void run(async () =>
                    setRows(
                      await mutate('/admin/categories/order', 'PUT', {
                        ids: moved(rows, i, delta).map((r) => r.id),
                      }),
                    ),
                  )
                }
              >
                {delta < 0 ? 'Выше' : 'Ниже'}
              </button>
            ))}
            <button
              type="submit"
              disabled={busy || row.appCount > 0}
              onClick={() => {
                if (confirm(`Удалить категорию «${row.name}»?`))
                  void run(async () => {
                    await mutate(`/admin/categories/${row.id}`, 'DELETE');
                    await load();
                  });
              }}
            >
              Удалить категорию
            </button>
          </div>
        </section>
      ))}
    </>
  );
}

export function CollectionsEditor({ initial }: { initial: AdminCollection[] }) {
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Подборки</h1>
      {error && <p role="alert">{error}</p>}
      <section className={s.card}>
        <h2>Добавить подборку</h2>
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const body = collectionData(form);
            void run(async () => {
              const created = await mutate<AdminCollection>('/admin/collections', 'POST', body);
              setRows((items) => [...items, created]);
              form.reset();
            });
          }}
        >
          <CollectionFields />
          <div>
            <button type="submit" disabled={busy}>
              Добавить подборку
            </button>
          </div>
        </form>
      </section>
      <ol className={s.items}>
        {rows.map((row, i) => (
          <li key={row.id}>
            <span>
              <Link href={`/admin/collections/${row.id}`}>{row.title}</Link>
              <p>{row.onHome ? 'На главной' : 'Скрыта с главной'}</p>
            </span>
            {[-1, 1].map((delta) => (
              <button
                type="button"
                key={delta}
                disabled={busy || (delta < 0 ? i === 0 : i === rows.length - 1)}
                aria-label={`${row.title}: ${delta < 0 ? 'выше' : 'ниже'}`}
                onClick={() =>
                  void run(async () =>
                    setRows(
                      await mutate('/admin/collections/order', 'PUT', {
                        ids: moved(rows, i, delta).map((r) => r.id),
                      }),
                    ),
                  )
                }
              >
                {delta < 0 ? 'Выше' : 'Ниже'}
              </button>
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm(`Удалить подборку «${row.title}»?`))
                  void run(async () => {
                    await mutate(`/admin/collections/${row.id}`, 'DELETE');
                    setRows((items) => items.filter((x) => x.id !== row.id));
                  });
              }}
            >
              Удалить подборку
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

export function CollectionEditor({ initial }: { initial: AdminCollection }) {
  const [collection, setCollection] = useState(initial);
  const [items, setItems] = useState(initial.items);
  const [results, setResults] = useState<AdminAppListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      setMessage('Сохранено');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>{collection.title}</h1>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <section className={s.card}>
        <h2>Настройки подборки</h2>
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            const body = collectionData(e.currentTarget);
            void run(async () =>
              setCollection(await mutate(`/admin/collections/${collection.id}`, 'PATCH', body)),
            );
          }}
        >
          <CollectionFields value={collection} />
          <div>
            <button type="submit" disabled={busy}>
              Сохранить подборку
            </button>
          </div>
        </form>
      </section>
      <section className={s.card}>
        <h2>Состав и порядок</h2>
        <p className={s.muted}>
          В автоматической подборке закреплённые приложения идут первыми. Сохраните состав после
          изменений.
        </p>
        <form
          className={s.tools}
          onSubmit={(e) => {
            e.preventDefault();
            const q = String(new FormData(e.currentTarget).get('q'));
            void run(async () => {
              const found = await adminRequest<Page<AdminAppListItem>>(
                `/admin/apps?q=${encodeURIComponent(q)}`,
              );
              setResults(found.items);
            });
          }}
        >
          <FormField label="Найти приложение">
            <input name="q" required minLength={2} maxLength={64} type="search" />
          </FormField>
          <button type="submit" disabled={busy}>
            Найти
          </button>
        </form>
        <ul className={s.items} aria-label="Найденные приложения">
          {results.map((app) => (
            <li key={app.id}>
              <span>
                {app.name} ({statusLabel[app.status]})
              </span>
              <button
                type="submit"
                disabled={busy || items.length >= 200 || items.some((x) => x.appId === app.id)}
                onClick={() =>
                  setItems((list) => [
                    ...list,
                    {
                      appId: app.id,
                      name: app.name,
                      slug: app.slug,
                      status: app.status,
                      position: list.length,
                      pinned: collection.source !== 'manual',
                    },
                  ])
                }
              >
                Добавить в подборку
              </button>
            </li>
          ))}
        </ul>
        <ol className={s.items} aria-label="Приложения в подборке">
          {items.map((item, i) => (
            <li key={item.appId}>
              <span>{item.name}</span>
              <label>
                <input
                  type="checkbox"
                  checked={item.pinned}
                  onChange={(e) =>
                    setItems((list) =>
                      list.map((x) =>
                        x.appId === item.appId ? { ...x, pinned: e.target.checked } : x,
                      ),
                    )
                  }
                />{' '}
                Закрепить
              </label>
              <button
                type="button"
                disabled={busy || i === 0}
                aria-label={`${item.name}: выше`}
                onClick={() => setItems((list) => moved(list, i, -1))}
              >
                Выше
              </button>
              <button
                type="button"
                disabled={busy || i === items.length - 1}
                aria-label={`${item.name}: ниже`}
                onClick={() => setItems((list) => moved(list, i, 1))}
              >
                Ниже
              </button>
              <button
                type="button"
                disabled={busy}
                aria-label={`Убрать ${item.name}`}
                onClick={() => setItems((list) => list.filter((x) => x.appId !== item.appId))}
              >
                Убрать
              </button>
            </li>
          ))}
        </ol>
        <div className={s.tools}>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const saved = await mutate<AdminCollection>(
                  `/admin/collections/${collection.id}/items`,
                  'PUT',
                  { items: items.map(({ appId, pinned }) => ({ appId, pinned })) },
                );
                setItems(saved.items);
              })
            }
          >
            Сохранить состав
          </button>
        </div>
      </section>
    </>
  );
}
